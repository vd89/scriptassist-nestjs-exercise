import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, SelectQueryBuilder } from 'typeorm';
import { Task } from './entities/task.entity';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { TaskStatus } from './enums/task-status.enum';
import { TaskFilterDto } from './dto/task-filter.dto';
import { In, ILike } from 'typeorm';
import { PaginatedResponseDto } from '../../common/dto/pagination-response.dto';

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    @InjectRepository(Task)
    private tasksRepository: Repository<Task>,
    @InjectQueue('task-processing')
    private taskQueue: Queue,
    private dataSource: DataSource,
  ) {}

  async create(createTaskDto: CreateTaskDto): Promise<Task> {
    // Use transaction to ensure atomicity
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    
    try {
      const task = this.tasksRepository.create(createTaskDto);
      const savedTask = await queryRunner.manager.save(task);
      
      // Add to queue with error handling
      await this.taskQueue.add('task-status-update', {
        taskId: savedTask.id,
        status: savedTask.status,
      }, { 
        attempts: 3,
        backoff: { 
          type: 'exponential',
          delay: 1000
        }
      });
      
      await queryRunner.commitTransaction();
      return savedTask;
    } catch (error: any) {
      this.logger.error(`Failed to create task: ${error.message}`);
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async findAll(filterDto?: TaskFilterDto, user?: any): Promise<PaginatedResponseDto<Task>> {
    const { 
      status, 
      priority, 
      userId, 
      search,
      startDate,
      endDate,
      page = 1,
      limit = 10 
    } = filterDto || {};
    
    // If user is not admin, override any userId filter to show only their tasks
    const effectiveUserId = (user && user.role !== 'admin') ? user.id : userId;
    
    const queryBuilder = this.buildTaskQuery(
      status, 
      priority, 
      effectiveUserId, 
      search,
      startDate,
      endDate
    );
    
    // Add pagination
    const skip = (page - 1) * limit;
    queryBuilder.skip(skip).take(limit);
    
    // Execute query with count
    const [data, total] = await queryBuilder.getManyAndCount();
    
    return PaginatedResponseDto.create(data, total, { page, limit });
  }

  // Helper method to build query with filters
  private buildTaskQuery(
    status?: TaskStatus, 
    priority?: string, 
    userId?: string, 
    search?: string,
    startDate?: string,
    endDate?: string
  ): SelectQueryBuilder<Task> {
    const queryBuilder = this.tasksRepository.createQueryBuilder('task')
      .leftJoinAndSelect('task.user', 'user');
    
    if (status) {
      queryBuilder.andWhere('task.status = :status', { status });
    }
    
    if (priority) {
      queryBuilder.andWhere('task.priority = :priority', { priority });
    }
    
    if (userId) {
      queryBuilder.andWhere('task.userId = :userId', { userId });
    }
    
    if (search) {
      queryBuilder.andWhere(
        '(task.title LIKE :search OR task.description LIKE :search)',
        { search: `%${search}%` }
      );
    }
    
    if (startDate) {
      queryBuilder.andWhere('task.dueDate >= :startDate', { startDate });
    }
    
    if (endDate) {
      queryBuilder.andWhere('task.dueDate <= :endDate', { endDate });
    }
    
    return queryBuilder;
  }

  async findOne(id: string, user?: any): Promise<Task> {
    const whereCondition: Record<string, any> = { id };
    
    // If user is provided and not an admin, only show their own tasks
    if (user && user.role !== 'admin') {
      whereCondition.userId = user.id;
    }
    
    const task = await this.tasksRepository.findOne({
      where: whereCondition,
      relations: ['user'],
    });
    
    if (!task) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }
    
    return task;
  }

  async update(id: string, updateTaskDto: UpdateTaskDto, user?: any): Promise<Task> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    
    try {
      const task = await this.findOne(id, user);
      const originalStatus = task.status;
      
      // Use spread operator to update only provided fields
      const updatedTask = {
        ...task,
        ...updateTaskDto,
      };
      
      const result = await queryRunner.manager.save(Task, updatedTask);
      
      // Add to queue if status changed
      if (originalStatus !== result.status) {
        await this.taskQueue.add(
          'task-status-update',
          {
            taskId: result.id,
            status: result.status,
          },
          { 
            attempts: 3,
            backoff: { 
              type: 'exponential',
              delay: 1000
            }
          }
        );
      }
      
      await queryRunner.commitTransaction();
      return result;
    } catch (error: any) {
      this.logger.error(`Failed to update task: ${error.message}`);
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async remove(id: string, user?: any): Promise<void> {
    const task = await this.findOne(id, user);
    await this.tasksRepository.remove(task);
  }

  async findByName(name: string, user: any): Promise<Task[]> {
    // Create search query with TypeScript type safety
    const whereCondition: Record<string, any> = {
      title: ILike(`%${name}%`),
    };
    
    // If not admin, only show the user's own tasks
    if (user.role !== 'admin') {
      whereCondition.userId = user.id;
    }
    
    const response = await this.tasksRepository.find({
      where: whereCondition,
      relations: ['user']
    });
    return response;
  }

  async getTaskStatistics(): Promise<any> {
    // Efficient approach: Use SQL aggregation for statistics
    const stats = await this.tasksRepository
      .createQueryBuilder('task')
      .select('COUNT(*)', 'total')
      .addSelect(
        'SUM(CASE WHEN task.status = :completed THEN 1 ELSE 0 END)',
        'completed'
      )
      .addSelect(
        'SUM(CASE WHEN task.status = :inProgress THEN 1 ELSE 0 END)',
        'inProgress'
      )
      .addSelect(
        'SUM(CASE WHEN task.status = :pending THEN 1 ELSE 0 END)',
        'pending'
      )
      .addSelect(
        'SUM(CASE WHEN task.priority = :high THEN 1 ELSE 0 END)',
        'highPriority'
      )
      .setParameters({
        completed: TaskStatus.COMPLETED,
        inProgress: TaskStatus.IN_PROGRESS,
        pending: TaskStatus.PENDING,
        high: 'HIGH',
      })
      .getRawOne();
    
    return {
      total: parseInt(stats.total, 10) || 0,
      completed: parseInt(stats.completed, 10) || 0,
      inProgress: parseInt(stats.inProgress, 10) || 0,
      pending: parseInt(stats.pending, 10) || 0,
      highPriority: parseInt(stats.highPriority, 10) || 0,
    };
  }

  async findByStatus(status: TaskStatus): Promise<Task[]> {
    return this.tasksRepository.find({ where: { status } });
  }

  async updateStatus(id: string, status: string): Promise<Task> {
    const task = await this.findOne(id);
    task.status = status as TaskStatus;
    return this.tasksRepository.save(task);
  }

  async batchProcessTasks(taskIds: string[], action: string, user?: any): Promise<any[]> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    
    try {
      const results = [];
      
      // Get all tasks in a single query to avoid N+1 problem
      // If not admin, only allow processing own tasks
      const where: Record<string, any> = { id: In(taskIds) };
      if (user && user.role !== 'admin') {
        where.userId = user.id;
      }
      
      const tasksToProcess = await this.tasksRepository.findBy(where);
      
      // Map for quick lookup
      const taskMap = new Map(
        tasksToProcess.map(task => [task.id, task])
      );
      
      for (const taskId of taskIds) {
        const task = taskMap.get(taskId);
        
        if (!task) {
          results.push({ 
            taskId, 
            success: false, 
            error: 'Task not found or not authorized' 
          });
          continue;
        }
        
        try {
          let result;
          
          switch (action) {
            case 'complete':
              task.status = TaskStatus.COMPLETED;
              result = await queryRunner.manager.save(Task, task);
              break;
            case 'delete':
              result = await queryRunner.manager.remove(Task, task);
              break;
            default:
              throw new Error(`Unknown action: ${action}`);
          }
          
          results.push({ taskId, success: true, result });
        } catch (error: any) {
          results.push({ 
            taskId, 
            success: false, 
            error: error.message 
          });
        }
      }
      
      await queryRunner.commitTransaction();
      return results;
    } catch (error: any) {
      this.logger.error(`Failed to batch process tasks: ${error.message}`);
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}

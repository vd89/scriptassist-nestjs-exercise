import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, FindOptionsWhere, Like, Between, In, LessThan } from 'typeorm';
import { Task } from './entities/task.entity';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { TaskStatus } from './enums/task-status.enum';
import { TaskFilterDto } from './dto/task-filter.dto';
import { PaginatedResponse } from '../../types/pagination.interface';
import { CacheService } from '../../common/services/cache.service';
import { ServiceError } from '../../types/http-response.interface';

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    @InjectRepository(Task)
    private tasksRepository: Repository<Task>,
    @InjectQueue('task-processing')
    private taskQueue: Queue,
    private dataSource: DataSource,
    private cacheService: CacheService,
  ) {}

  /**
   * Create a new task with proper transaction handling
   */
  async create(createTaskDto: CreateTaskDto): Promise<Task> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Create the task
      const task = this.tasksRepository.create(createTaskDto);
      const savedTask = await queryRunner.manager.save(task);

      // Add to queue
      await this.taskQueue.add(
        'task-status-update',
        {
          taskId: savedTask.id,
          status: savedTask.status,
        },
        {
          removeOnComplete: true,
          removeOnFail: 5000, // Keep failed jobs for debugging
        },
      );

      // Commit transaction
      await queryRunner.commitTransaction();

      // Clear any cached task lists that might include this task
      await this.invalidateTaskCache();

      return savedTask;
    } catch (error: unknown) {
      // Rollback transaction on error
      await queryRunner.rollbackTransaction();
      const serviceError = error as ServiceError;
      this.logger.error(`Failed to create task: ${serviceError.message}`, serviceError.stack);
      throw error;
    } finally {
      // Release query runner
      await queryRunner.release();
    }
  }

  /**
   * Find tasks with filtering and pagination
   * Efficiently implemented using TypeORM query builder
   */
  async findAll(filterDto: TaskFilterDto): Promise<PaginatedResponse<Task>> {
    const {
      status,
      priority,
      userId,
      search,
      dueDateStart,
      dueDateEnd,
      createdAtStart,
      createdAtEnd,
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'DESC',
    } = filterDto;

    // Calculate offset
    const skip = (page - 1) * limit;

    // Try to get from cache first
    const cacheKey = `tasks:${JSON.stringify(filterDto)}`;
    const cachedResult = await this.cacheService.get<PaginatedResponse<Task>>(cacheKey);
    if (cachedResult) {
      return cachedResult;
    }

    // Build query with all filters
    const queryBuilder = this.tasksRepository
      .createQueryBuilder('task')
      .leftJoinAndSelect('task.user', 'user');

    // Apply filters conditionally
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
      queryBuilder.andWhere('(task.title ILIKE :search OR task.description ILIKE :search)', {
        search: `%${search}%`,
      });
    }

    if (dueDateStart) {
      queryBuilder.andWhere('task.dueDate >= :dueDateStart', { dueDateStart });
    }

    if (dueDateEnd) {
      queryBuilder.andWhere('task.dueDate <= :dueDateEnd', { dueDateEnd });
    }

    if (createdAtStart) {
      queryBuilder.andWhere('task.createdAt >= :createdAtStart', { createdAtStart });
    }

    if (createdAtEnd) {
      queryBuilder.andWhere('task.createdAt <= :createdAtEnd', { createdAtEnd });
    }

    // Add sorting
    const allowedSortFields = ['title', 'status', 'priority', 'dueDate', 'createdAt', 'updatedAt'];
    const actualSortField = allowedSortFields.includes(sortBy) ? sortBy : 'createdAt';
    queryBuilder.orderBy(`task.${actualSortField}`, sortOrder);

    // Get total count for pagination
    const total = await queryBuilder.getCount();

    // Apply pagination
    queryBuilder.skip(skip).take(limit);

    // Execute query
    const tasks = await queryBuilder.getMany();

    // Prepare paginated response
    const result: PaginatedResponse<Task> = {
      data: tasks,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };

    // Cache result for 1 minute
    await this.cacheService.set(cacheKey, result, 60);

    return result;
  }

  /**
   * Get task by ID with optimized query
   */
  async findOne(id: string): Promise<Task> {
    // Try to get from cache first
    const cacheKey = `task:${id}`;
    const cachedTask = await this.cacheService.get<Task>(cacheKey);
    if (cachedTask) {
      return cachedTask;
    }

    // Get from database if not cached
    const task = await this.tasksRepository.findOne({
      where: { id },
      relations: ['user'],
    });

    if (!task) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }

    // Cache for 5 minutes
    await this.cacheService.set(cacheKey, task, 300);

    return task;
  }

  /**
   * Find overdue tasks with pagination
   * Used by the overdue tasks processor
   */
  async findOverdueTasks(page = 1, limit = 100): Promise<PaginatedResponse<Task>> {
    const now = new Date();
    const skip = (page - 1) * limit;

    // Build query for overdue tasks
    const queryBuilder = this.tasksRepository
      .createQueryBuilder('task')
      .leftJoinAndSelect('task.user', 'user')
      .where('task.dueDate < :now', { now })
      .andWhere('task.status = :status', { status: TaskStatus.PENDING })
      .orderBy('task.dueDate', 'ASC'); // Process oldest overdue tasks first

    // Get total count for pagination
    const total = await queryBuilder.getCount();

    // Apply pagination
    queryBuilder.skip(skip).take(limit);

    // Execute query
    const tasks = await queryBuilder.getMany();

    // Return paginated response
    return {
      data: tasks,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Update a task with proper transaction handling
   */
  async update(id: string, updateTaskDto: UpdateTaskDto): Promise<Task> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Get current task first
      const task = await queryRunner.manager.findOne(Task, {
        where: { id },
      });

      if (!task) {
        throw new NotFoundException(`Task with ID ${id} not found`);
      }

      const originalStatus = task.status;

      // Update task fields
      queryRunner.manager.merge(Task, task, updateTaskDto);
      const updatedTask = await queryRunner.manager.save(task);

      // Add to queue if status changed
      if (originalStatus !== updatedTask.status) {
        await this.taskQueue.add(
          'task-status-update',
          {
            taskId: updatedTask.id,
            status: updatedTask.status,
          },
          {
            removeOnComplete: true,
            removeOnFail: 5000,
          },
        );
      }

      // Commit transaction
      await queryRunner.commitTransaction();

      // Clear cache
      await this.cacheService.delete(`task:${id}`);
      await this.invalidateTaskCache();

      return updatedTask;
    } catch (error: unknown) {
      // Rollback transaction on error
      await queryRunner.rollbackTransaction();
      const serviceError = error as ServiceError;
      this.logger.error(`Failed to update task ${id}: ${serviceError.message}`, serviceError.stack);
      throw error;
    } finally {
      // Release query runner
      await queryRunner.release();
    }
  }

  /**
   * Remove a task with transaction handling
   */
  async remove(id: string): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Check if task exists
      const task = await queryRunner.manager.findOne(Task, {
        where: { id },
      });

      if (!task) {
        throw new NotFoundException(`Task with ID ${id} not found`);
      }

      // Delete the task
      await queryRunner.manager.remove(task);

      // Commit transaction
      await queryRunner.commitTransaction();

      // Clear cache
      await this.cacheService.delete(`task:${id}`);
      await this.invalidateTaskCache();
    } catch (error: unknown) {
      // Rollback transaction on error
      await queryRunner.rollbackTransaction();
      const serviceError = error as ServiceError;
      this.logger.error(`Failed to delete task ${id}: ${serviceError.message}`, serviceError.stack);
      throw error;
    } finally {
      // Release query runner
      await queryRunner.release();
    }
  }

  /**
   * Find tasks by status with optimized query
   */
  async findByStatus(status: TaskStatus): Promise<Task[]> {
    // Use proper repository method instead of raw query
    return this.tasksRepository.find({
      where: { status },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Update task status (used by task processor)
   */
  async updateStatus(id: string, status: string): Promise<Task> {
    const task = await this.findOne(id);
    task.status = status as TaskStatus;

    // Clear cache
    await this.cacheService.delete(`task:${id}`);
    await this.invalidateTaskCache();

    return this.tasksRepository.save(task);
  }

  /**
   * Get task statistics with optimized query
   */
  async getStats(userId?: string): Promise<any> {
    // Use query builder with aggregations
    const queryBuilder = this.tasksRepository.createQueryBuilder('task');

    // Filter by user if provided
    if (userId) {
      queryBuilder.where('task.userId = :userId', { userId });
    }

    // Get total count
    const total = await queryBuilder.getCount();

    // Get counts by status
    const statusCounts = await this.tasksRepository
      .createQueryBuilder('task')
      .select('task.status, COUNT(*) as count')
      .groupBy('task.status')
      .getRawMany();

    // Get counts by priority
    const priorityCounts = await this.tasksRepository
      .createQueryBuilder('task')
      .select('task.priority, COUNT(*) as count')
      .groupBy('task.priority')
      .getRawMany();

    // Format results
    const statusMap = statusCounts.reduce((acc, curr) => {
      acc[curr.status] = parseInt(curr.count, 10);
      return acc;
    }, {});

    const priorityMap = priorityCounts.reduce((acc, curr) => {
      acc[curr.priority] = parseInt(curr.count, 10);
      return acc;
    }, {});

    return {
      total,
      completed: statusMap[TaskStatus.COMPLETED] || 0,
      inProgress: statusMap[TaskStatus.IN_PROGRESS] || 0,
      pending: statusMap[TaskStatus.PENDING] || 0,
      highPriority: priorityMap['HIGH'] || 0,
      mediumPriority: priorityMap['MEDIUM'] || 0,
      lowPriority: priorityMap['LOW'] || 0,
    };
  }

  /**
   * Batch process multiple tasks efficiently
   */
  async batchProcess(taskIds: string[], action: string): Promise<any[]> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const results = [];

      // First, get all tasks in a single query
      const tasks = await queryRunner.manager.find(Task, {
        where: { id: In(taskIds) },
      });

      // Create a map for quick lookup
      const taskMap = new Map(tasks.map(task => [task.id, task]));

      // Process based on action
      switch (action) {
        case 'complete':
          // Bulk update all tasks to completed
          await queryRunner.manager.update(
            Task,
            { id: In(taskIds) },
            { status: TaskStatus.COMPLETED },
          );

          // Add queue jobs for each task
          for (const taskId of taskIds) {
            if (taskMap.has(taskId)) {
              await this.taskQueue.add(
                'task-status-update',
                {
                  taskId,
                  status: TaskStatus.COMPLETED,
                },
                {
                  removeOnComplete: true,
                },
              );

              results.push({
                taskId,
                success: true,
                message: 'Task marked as completed',
              });
            } else {
              results.push({
                taskId,
                success: false,
                message: 'Task not found',
              });
            }
          }
          break;

        case 'delete':
          // Delete all tasks in one query
          await queryRunner.manager.delete(Task, taskIds);

          for (const taskId of taskIds) {
            if (taskMap.has(taskId)) {
              results.push({
                taskId,
                success: true,
                message: 'Task deleted successfully',
              });
            } else {
              results.push({
                taskId,
                success: false,
                message: 'Task not found',
              });
            }
          }
          break;

        default:
          throw new Error(`Unknown action: ${action}`);
      }

      // Commit transaction
      await queryRunner.commitTransaction();

      // Clear cache for affected tasks
      for (const taskId of taskIds) {
        await this.cacheService.delete(`task:${taskId}`);
      }
      await this.invalidateTaskCache();

      return results;
    } catch (error: unknown) {
      // Rollback transaction on error
      await queryRunner.rollbackTransaction();
      const serviceError = error as ServiceError;
      this.logger.error(`Batch process failed: ${serviceError.message}`, serviceError.stack);
      throw error;
    } finally {
      // Release query runner
      await queryRunner.release();
    }
  }

  /**
   * Helper to invalidate task cache patterns
   */
  private async invalidateTaskCache(): Promise<void> {
    // Clear any cached task lists
    await this.cacheService.clear();
  }
}

import {
  Injectable,
  NotFoundException,
  HttpException,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { CacheService } from '@common/services/cache.service';

import { Task } from './entities/task.entity';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { TaskStatus } from './enums/task-status.enum';
import { TaskPriority } from './enums/task-priority.enum';
import { User } from '../users/entities/user.entity';
import {
  ITaskStatistics,
  IPaginatedTasks,
  IBatchProcessRequest,
  IBatchProcessResult,
} from './interfaces/tasks.interface';

@Injectable()
export class TasksService {
  constructor(
    @InjectRepository(Task)
    private tasksRepository: Repository<Task>,

    @InjectQueue('task-processing')
    private taskQueue: Queue, // BullMQ queue for background processing

    private dataSource: DataSource, // Used for wrapping DB operations in transactions
    private readonly cacheService: CacheService,
  ) {}

  // Cache key helpers
  private getTaskCacheKey(id: string): string {
    return `task:${id}`;
  }

  private getUserTasksCacheKey(userId: string): string {
    return `user:${userId}:tasks`;
  }

  private getTasksListCacheKey(): string {
    return 'tasks:list';
  }

  /**
   * Creates a new task associated with a user.
   * - Ensures user exists before task creation.
   * - Uses a DB transaction to keep user lookup and task creation atomic.
   * - Adds a job to a BullMQ queue for async processing (e.g., notifications or logs).
   */
  async create(createTaskDto: CreateTaskDto): Promise<Task> {
    return await this.dataSource.transaction(async manager => {
      // Validate that the user exists before creating a task
      const user = await manager.findOne(User, {
        where: { id: createTaskDto.userId },
      });

      if (!user) {
        throw new NotFoundException({
          message: `User with ID ${createTaskDto.userId} not found`,
          error: 'User Not Found',
        });
      }

      try {
        // Create and save the new task in the database
        const task = manager.create(Task, createTaskDto);
        const savedTask = await manager.save(Task, task);

        // Enqueue background job for task status updates (e.g. notification, audit)
        await this.taskQueue.add('task-status-update', {
          taskId: savedTask.id,
          status: savedTask.status,
        });

        // Cache the new task
        await this.cacheService.set(this.getTaskCacheKey(savedTask.id), savedTask);
        
        // Invalidate related caches
        await this.cacheService.delete(this.getUserTasksCacheKey(createTaskDto.userId));
        await this.cacheService.delete(this.getTasksListCacheKey());

        return savedTask;
      } catch (error: unknown) {
        throw new BadRequestException({
          message: 'Failed to create task',
          error: 'Task Creation Failed',
          details: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });
  }

  /**
   * Returns all tasks with related user info.
   */
  async findAll(): Promise<Task[]> {
    // Try to get from cache first
    const cachedTasks = await this.cacheService.get<Task[]>(this.getTasksListCacheKey());
    if (cachedTasks) {
      return cachedTasks;
    }

    // If not in cache, get from database
    const tasks = await this.tasksRepository.find({
      relations: ['user'],
    });
    
    // Cache the result
    await this.cacheService.set(this.getTasksListCacheKey(), tasks);
    
    return tasks;
  }

  /**
   * Fetches tasks with optional filtering by status/priority and supports pagination.
   * Optimized with a dynamic query builder and efficient pagination.
   */
  async findAllWithFilters(
    status?: string,
    priority?: string,
    page?: number,
    limit?: number,
  ): Promise<IPaginatedTasks> {
    try {
      const query = this.tasksRepository
        .createQueryBuilder('task')
        .leftJoinAndSelect('task.user', 'user'); // Join with user table

      // Apply status filter if provided
      if (status) {
        if (!Object.values(TaskStatus).includes(status as TaskStatus)) {
          throw new BadRequestException({
            message: `Invalid status value: ${status}`,
            error: 'Invalid Status',
            validStatuses: Object.values(TaskStatus),
          });
        }
        query.andWhere('task.status = :status', { status });
      }

      // Apply priority filter if provided
      if (priority) {
        if (!Object.values(TaskPriority).includes(priority as TaskPriority)) {
          throw new BadRequestException({
            message: `Invalid priority value: ${priority}`,
            error: 'Invalid Priority',
            validPriorities: Object.values(TaskPriority),
          });
        }
        query.andWhere('task.priority = :priority', { priority });
      }

      // Set pagination defaults and apply skip/take
      page = Number(page) || 1;
      limit = Number(limit) || 10;

      if (page < 1 || limit < 1) {
        throw new BadRequestException({
          message: 'Page and limit must be positive numbers',
          error: 'Invalid Pagination Parameters',
        });
      }

      query.skip((page - 1) * limit).take(limit);

      // Execute query and get both data and count in one go
      const [data, count] = await query.getManyAndCount();

      return {
        data,
        count,
        page,
        limit,
      };
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException({
        message: 'Failed to fetch tasks',
        error: 'Task Fetch Failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Returns task statistics using PostgreSQL filters for efficient counting.
   * Optimized to avoid multiple DB round-trips using a single raw query.
   */
  async getStatistics(): Promise<ITaskStatistics> {
    // Use raw SQL aggregation to get counts by status and priority in a single query
    const result = await this.tasksRepository
      .createQueryBuilder('task')
      .select([
        'COUNT(*) AS total',
        `COUNT(*) FILTER (WHERE task.status = '${TaskStatus.COMPLETED}') AS completed`,
        `COUNT(*) FILTER (WHERE task.status = '${TaskStatus.IN_PROGRESS}') AS inProgress`,
        `COUNT(*) FILTER (WHERE task.status = '${TaskStatus.PENDING}') AS pending`,
        `COUNT(*) FILTER (WHERE task.priority = '${TaskPriority.HIGH}') AS highPriority`,
      ])
      .getRawOne();

    // Convert string results into numbers for response
    return {
      total: parseInt(result.total, 10),
      completed: parseInt(result.completed, 10),
      inProgress: parseInt(result.inProgress, 10),
      pending: parseInt(result.pending, 10),
      highPriority: parseInt(result.highPriority, 10),
    };
  }

  /**
   * Returns a single task by ID with its related user.
   */
  async findOne(id: string): Promise<Task> {
    try {
      // Try to get from cache first
      const cachedTask = await this.cacheService.get<Task>(this.getTaskCacheKey(id));
      if (cachedTask) {
        return cachedTask;
      }

      // Lookup task by ID including its related user
      const task = await this.tasksRepository.findOne({
        where: { id },
        relations: ['user'],
      });

      if (!task) {
        throw new NotFoundException({
          message: `Task with ID ${id} not found`,
          error: 'Task Not Found',
        });
      }

      // Cache the result
      await this.cacheService.set(this.getTaskCacheKey(id), task);

      return task;
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException({
        message: 'Failed to fetch task',
        error: 'Task Fetch Failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Updates a task using a transaction.
   * Enqueues a background job if the status has changed.
   */
  async update(id: string, updateTaskDto: UpdateTaskDto): Promise<Task> {
    return await this.dataSource.transaction(async manager => {
      try {
        // Retrieve the task and its user relation
        const task = await manager.findOne(Task, {
          where: { id },
          relations: ['user'],
        });

        if (!task) {
          throw new NotFoundException({
            message: `Task with ID ${id} not found`,
            error: 'Task Not Found',
          });
        }

        const originalStatus = task.status;

        // Apply updates to the task
        Object.assign(task, updateTaskDto);

        // Save the updated task
        const updatedTask = await manager.save(Task, task);

        // If the status changed, enqueue a job to handle status update
        if (originalStatus !== updatedTask.status) {
          await this.taskQueue.add('task-status-update', {
            taskId: updatedTask.id,
            status: updatedTask.status,
          });
        }

        // Update cache
        await this.cacheService.set(this.getTaskCacheKey(id), updatedTask);
        
        // Invalidate related caches
        await this.cacheService.delete(this.getUserTasksCacheKey(task.userId));
        await this.cacheService.delete(this.getTasksListCacheKey());

        return updatedTask;
      } catch (error: unknown) {
        if (error instanceof HttpException) {
          throw error;
        }
        throw new HttpException({
          message: 'Failed to update task',
          error: 'Task Update Failed',
          details: error instanceof Error ? error.message : 'Unknown error',
        }, HttpStatus.INTERNAL_SERVER_ERROR);
      }
    });
  }

  /**
   * Deletes a task by ID.
   * Throws error if task does not exist.
   */
  async remove(id: string): Promise<{ message: string }> {
    try {
      // Check if task exists before deletion
      const task = await this.tasksRepository.findOne({ where: { id } });

      if (!task) {
        throw new NotFoundException({
          message: `Task with ID ${id} not found`,
          error: 'Task Not Found',
        });
      }

      // Remove task from the database
      await this.tasksRepository.remove(task);

      // Remove from cache
      await this.cacheService.delete(this.getTaskCacheKey(id));
      
      // Invalidate related caches
      await this.cacheService.delete(this.getUserTasksCacheKey(task.userId));
      await this.cacheService.delete(this.getTasksListCacheKey());

      return { message: `Task with ID ${id} has been successfully deleted.` };
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException({
        message: 'Failed to delete task',
        error: 'Task Deletion Failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Batch processes tasks for common actions like complete/delete.
   * Optimized using `whereInIds` to perform bulk DB operations instead of looping over each task.
   */
  async batchProcessTasks(operations: IBatchProcessRequest): Promise<IBatchProcessResult[]> {
    const { tasks: taskIds, action } = operations;

    if (!taskIds.length) {
      throw new BadRequestException({
        message: 'No task IDs provided',
        error: 'Invalid Batch Operation',
      });
    }

    try {
      switch (action) {
        case 'complete': {
          // Bulk update task statuses to completed
          await this.tasksRepository
            .createQueryBuilder()
            .update(Task)
            .set({ status: TaskStatus.COMPLETED })
            .whereInIds(taskIds)
            .execute();

          return taskIds.map(taskId => ({
            taskId,
            success: true,
            result: 'Marked as completed',
          }));
        }

        case 'delete': {
          // Bulk delete tasks
          await this.tasksRepository
            .createQueryBuilder()
            .delete()
            .from(Task)
            .whereInIds(taskIds)
            .execute();

          return taskIds.map(taskId => ({
            taskId,
            success: true,
            result: 'Deleted successfully',
          }));
        }

        default:
          throw new BadRequestException({
            message: `Unknown action: ${action}`,
            error: 'Invalid Action',
            validActions: ['complete', 'delete'],
          });
      }
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }
      return taskIds.map(taskId => ({
        taskId,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }));
    }
  }

  /**
   * Updates only the status of a task by ID.
   * Simple, single-purpose method for more granular control.
   */
  async updateStatus(id: string, status: string): Promise<Task> {
    try {
      if (!Object.values(TaskStatus).includes(status as TaskStatus)) {
        throw new BadRequestException({
          message: `Invalid status value: ${status}`,
          error: 'Invalid Status',
          validStatuses: Object.values(TaskStatus),
        });
      }

      // Find task by ID
      const task = await this.tasksRepository.findOneBy({ id });

      if (!task) {
        throw new NotFoundException({
          message: `Task with ID ${id} not found`,
          error: 'Task Not Found',
        });
      }

      // Update status and save
      task.status = status as TaskStatus;
      return this.tasksRepository.save(task);
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException({
        message: 'Failed to update task status',
        error: 'Status Update Failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Finds all tasks by a specific status.
   * Includes user relation for context.
   */
  async findByStatus(status: TaskStatus): Promise<Task[]> {
    try {
      if (!Object.values(TaskStatus).includes(status)) {
        throw new BadRequestException({
          message: `Invalid status value: ${status}`,
          error: 'Invalid Status',
          validStatuses: Object.values(TaskStatus),
        });
      }

      // Return tasks that match a specific status along with the user
      return this.tasksRepository.find({
        where: { status },
        relations: ['user'],
      });
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException({
        message: 'Failed to fetch tasks by status',
        error: 'Task Fetch Failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}

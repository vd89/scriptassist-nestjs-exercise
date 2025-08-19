import { Injectable, Inject } from '@nestjs/common';
import { ApplicationService, Query, ServiceResult } from '../interfaces/application-service.interface';
import { CrossCuttingConcernsService } from './cross-cutting-concerns.service';
import { TASK_REPOSITORY } from '../../domain/repositories/repository.tokens';
import { TaskRepository, TaskFilters, PaginationOptions, PaginatedResult } from '../../domain/repositories/task.repository.interface';
import { Task, TaskStatus, TaskPriority } from '../../domain/entities/task.entity';
import { EntityId } from '../../domain/value-objects/entity-id.value-object';
import {
  TaskSpecificationFactory,
  TaskByUserSpecification,
  TaskByStatusSpecification,
  OverdueTaskSpecification
} from '../../domain/specifications/task.specifications';
import { v4 as uuidv4 } from 'uuid';

/**
 * Query to get task by ID
 */
export class GetTaskByIdQuery implements Query {
  readonly queryId: string = uuidv4();
  readonly timestamp: Date = new Date();

  constructor(
    public readonly taskId: string,
    public readonly userId?: string
  ) {}
}

/**
 * Query to get tasks with filters
 */
export class GetTasksQuery implements Query {
  readonly queryId: string = uuidv4();
  readonly timestamp: Date = new Date();

  constructor(
    public readonly filters?: TaskFilters,
    public readonly pagination?: PaginationOptions,
    public readonly userId?: string
  ) {}
}

/**
 * Query to get user's tasks
 */
export class GetUserTasksQuery implements Query {
  readonly queryId: string = uuidv4();
  readonly timestamp: Date = new Date();

  constructor(
    public readonly userId: string,
    public readonly status?: TaskStatus,
    public readonly pagination?: PaginationOptions
  ) {}
}

/**
 * Query to get overdue tasks
 */
export class GetOverdueTasksQuery implements Query {
  readonly queryId: string = uuidv4();
  readonly timestamp: Date = new Date();

  constructor(
    public readonly userId?: string,
    public readonly pagination?: PaginationOptions
  ) {}
}

/**
 * Query to get task statistics
 */
export class GetTaskStatisticsQuery implements Query {
  readonly queryId: string = uuidv4();
  readonly timestamp: Date = new Date();

  constructor(
    public readonly userId?: string,
    public readonly dateRange?: {
      start: Date;
      end: Date;
    }
  ) {}
}

/**
 * Query to search tasks
 */
export class SearchTasksQuery implements Query {
  readonly queryId: string = uuidv4();
  readonly timestamp: Date = new Date();

  constructor(
    public readonly searchTerm: string,
    public readonly filters?: Partial<TaskFilters>,
    public readonly pagination?: PaginationOptions,
    public readonly userId?: string
  ) {}
}

/**
 * Query to get high priority tasks for user
 */
export class GetHighPriorityTasksQuery implements Query {
  readonly queryId: string = uuidv4();
  readonly timestamp: Date = new Date();

  constructor(
    public readonly userId: string,
    public readonly pagination?: PaginationOptions
  ) {}
}

/**
 * Application service for task queries
 */
@Injectable()
export class TaskQueryService implements ApplicationService {
  constructor(
    private readonly crossCuttingConcerns: CrossCuttingConcernsService,
    @Inject(TASK_REPOSITORY)
    private readonly taskRepository: TaskRepository
  ) {}

  getServiceName(): string {
    return 'TaskQueryService';
  }

  async getTaskById(query: GetTaskByIdQuery): Promise<ServiceResult<Task>> {
    const startTime = Date.now();
    this.crossCuttingConcerns.log('info', 'Getting task by ID', {
      queryId: query.queryId,
      taskId: query.taskId
    });

    try {
      // Try cache first
      const cacheKey = `task:${query.taskId}`;
      let task = await this.crossCuttingConcerns.cache.get<Task>(cacheKey);

      if (!task) {
        const taskId = EntityId.fromString(query.taskId);
        task = await this.taskRepository.findById(taskId);

        if (task) {
          // Cache for 5 minutes
          await this.crossCuttingConcerns.cache.set(cacheKey, task, 300);
        }
      }

      if (!task) {
        return {
          success: false,
          error: 'Task not found'
        };
      }

      // Record metrics
      this.crossCuttingConcerns.recordMetric('task.query.get_by_id', 1, {
        taskId: query.taskId,
        fromCache: task ? 'true' : 'false'
      });

      this.crossCuttingConcerns.log('info', 'Task retrieved successfully', {
        queryId: query.queryId,
        taskId: query.taskId,
        duration: Date.now() - startTime
      });

      return {
        success: true,
        data: task,
        metadata: {
          queryId: query.queryId,
          duration: Date.now() - startTime
        }
      };

    } catch (error) {
      this.crossCuttingConcerns.log('error', 'Failed to get task by ID', {
        queryId: query.queryId,
        taskId: query.taskId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  async getTasks(query: GetTasksQuery): Promise<ServiceResult<PaginatedResult<Task>>> {
    const startTime = Date.now();
    this.crossCuttingConcerns.log('info', 'Getting tasks with filters', {
      queryId: query.queryId,
      filters: query.filters
    });

    try {
      // Try cache first
      const cacheKey = `tasks:${JSON.stringify({ filters: query.filters, pagination: query.pagination })}`;
      let result = await this.crossCuttingConcerns.cache.get<PaginatedResult<Task>>(cacheKey);

      if (!result) {
        result = await this.taskRepository.findAll(query.filters, query.pagination);

        // Cache for 1 minute
        await this.crossCuttingConcerns.cache.set(cacheKey, result, 60);
      }

      // Record metrics
      this.crossCuttingConcerns.recordMetric('task.query.get_all', 1, {
        resultCount: result.data.length.toString(),
        fromCache: result ? 'true' : 'false'
      });

      this.crossCuttingConcerns.log('info', 'Tasks retrieved successfully', {
        queryId: query.queryId,
        count: result.data.length,
        total: result.meta.total,
        duration: Date.now() - startTime
      });

      return {
        success: true,
        data: result,
        metadata: {
          queryId: query.queryId,
          duration: Date.now() - startTime
        }
      };

    } catch (error) {
      this.crossCuttingConcerns.log('error', 'Failed to get tasks', {
        queryId: query.queryId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  async getUserTasks(query: GetUserTasksQuery): Promise<ServiceResult<Task[]>> {
    const startTime = Date.now();
    this.crossCuttingConcerns.log('info', 'Getting user tasks', {
      queryId: query.queryId,
      userId: query.userId,
      status: query.status
    });

    try {
      // Try cache first
      const cacheKey = `user_tasks:${query.userId}:${query.status || 'all'}`;
      let tasks = await this.crossCuttingConcerns.cache.get<Task[]>(cacheKey);

      if (!tasks) {
        const userId = EntityId.fromString(query.userId);

        if (query.status) {
          // Use specification pattern for complex queries
          const spec = TaskSpecificationFactory.createActiveTasksForUser(userId);
          tasks = await this.taskRepository.findBySpecification(spec);
        } else {
          tasks = await this.taskRepository.findByUserId(userId);
        }

        // Cache for 2 minutes
        await this.crossCuttingConcerns.cache.set(cacheKey, tasks, 120);
      }

      // Record metrics
      this.crossCuttingConcerns.recordMetric('task.query.get_user_tasks', 1, {
        userId: query.userId,
        status: query.status || 'all',
        resultCount: tasks.length.toString()
      });

      this.crossCuttingConcerns.log('info', 'User tasks retrieved successfully', {
        queryId: query.queryId,
        userId: query.userId,
        count: tasks.length,
        duration: Date.now() - startTime
      });

      return {
        success: true,
        data: tasks,
        metadata: {
          queryId: query.queryId,
          duration: Date.now() - startTime
        }
      };

    } catch (error) {
      this.crossCuttingConcerns.log('error', 'Failed to get user tasks', {
        queryId: query.queryId,
        userId: query.userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  async getOverdueTasks(query: GetOverdueTasksQuery): Promise<ServiceResult<PaginatedResult<Task>>> {
    const startTime = Date.now();
    this.crossCuttingConcerns.log('info', 'Getting overdue tasks', {
      queryId: query.queryId,
      userId: query.userId
    });

    try {
      let result: PaginatedResult<Task>;

      if (query.userId) {
        // Use specification pattern for user-specific overdue tasks
        const userId = EntityId.fromString(query.userId);
        const spec = TaskSpecificationFactory.createOverdueTasksForUser(userId);
        const tasks = await this.taskRepository.findBySpecification(spec);

        result = {
          data: tasks,
          meta: {
            total: tasks.length,
            page: 1,
            limit: tasks.length,
            totalPages: 1
          }
        };
      } else {
        result = await this.taskRepository.findOverdueTasks(query.pagination);
      }

      // Record metrics
      this.crossCuttingConcerns.recordMetric('task.query.get_overdue', 1, {
        userId: query.userId || 'all',
        resultCount: result.data.length.toString()
      });

      this.crossCuttingConcerns.log('info', 'Overdue tasks retrieved successfully', {
        queryId: query.queryId,
        userId: query.userId,
        count: result.data.length,
        duration: Date.now() - startTime
      });

      return {
        success: true,
        data: result,
        metadata: {
          queryId: query.queryId,
          duration: Date.now() - startTime
        }
      };

    } catch (error) {
      this.crossCuttingConcerns.log('error', 'Failed to get overdue tasks', {
        queryId: query.queryId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  async getTaskStatistics(query: GetTaskStatisticsQuery): Promise<ServiceResult<any>> {
    const startTime = Date.now();
    this.crossCuttingConcerns.log('info', 'Getting task statistics', {
      queryId: query.queryId,
      userId: query.userId
    });

    try {
      // Try cache first
      const cacheKey = `task_stats:${query.userId || 'all'}:${query.dateRange ? JSON.stringify(query.dateRange) : 'all_time'}`;
      let statistics = await this.crossCuttingConcerns.cache.get<any>(cacheKey);

      if (!statistics) {
        const userId = query.userId ? EntityId.fromString(query.userId) : undefined;

        // Build statistics
        statistics = {
          total: 0,
          byStatus: {} as Record<TaskStatus, number>,
          byPriority: {} as Record<TaskPriority, number>,
          overdue: 0,
          completedThisMonth: 0,
          averageCompletionTime: 0
        };

        // Get tasks for statistics
        let tasks: Task[];
        if (userId) {
          tasks = await this.taskRepository.findByUserId(userId);
        } else {
          const result = await this.taskRepository.findAll();
          tasks = result.data;
        }

        // Filter by date range if provided
        if (query.dateRange) {
          tasks = tasks.filter(task =>
            task.createdAt >= query.dateRange!.start &&
            task.createdAt <= query.dateRange!.end
          );
        }

        // Calculate statistics
        statistics.total = tasks.length;

        // Group by status
        for (const status of Object.values(TaskStatus)) {
          statistics.byStatus[status] = tasks.filter(task => task.status === status).length;
        }

        // Group by priority
        for (const priority of Object.values(TaskPriority)) {
          statistics.byPriority[priority] = tasks.filter(task => task.priority === priority).length;
        }

        // Count overdue tasks
        const now = new Date();
        statistics.overdue = tasks.filter(task =>
          task.dueDate?.value &&
          task.dueDate.value < now &&
          task.status !== TaskStatus.COMPLETED
        ).length;

        // Count completed this month
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        statistics.completedThisMonth = tasks.filter(task =>
          task.status === TaskStatus.COMPLETED &&
          task.updatedAt >= startOfMonth
        ).length;

        // Calculate average completion time (simplified)
        const completedTasks = tasks.filter(task => task.status === TaskStatus.COMPLETED);
        if (completedTasks.length > 0) {
          const totalTime = completedTasks.reduce((sum, task) => {
            const completionTime = task.updatedAt.getTime() - task.createdAt.getTime();
            return sum + completionTime;
          }, 0);
          statistics.averageCompletionTime = Math.round(totalTime / completedTasks.length / (1000 * 60 * 60 * 24)); // in days
        }

        // Cache for 10 minutes
        await this.crossCuttingConcerns.cache.set(cacheKey, statistics, 600);
      }

      // Record metrics
      this.crossCuttingConcerns.recordMetric('task.query.get_statistics', 1, {
        userId: query.userId || 'all',
        totalTasks: statistics.total.toString()
      });

      this.crossCuttingConcerns.log('info', 'Task statistics retrieved successfully', {
        queryId: query.queryId,
        userId: query.userId,
        totalTasks: statistics.total,
        duration: Date.now() - startTime
      });

      return {
        success: true,
        data: statistics,
        metadata: {
          queryId: query.queryId,
          duration: Date.now() - startTime
        }
      };

    } catch (error) {
      this.crossCuttingConcerns.log('error', 'Failed to get task statistics', {
        queryId: query.queryId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  async searchTasks(query: SearchTasksQuery): Promise<ServiceResult<PaginatedResult<Task>>> {
    const startTime = Date.now();
    this.crossCuttingConcerns.log('info', 'Searching tasks', {
      queryId: query.queryId,
      searchTerm: query.searchTerm
    });

    try {
      // Build filters for search
      const filters: TaskFilters = {
        search: query.searchTerm,
        ...query.filters
      };

      const result = await this.taskRepository.findAll(filters, query.pagination);

      // Record metrics
      this.crossCuttingConcerns.recordMetric('task.query.search', 1, {
        searchTerm: query.searchTerm,
        resultCount: result.data.length.toString()
      });

      this.crossCuttingConcerns.log('info', 'Task search completed successfully', {
        queryId: query.queryId,
        searchTerm: query.searchTerm,
        count: result.data.length,
        duration: Date.now() - startTime
      });

      return {
        success: true,
        data: result,
        metadata: {
          queryId: query.queryId,
          duration: Date.now() - startTime
        }
      };

    } catch (error) {
      this.crossCuttingConcerns.log('error', 'Failed to search tasks', {
        queryId: query.queryId,
        searchTerm: query.searchTerm,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  async getHighPriorityTasks(query: GetHighPriorityTasksQuery): Promise<ServiceResult<Task[]>> {
    const startTime = Date.now();
    this.crossCuttingConcerns.log('info', 'Getting high priority tasks', {
      queryId: query.queryId,
      userId: query.userId
    });

    try {
      // Try cache first
      const cacheKey = `high_priority_tasks:${query.userId}`;
      let tasks = await this.crossCuttingConcerns.cache.get<Task[]>(cacheKey);

      if (!tasks) {
        const userId = EntityId.fromString(query.userId);
        const spec = TaskSpecificationFactory.createHighPriorityTasksForUser(userId);
        tasks = await this.taskRepository.findBySpecification(spec);

        // Cache for 5 minutes
        await this.crossCuttingConcerns.cache.set(cacheKey, tasks, 300);
      }

      // Record metrics
      this.crossCuttingConcerns.recordMetric('task.query.get_high_priority', 1, {
        userId: query.userId,
        resultCount: tasks.length.toString()
      });

      this.crossCuttingConcerns.log('info', 'High priority tasks retrieved successfully', {
        queryId: query.queryId,
        userId: query.userId,
        count: tasks.length,
        duration: Date.now() - startTime
      });

      return {
        success: true,
        data: tasks,
        metadata: {
          queryId: query.queryId,
          duration: Date.now() - startTime
        }
      };

    } catch (error) {
      this.crossCuttingConcerns.log('error', 'Failed to get high priority tasks', {
        queryId: query.queryId,
        userId: query.userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }
}

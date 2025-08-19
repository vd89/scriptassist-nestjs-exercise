import { Injectable, NotFoundException, Logger, Inject } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { TaskFilterDto } from './dto/task-filter.dto';
import { TaskDomainService } from '../../domain/services/task-domain.service';
import { Task, TaskStatus, TaskPriority } from '../../domain/entities/task.entity';
import { EntityId } from '../../domain/value-objects/entity-id.value-object';
import { TaskRepository, PaginatedResult } from '../../domain/repositories/task.repository.interface';
import { UserRepository } from '../../domain/repositories/user.repository.interface';
import { TASK_REPOSITORY, USER_REPOSITORY } from '../../domain/repositories/repository.tokens';
import { CacheService } from '../../common/services/cache.service';

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    private readonly taskDomainService: TaskDomainService,
    @Inject(TASK_REPOSITORY)
    private readonly taskRepository: TaskRepository,
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
    @InjectQueue('task-processing')
    private taskQueue: Queue,
    private cacheService: CacheService,
  ) {}

  async create(createTaskDto: CreateTaskDto): Promise<Task> {
    try {
      const task = await this.taskDomainService.createTask({
        title: createTaskDto.title,
        description: createTaskDto.description,
        priority: createTaskDto.priority as TaskPriority,
        dueDate: createTaskDto.dueDate,
        userId: createTaskDto.userId,
      });

      // Add to queue for processing
      await this.taskQueue.add(
        'task-status-update',
        {
          taskId: task.id.value,
          status: task.status,
        },
        {
          removeOnComplete: true,
          removeOnFail: 5000,
        },
      );

      // Clear cache
      await this.invalidateTaskCache();

      return task;
    } catch (error: unknown) {
      this.logger.error(`Failed to create task: ${(error as Error).message}`, (error as Error).stack);
      throw error;
    }
  }

  async findAll(filterDto: TaskFilterDto): Promise<PaginatedResult<Task>> {
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

    // Try to get from cache first
    const cacheKey = `tasks:${JSON.stringify(filterDto)}`;
    const cachedResult = await this.cacheService.get<PaginatedResult<Task>>(cacheKey);
    if (cachedResult) {
      return cachedResult;
    }

    const filters = {
      status: status as TaskStatus,
      priority: priority as TaskPriority,
      userId: userId ? EntityId.fromString(userId) : undefined,
      search,
      dueDateStart: dueDateStart ? new Date(dueDateStart) : undefined,
      dueDateEnd: dueDateEnd ? new Date(dueDateEnd) : undefined,
      createdAtStart: createdAtStart ? new Date(createdAtStart) : undefined,
      createdAtEnd: createdAtEnd ? new Date(createdAtEnd) : undefined,
    };

    const pagination = {
      page,
      limit,
      sortBy,
      sortOrder: sortOrder as 'ASC' | 'DESC',
    };

    const result = await this.taskRepository.findAll(filters, pagination);

    // Cache result for 1 minute
    await this.cacheService.set(cacheKey, result, 60);

    return result;
  }

  async findOne(id: string): Promise<Task> {
    // Try to get from cache first
    const cacheKey = `task:${id}`;
    const cachedTask = await this.cacheService.get<Task>(cacheKey);
    if (cachedTask) {
      return cachedTask;
    }

    const taskId = EntityId.fromString(id);
    const task = await this.taskRepository.findById(taskId);

    if (!task) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }

    // Cache for 5 minutes
    await this.cacheService.set(cacheKey, task, 300);

    return task;
  }

  async findOverdueTasks(page = 1, limit = 100): Promise<PaginatedResult<Task>> {
    return await this.taskRepository.findOverdueTasks({ page, limit });
  }

  async update(
    id: string, 
    updateTaskDto: UpdateTaskDto, 
    updatedByUserId: string
  ): Promise<Task> {
    try {
      const taskId = EntityId.fromString(id);
      const updatedByEntityId = EntityId.fromString(updatedByUserId);

      const task = await this.taskDomainService.updateTask(
        taskId,
        {
          title: updateTaskDto.title,
          description: updateTaskDto.description,
          priority: updateTaskDto.priority as TaskPriority,
          dueDate: updateTaskDto.dueDate,
        },
        updatedByEntityId,
      );

      // Add to queue if status might have changed
      await this.taskQueue.add(
        'task-status-update',
        {
          taskId: task.id.value,
          status: task.status,
        },
        {
          removeOnComplete: true,
          removeOnFail: 5000,
        },
      );

      // Clear cache
      await this.cacheService.delete(`task:${id}`);
      await this.invalidateTaskCache();

      return task;
    } catch (error: unknown) {
      this.logger.error(`Failed to update task ${id}: ${(error as Error).message}`, (error as Error).stack);
      throw error;
    }
  }

  async updateStatus(
    id: string, 
    status: string, 
    updatedByUserId: string
  ): Promise<Task> {
    try {
      const taskId = EntityId.fromString(id);
      const updatedByEntityId = EntityId.fromString(updatedByUserId);

      const task = await this.taskDomainService.changeTaskStatus(
        taskId,
        status as TaskStatus,
        updatedByEntityId,
      );

      // Clear cache
      await this.cacheService.delete(`task:${id}`);
      await this.invalidateTaskCache();

      return task;
    } catch (error: unknown) {
      this.logger.error(`Failed to update task status ${id}: ${(error as Error).message}`, (error as Error).stack);
      throw error;
    }
  }

  async remove(id: string, deletedByUserId: string): Promise<void> {
    try {
      const taskId = EntityId.fromString(id);
      const deletedByEntityId = EntityId.fromString(deletedByUserId);

      await this.taskDomainService.deleteTask(taskId, deletedByEntityId);

      // Clear cache
      await this.cacheService.delete(`task:${id}`);
      await this.invalidateTaskCache();
    } catch (error: unknown) {
      this.logger.error(`Failed to delete task ${id}: ${(error as Error).message}`, (error as Error).stack);
      throw error;
    }
  }

  async findByStatus(status: TaskStatus): Promise<Task[]> {
    return await this.taskRepository.findByStatus(status);
  }

  async getStats(userId?: string): Promise<any> {
    const userEntityId = userId ? EntityId.fromString(userId) : undefined;
    return await this.taskDomainService.getTaskStatistics(userEntityId);
  }

  async batchProcess(
    taskIds: string[], 
    action: string, 
    processedByUserId: string
  ): Promise<any[]> {
    const entityIds = taskIds.map(id => EntityId.fromString(id));
    const processedByEntityId = EntityId.fromString(processedByUserId);

    try {
      const results = [];

      switch (action) {
        case 'complete':
          const bulkResult = await this.taskDomainService.bulkUpdateTaskStatus(
            entityIds,
            TaskStatus.COMPLETED,
            processedByEntityId,
          );

          // Format results
          for (const taskId of entityIds) {
            if (bulkResult.success.some(id => id.equals(taskId))) {
              results.push({
                taskId: taskId.value,
                success: true,
                message: 'Task marked as completed',
              });
            } else {
              const failure = bulkResult.failed.find(f => f.id.equals(taskId));
              results.push({
                taskId: taskId.value,
                success: false,
                message: failure?.reason || 'Unknown error',
              });
            }
          }
          break;

        case 'delete':
          for (const taskId of entityIds) {
            try {
              await this.taskDomainService.deleteTask(taskId, processedByEntityId);
              results.push({
                taskId: taskId.value,
                success: true,
                message: 'Task deleted successfully',
              });
            } catch (error) {
              results.push({
                taskId: taskId.value,
                success: false,
                message: error instanceof Error ? error.message : 'Unknown error',
              });
            }
          }
          break;

        default:
          throw new Error(`Unknown action: ${action}`);
      }

      // Clear cache for affected tasks
      for (const taskId of taskIds) {
        await this.cacheService.delete(`task:${taskId}`);
      }
      await this.invalidateTaskCache();

      return results;
    } catch (error: unknown) {
      this.logger.error(`Batch process failed: ${(error as Error).message}`, (error as Error).stack);
      throw error;
    }
  }

  async assignTaskToUser(
    taskId: string,
    newUserId: string,
    assignedByUserId: string,
  ): Promise<Task> {
    const taskEntityId = EntityId.fromString(taskId);
    const newUserEntityId = EntityId.fromString(newUserId);
    const assignedByEntityId = EntityId.fromString(assignedByUserId);

    const task = await this.taskDomainService.assignTaskToUser(
      taskEntityId,
      newUserEntityId,
      assignedByEntityId,
    );

    // Clear cache
    await this.cacheService.delete(`task:${taskId}`);
    await this.invalidateTaskCache();

    return task;
  }

  private async invalidateTaskCache(): Promise<void> {
    // Clear any cached task lists
    await this.cacheService.clear();
  }
}

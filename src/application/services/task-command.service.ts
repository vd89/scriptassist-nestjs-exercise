import { Injectable, Inject } from '@nestjs/common';
import { ApplicationService, Command, ServiceResult } from '../interfaces/application-service.interface';
import { CrossCuttingConcernsService } from './cross-cutting-concerns.service';
import { UnitOfWorkWithRepositories } from '../../domain/interfaces/unit-of-work.interface';
import { UNIT_OF_WORK } from '../../infrastructure/persistence/unit-of-work/typeorm-unit-of-work.service';
import { TaskDomainService } from '../../domain/services/task-domain.service';
import { TASK_REPOSITORY } from '../../domain/repositories/repository.tokens';
import { TaskRepository } from '../../domain/repositories/task.repository.interface';
import { Task, TaskStatus, TaskPriority } from '../../domain/entities/task.entity';
import { EntityId } from '../../domain/value-objects/entity-id.value-object';
import { v4 as uuidv4 } from 'uuid';

/**
 * Command to create a new task
 */
export class CreateTaskCommand implements Command {
  readonly commandId: string = uuidv4();
  readonly timestamp: Date = new Date();

  constructor(
    public readonly title: string,
    public readonly description: string,
    public readonly priority: TaskPriority,
    public readonly dueDate: Date,
    public readonly userId: string,
    public readonly createdByUserId: string
  ) {}
}

/**
 * Command to update a task
 */
export class UpdateTaskCommand implements Command {
  readonly commandId: string = uuidv4();
  readonly timestamp: Date = new Date();

  constructor(
    public readonly taskId: string,
    public readonly title?: string,
    public readonly description?: string,
    public readonly priority?: TaskPriority,
    public readonly dueDate?: Date,
    public readonly updatedByUserId?: string
  ) {}
}

/**
 * Command to change task status
 */
export class ChangeTaskStatusCommand implements Command {
  readonly commandId: string = uuidv4();
  readonly timestamp: Date = new Date();

  constructor(
    public readonly taskId: string,
    public readonly status: TaskStatus,
    public readonly userId: string
  ) {}
}

/**
 * Command to delete a task
 */
export class DeleteTaskCommand implements Command {
  readonly commandId: string = uuidv4();
  readonly timestamp: Date = new Date();

  constructor(
    public readonly taskId: string,
    public readonly deletedByUserId: string
  ) {}
}

/**
 * Command to assign task to user
 */
export class AssignTaskCommand implements Command {
  readonly commandId: string = uuidv4();
  readonly timestamp: Date = new Date();

  constructor(
    public readonly taskId: string,
    public readonly newUserId: string,
    public readonly assignedByUserId: string
  ) {}
}

/**
 * Command to bulk update task status
 */
export class BulkUpdateTaskStatusCommand implements Command {
  readonly commandId: string = uuidv4();
  readonly timestamp: Date = new Date();

  constructor(
    public readonly taskIds: string[],
    public readonly status: TaskStatus,
    public readonly updatedByUserId: string
  ) {}
}

/**
 * Application service for task commands
 */
@Injectable()
export class TaskCommandService implements ApplicationService {
  constructor(
    private readonly crossCuttingConcerns: CrossCuttingConcernsService,
    private readonly taskDomainService: TaskDomainService,
    @Inject(UNIT_OF_WORK)
    private readonly unitOfWork: UnitOfWorkWithRepositories,
    @Inject(TASK_REPOSITORY)
    private readonly taskRepository: TaskRepository
  ) {}

  getServiceName(): string {
    return 'TaskCommandService';
  }

  async createTask(command: CreateTaskCommand): Promise<ServiceResult<Task>> {
    const startTime = Date.now();
    this.crossCuttingConcerns.log('info', 'Creating task', { 
      commandId: command.commandId,
      title: command.title 
    });

    try {
      // Validation
      if (!await this.crossCuttingConcerns.validate(command)) {
        return {
          success: false,
          error: 'Invalid command data'
        };
      }

      // Execute within transaction
      const task = await this.unitOfWork.execute(async () => {
        return await this.taskDomainService.createTask({
          title: command.title,
          description: command.description,
          priority: command.priority,
          dueDate: command.dueDate,
          userId: command.userId
        });
      });

      // Clear cache
      await this.crossCuttingConcerns.cache.delete(`user_tasks:${command.userId}`);

      // Record metrics
      this.crossCuttingConcerns.recordMetric('task.created', 1, {
        priority: command.priority.toString(),
        userId: command.userId
      });

      this.crossCuttingConcerns.log('info', 'Task created successfully', {
        commandId: command.commandId,
        taskId: task.id.value,
        duration: Date.now() - startTime
      });

      return {
        success: true,
        data: task,
        metadata: {
          commandId: command.commandId,
          duration: Date.now() - startTime
        }
      };

    } catch (error) {
      this.crossCuttingConcerns.log('error', 'Failed to create task', {
        commandId: command.commandId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  async updateTask(command: UpdateTaskCommand): Promise<ServiceResult<Task>> {
    const startTime = Date.now();
    this.crossCuttingConcerns.log('info', 'Updating task', { 
      commandId: command.commandId,
      taskId: command.taskId 
    });

    try {
      // Validation
      if (!await this.crossCuttingConcerns.validate(command)) {
        return {
          success: false,
          error: 'Invalid command data'
        };
      }

      // Execute within transaction
      const task = await this.unitOfWork.execute(async () => {
        const taskId = EntityId.fromString(command.taskId);
        const updatedByUserId = EntityId.fromString(command.updatedByUserId!);

        return await this.taskDomainService.updateTask(
          taskId,
          {
            title: command.title,
            description: command.description,
            priority: command.priority,
            dueDate: command.dueDate
          },
          updatedByUserId
        );
      });

      // Clear cache
      await this.crossCuttingConcerns.cache.delete(`task:${command.taskId}`);
      await this.crossCuttingConcerns.cache.delete(`user_tasks:${task.userId.value}`);

      // Record metrics
      this.crossCuttingConcerns.recordMetric('task.updated', 1, {
        taskId: command.taskId
      });

      this.crossCuttingConcerns.log('info', 'Task updated successfully', {
        commandId: command.commandId,
        taskId: command.taskId,
        duration: Date.now() - startTime
      });

      return {
        success: true,
        data: task,
        metadata: {
          commandId: command.commandId,
          duration: Date.now() - startTime
        }
      };

    } catch (error) {
      this.crossCuttingConcerns.log('error', 'Failed to update task', {
        commandId: command.commandId,
        taskId: command.taskId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  async changeTaskStatus(command: ChangeTaskStatusCommand): Promise<ServiceResult<Task>> {
    const startTime = Date.now();
    this.crossCuttingConcerns.log('info', 'Changing task status', { 
      commandId: command.commandId,
      taskId: command.taskId,
      status: command.status
    });

    try {
      // Validation
      if (!await this.crossCuttingConcerns.validate(command)) {
        return {
          success: false,
          error: 'Invalid command data'
        };
      }

      // Execute within transaction
      const task = await this.unitOfWork.execute(async () => {
        const taskId = EntityId.fromString(command.taskId);
        const userId = EntityId.fromString(command.userId);

        return await this.taskDomainService.changeTaskStatus(
          taskId,
          command.status,
          userId
        );
      });

      // Clear cache
      await this.crossCuttingConcerns.cache.delete(`task:${command.taskId}`);
      await this.crossCuttingConcerns.cache.delete(`user_tasks:${task.userId.value}`);

      // Record metrics
      this.crossCuttingConcerns.recordMetric('task.status_changed', 1, {
        taskId: command.taskId,
        status: command.status
      });

      this.crossCuttingConcerns.log('info', 'Task status changed successfully', {
        commandId: command.commandId,
        taskId: command.taskId,
        status: command.status,
        duration: Date.now() - startTime
      });

      return {
        success: true,
        data: task,
        metadata: {
          commandId: command.commandId,
          duration: Date.now() - startTime
        }
      };

    } catch (error) {
      this.crossCuttingConcerns.log('error', 'Failed to change task status', {
        commandId: command.commandId,
        taskId: command.taskId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  async deleteTask(command: DeleteTaskCommand): Promise<ServiceResult<void>> {
    const startTime = Date.now();
    this.crossCuttingConcerns.log('info', 'Deleting task', { 
      commandId: command.commandId,
      taskId: command.taskId 
    });

    try {
      // Validation
      if (!await this.crossCuttingConcerns.validate(command)) {
        return {
          success: false,
          error: 'Invalid command data'
        };
      }

      // Get task first to clear user cache
      const taskId = EntityId.fromString(command.taskId);
      const task = await this.taskRepository.findById(taskId);
      
      if (!task) {
        return {
          success: false,
          error: 'Task not found'
        };
      }

      // Execute within transaction
      await this.unitOfWork.execute(async () => {
        const deletedByUserId = EntityId.fromString(command.deletedByUserId);
        await this.taskDomainService.deleteTask(taskId, deletedByUserId);
      });

      // Clear cache
      await this.crossCuttingConcerns.cache.delete(`task:${command.taskId}`);
      await this.crossCuttingConcerns.cache.delete(`user_tasks:${task.userId.value}`);

      // Record metrics
      this.crossCuttingConcerns.recordMetric('task.deleted', 1, {
        taskId: command.taskId
      });

      this.crossCuttingConcerns.log('info', 'Task deleted successfully', {
        commandId: command.commandId,
        taskId: command.taskId,
        duration: Date.now() - startTime
      });

      return {
        success: true,
        metadata: {
          commandId: command.commandId,
          duration: Date.now() - startTime
        }
      };

    } catch (error) {
      this.crossCuttingConcerns.log('error', 'Failed to delete task', {
        commandId: command.commandId,
        taskId: command.taskId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  async assignTask(command: AssignTaskCommand): Promise<ServiceResult<Task>> {
    const startTime = Date.now();
    this.crossCuttingConcerns.log('info', 'Assigning task', { 
      commandId: command.commandId,
      taskId: command.taskId,
      newUserId: command.newUserId
    });

    try {
      // Validation
      if (!await this.crossCuttingConcerns.validate(command)) {
        return {
          success: false,
          error: 'Invalid command data'
        };
      }

      // Execute within transaction
      const task = await this.unitOfWork.execute(async () => {
        const taskId = EntityId.fromString(command.taskId);
        const newUserId = EntityId.fromString(command.newUserId);
        const assignedByUserId = EntityId.fromString(command.assignedByUserId);

        return await this.taskDomainService.assignTaskToUser(
          taskId,
          newUserId,
          assignedByUserId
        );
      });

      // Clear cache for both old and new users
      await this.crossCuttingConcerns.cache.delete(`task:${command.taskId}`);
      await this.crossCuttingConcerns.cache.delete(`user_tasks:${task.userId.value}`);
      await this.crossCuttingConcerns.cache.delete(`user_tasks:${command.newUserId}`);

      // Record metrics
      this.crossCuttingConcerns.recordMetric('task.assigned', 1, {
        taskId: command.taskId,
        newUserId: command.newUserId
      });

      this.crossCuttingConcerns.log('info', 'Task assigned successfully', {
        commandId: command.commandId,
        taskId: command.taskId,
        newUserId: command.newUserId,
        duration: Date.now() - startTime
      });

      return {
        success: true,
        data: task,
        metadata: {
          commandId: command.commandId,
          duration: Date.now() - startTime
        }
      };

    } catch (error) {
      this.crossCuttingConcerns.log('error', 'Failed to assign task', {
        commandId: command.commandId,
        taskId: command.taskId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  async bulkUpdateTaskStatus(command: BulkUpdateTaskStatusCommand): Promise<ServiceResult<any[]>> {
    const startTime = Date.now();
    this.crossCuttingConcerns.log('info', 'Bulk updating task status', { 
      commandId: command.commandId,
      taskCount: command.taskIds.length,
      status: command.status
    });

    try {
      // Validation
      if (!await this.crossCuttingConcerns.validate(command)) {
        return {
          success: false,
          error: 'Invalid command data'
        };
      }

      // Execute within transaction
      const results = await this.unitOfWork.execute(async () => {
        const taskIds = command.taskIds.map(id => EntityId.fromString(id));
        const updatedByUserId = EntityId.fromString(command.updatedByUserId);

        const bulkResult = await this.taskDomainService.bulkUpdateTaskStatus(
          taskIds,
          command.status,
          updatedByUserId
        );

        // Format results for application layer
        const formattedResults = [];
        for (const taskId of taskIds) {
          if (bulkResult.success.some(id => id.equals(taskId))) {
            formattedResults.push({
              taskId: taskId.value,
              success: true,
              message: 'Task status updated successfully'
            });
          } else {
            const failure = bulkResult.failed.find(f => f.id.equals(taskId));
            formattedResults.push({
              taskId: taskId.value,
              success: false,
              message: failure?.reason || 'Unknown error'
            });
          }
        }

        return formattedResults;
      });

      // Clear cache for affected tasks
      for (const taskId of command.taskIds) {
        await this.crossCuttingConcerns.cache.delete(`task:${taskId}`);
      }

      // Record metrics
      this.crossCuttingConcerns.recordMetric('task.bulk_status_update', command.taskIds.length, {
        status: command.status,
        successCount: results.filter(r => r.success).length.toString()
      });

      this.crossCuttingConcerns.log('info', 'Bulk task status update completed', {
        commandId: command.commandId,
        totalTasks: command.taskIds.length,
        successfulUpdates: results.filter(r => r.success).length,
        duration: Date.now() - startTime
      });

      return {
        success: true,
        data: results,
        metadata: {
          commandId: command.commandId,
          duration: Date.now() - startTime,
          totalTasks: command.taskIds.length,
          successfulUpdates: results.filter(r => r.success).length
        }
      };

    } catch (error) {
      this.crossCuttingConcerns.log('error', 'Failed bulk task status update', {
        commandId: command.commandId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }
}

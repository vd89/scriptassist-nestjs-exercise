import { Inject, Injectable } from '@nestjs/common';
import { Task, TaskStatus, TaskPriority } from '../entities/task.entity';
import { TaskRepository } from '../repositories/task.repository.interface';
import { UserRepository } from '../repositories/user.repository.interface';
import { EntityId } from '../value-objects/entity-id.value-object';
import { TASK_REPOSITORY, USER_REPOSITORY } from '../repositories/repository.tokens';

@Injectable()
export class TaskDomainService {
  constructor(
    @Inject(TASK_REPOSITORY)
    private readonly taskRepository: TaskRepository,
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
  ) {}

  async createTask(taskData: {
    title: string;
    description?: string;
    priority?: TaskPriority;
    dueDate?: Date | string | null;
    userId: string;
  }): Promise<Task> {
    const userId = EntityId.fromString(taskData.userId);

    // Verify user exists
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const task = Task.create(taskData);
    return await this.taskRepository.save(task);
  }

  async updateTask(
    taskId: EntityId,
    updateData: {
      title?: string;
      description?: string;
      priority?: TaskPriority;
      dueDate?: Date | string | null;
    },
    updatedByUserId: EntityId,
  ): Promise<Task> {
    const [task, user] = await Promise.all([
      this.taskRepository.findById(taskId),
      this.userRepository.findById(updatedByUserId),
    ]);

    if (!task) {
      throw new Error('Task not found');
    }

    if (!user) {
      throw new Error('User not found');
    }

    // Check permissions
    if (!user.canAccessTask(task.userId)) {
      throw new Error('Insufficient permissions to update this task');
    }

    // Apply updates
    if (updateData.title !== undefined) {
      task.updateTitle(updateData.title);
    }

    if (updateData.description !== undefined) {
      task.updateDescription(updateData.description);
    }

    if (updateData.priority !== undefined) {
      task.updatePriority(updateData.priority);
    }

    if (updateData.dueDate !== undefined) {
      task.updateDueDate(updateData.dueDate);
    }

    return await this.taskRepository.save(task);
  }

  async changeTaskStatus(
    taskId: EntityId,
    newStatus: TaskStatus,
    changedByUserId: EntityId,
  ): Promise<Task> {
    const [task, user] = await Promise.all([
      this.taskRepository.findById(taskId),
      this.userRepository.findById(changedByUserId),
    ]);

    if (!task) {
      throw new Error('Task not found');
    }

    if (!user) {
      throw new Error('User not found');
    }

    // Check permissions
    if (!user.canAccessTask(task.userId)) {
      throw new Error('Insufficient permissions to change task status');
    }

    // Apply status change based on business rules
    switch (newStatus) {
      case TaskStatus.IN_PROGRESS:
        task.startProgress();
        break;
      case TaskStatus.COMPLETED:
        task.complete();
        break;
      case TaskStatus.PENDING:
        task.reopen();
        break;
      default:
        throw new Error('Invalid task status');
    }

    return await this.taskRepository.save(task);
  }

  async deleteTask(taskId: EntityId, deletedByUserId: EntityId): Promise<void> {
    const [task, user] = await Promise.all([
      this.taskRepository.findById(taskId),
      this.userRepository.findById(deletedByUserId),
    ]);

    if (!task) {
      throw new Error('Task not found');
    }

    if (!user) {
      throw new Error('User not found');
    }

    // Check permissions
    if (!user.canAccessTask(task.userId)) {
      throw new Error('Insufficient permissions to delete this task');
    }

    await this.taskRepository.delete(taskId);
  }

  async assignTaskToUser(
    taskId: EntityId,
    newUserId: EntityId,
    assignedByUserId: EntityId,
  ): Promise<Task> {
    const [task, newUser, assignedBy] = await Promise.all([
      this.taskRepository.findById(taskId),
      this.userRepository.findById(newUserId),
      this.userRepository.findById(assignedByUserId),
    ]);

    if (!task) {
      throw new Error('Task not found');
    }

    if (!newUser) {
      throw new Error('Target user not found');
    }

    if (!assignedBy) {
      throw new Error('Assigning user not found');
    }

    // Check permissions - only admins or task owners can reassign tasks
    if (!assignedBy.isAdmin() && !assignedBy.id.equals(task.userId)) {
      throw new Error('Insufficient permissions to assign this task');
    }

    // Create new task with same properties but different user
    const newTask = Task.create({
      title: task.title.value,
      description: task.description.value ?? undefined,
      priority: task.priority,
      dueDate: task.dueDate.value,
      userId: newUserId.value,
    });

    // Save new task and delete old one
    const savedTask = await this.taskRepository.save(newTask);
    await this.taskRepository.delete(taskId);

    return savedTask;
  }

  async getTaskStatistics(userId?: EntityId): Promise<{
    total: number;
    pending: number;
    inProgress: number;
    completed: number;
    overdue: number;
    highPriority: number;
    mediumPriority: number;
    lowPriority: number;
  }> {
    const filters = userId ? { userId } : undefined;
    const allTasks = await this.taskRepository.findAll(filters);

    const stats = {
      total: allTasks.data.length,
      pending: 0,
      inProgress: 0,
      completed: 0,
      overdue: 0,
      highPriority: 0,
      mediumPriority: 0,
      lowPriority: 0,
    };

    allTasks.data.forEach(task => {
      // Count by status
      switch (task.status) {
        case TaskStatus.PENDING:
          stats.pending++;
          break;
        case TaskStatus.IN_PROGRESS:
          stats.inProgress++;
          break;
        case TaskStatus.COMPLETED:
          stats.completed++;
          break;
      }

      // Count by priority
      switch (task.priority) {
        case TaskPriority.HIGH:
          stats.highPriority++;
          break;
        case TaskPriority.MEDIUM:
          stats.mediumPriority++;
          break;
        case TaskPriority.LOW:
          stats.lowPriority++;
          break;
      }

      // Count overdue
      if (task.isOverdue()) {
        stats.overdue++;
      }
    });

    return stats;
  }

  async bulkUpdateTaskStatus(
    taskIds: EntityId[],
    newStatus: TaskStatus,
    updatedByUserId: EntityId,
  ): Promise<{ success: EntityId[]; failed: { id: EntityId; reason: string }[] }> {
    const user = await this.userRepository.findById(updatedByUserId);
    if (!user) {
      throw new Error('User not found');
    }

    const results = {
      success: [] as EntityId[],
      failed: [] as { id: EntityId; reason: string }[],
    };

    for (const taskId of taskIds) {
      try {
        await this.changeTaskStatus(taskId, newStatus, updatedByUserId);
        results.success.push(taskId);
      } catch (error) {
        results.failed.push({
          id: taskId,
          reason: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return results;
  }

  async findOverdueTasks(): Promise<Task[]> {
    const overdueTasks = await this.taskRepository.findOverdueTasks();
    return overdueTasks.data.filter(task => task.isOverdue());
  }
}

import { Task, TaskStatus, TaskPriority } from '../../../domain/entities/task.entity';
import { TaskModel, TaskStatusModel, TaskPriorityModel } from '../entities/task.model';
import { EntityId } from '../../../domain/value-objects/entity-id.value-object';

export class TaskMapper {
  static toDomain(taskModel: TaskModel): Task {
    return Task.createFromPersistence(
      {
        title: taskModel.title,
        description: taskModel.description,
        status: taskModel.status as unknown as TaskStatus,
        priority: taskModel.priority as unknown as TaskPriority,
        dueDate: taskModel.dueDate,
        userId: taskModel.userId,
        createdAt: taskModel.createdAt,
        updatedAt: taskModel.updatedAt,
      },
      EntityId.fromString(taskModel.id),
    );
  }

  static toPersistence(task: Task): TaskModel {
    const taskModel = new TaskModel();
    taskModel.id = task.id.value;
    taskModel.title = task.title.value;
    taskModel.description = task.description.value ?? '';
    taskModel.status = task.status as unknown as TaskStatusModel;
    taskModel.priority = task.priority as unknown as TaskPriorityModel;
    taskModel.dueDate = task.dueDate.value ?? new Date();
    taskModel.userId = task.userId.value;
    taskModel.createdAt = task.createdAt;
    taskModel.updatedAt = task.updatedAt;
    return taskModel;
  }

  static toPartialPersistence(task: Task): Partial<TaskModel> {
    return {
      id: task.id.value,
      title: task.title.value,
      description: task.description.value ?? undefined,
      status: task.status as unknown as TaskStatusModel,
      priority: task.priority as unknown as TaskPriorityModel,
      dueDate: task.dueDate.value ?? undefined,
      userId: task.userId.value,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    };
  }
}

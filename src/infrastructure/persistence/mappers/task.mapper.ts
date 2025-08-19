import { Task, TaskStatus, TaskPriority } from '../../../domain/entities/task.entity';
import { TaskModel, TaskStatusModel, TaskPriorityModel } from '../entities/task.model';
import { EntityId } from '../../../domain/value-objects/entity-id.value-object';
import { CreateTaskDto } from '@modules/tasks/dto/create-task.dto';
import { UpdateTaskDto } from '@modules/tasks/dto/update-task.dto';

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

  static toPersistence (input: Task | CreateTaskDto | UpdateTaskDto): TaskModel {
    const taskModel = new TaskModel();

    if (input instanceof Task) {
      taskModel.id = input.id.value;
      taskModel.title = input.title.value;
      taskModel.description = input.description.value ?? '';
      taskModel.status = input.status as unknown as TaskStatusModel;
      taskModel.priority = input.priority as unknown as TaskPriorityModel;
      taskModel.dueDate = input.dueDate.value ?? new Date();
      taskModel.userId = input.userId.value;
      taskModel.createdAt = input.createdAt;
      taskModel.updatedAt = input.updatedAt;
    } else {
      if ('id' in input) taskModel.id = String(input.id);
      taskModel.title = input.title ?? '';
      taskModel.description = input.description ?? '';
      taskModel.status = input.status as unknown as TaskStatusModel;
      taskModel.priority = input.priority as unknown as TaskPriorityModel;
      taskModel.dueDate = input.dueDate ?? new Date();
      taskModel.userId = input.userId ?? 'default-user-id';
      taskModel.createdAt = new Date();
      taskModel.updatedAt = new Date();
    }

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

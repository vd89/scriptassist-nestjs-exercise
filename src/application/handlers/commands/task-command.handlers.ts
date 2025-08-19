import { Injectable } from '@nestjs/common';
import { ICommandHandler } from '../../cqrs/interfaces';
import { 
  CreateTaskCommand,
  UpdateTaskCommand,
  ChangeTaskStatusCommand,
  DeleteTaskCommand,
  AssignTaskCommand,
  BulkUpdateTaskStatusCommand
} from '../../services/task-command.service';
import { TaskCommandService } from '../../services/task-command.service';
import { ServiceResult } from '../../interfaces/application-service.interface';
import { Task } from '../../../domain/entities/task.entity';

/**
 * Handler for CreateTaskCommand
 */
@Injectable()
export class CreateTaskHandler implements ICommandHandler<CreateTaskCommand, ServiceResult<Task>> {
  constructor(private readonly taskCommandService: TaskCommandService) {}

  async handle(command: CreateTaskCommand): Promise<ServiceResult<Task>> {
    return await this.taskCommandService.createTask(command);
  }
}

/**
 * Handler for UpdateTaskCommand
 */
@Injectable()
export class UpdateTaskHandler implements ICommandHandler<UpdateTaskCommand, ServiceResult<Task>> {
  constructor(private readonly taskCommandService: TaskCommandService) {}

  async handle(command: UpdateTaskCommand): Promise<ServiceResult<Task>> {
    return await this.taskCommandService.updateTask(command);
  }
}

/**
 * Handler for ChangeTaskStatusCommand
 */
@Injectable()
export class ChangeTaskStatusHandler implements ICommandHandler<ChangeTaskStatusCommand, ServiceResult<Task>> {
  constructor(private readonly taskCommandService: TaskCommandService) {}

  async handle(command: ChangeTaskStatusCommand): Promise<ServiceResult<Task>> {
    return await this.taskCommandService.changeTaskStatus(command);
  }
}

/**
 * Handler for DeleteTaskCommand
 */
@Injectable()
export class DeleteTaskHandler implements ICommandHandler<DeleteTaskCommand, ServiceResult<void>> {
  constructor(private readonly taskCommandService: TaskCommandService) {}

  async handle(command: DeleteTaskCommand): Promise<ServiceResult<void>> {
    return await this.taskCommandService.deleteTask(command);
  }
}

/**
 * Handler for AssignTaskCommand
 */
@Injectable()
export class AssignTaskHandler implements ICommandHandler<AssignTaskCommand, ServiceResult<Task>> {
  constructor(private readonly taskCommandService: TaskCommandService) {}

  async handle(command: AssignTaskCommand): Promise<ServiceResult<Task>> {
    return await this.taskCommandService.assignTask(command);
  }
}

/**
 * Handler for BulkUpdateTaskStatusCommand
 */
@Injectable()
export class BulkUpdateTaskStatusHandler implements ICommandHandler<BulkUpdateTaskStatusCommand, ServiceResult<any[]>> {
  constructor(private readonly taskCommandService: TaskCommandService) {}

  async handle(command: BulkUpdateTaskStatusCommand): Promise<ServiceResult<any[]>> {
    return await this.taskCommandService.bulkUpdateTaskStatus(command);
  }
}

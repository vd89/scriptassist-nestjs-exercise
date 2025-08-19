import { Injectable } from '@nestjs/common';
import { IQueryHandler } from '../../cqrs/interfaces';
import { 
  GetTaskByIdQuery,
  GetTasksQuery,
  GetUserTasksQuery,
  GetOverdueTasksQuery,
  GetTaskStatisticsQuery,
  SearchTasksQuery,
  GetHighPriorityTasksQuery
} from '../../services/task-query.service';
import { TaskQueryService } from '../../services/task-query.service';
import { ServiceResult } from '../../interfaces/application-service.interface';
import { Task } from '../../../domain/entities/task.entity';
import { PaginatedResult } from '../../../domain/repositories/task.repository.interface';

/**
 * Handler for GetTaskByIdQuery
 */
@Injectable()
export class GetTaskByIdHandler implements IQueryHandler<GetTaskByIdQuery, ServiceResult<Task>> {
  constructor(private readonly taskQueryService: TaskQueryService) {}

  async handle(query: GetTaskByIdQuery): Promise<ServiceResult<Task>> {
    return await this.taskQueryService.getTaskById(query);
  }
}

/**
 * Handler for GetTasksQuery
 */
@Injectable()
export class GetTasksHandler implements IQueryHandler<GetTasksQuery, ServiceResult<PaginatedResult<Task>>> {
  constructor(private readonly taskQueryService: TaskQueryService) {}

  async handle(query: GetTasksQuery): Promise<ServiceResult<PaginatedResult<Task>>> {
    return await this.taskQueryService.getTasks(query);
  }
}

/**
 * Handler for GetUserTasksQuery
 */
@Injectable()
export class GetUserTasksHandler implements IQueryHandler<GetUserTasksQuery, ServiceResult<Task[]>> {
  constructor(private readonly taskQueryService: TaskQueryService) {}

  async handle(query: GetUserTasksQuery): Promise<ServiceResult<Task[]>> {
    return await this.taskQueryService.getUserTasks(query);
  }
}

/**
 * Handler for GetOverdueTasksQuery
 */
@Injectable()
export class GetOverdueTasksHandler implements IQueryHandler<GetOverdueTasksQuery, ServiceResult<PaginatedResult<Task>>> {
  constructor(private readonly taskQueryService: TaskQueryService) {}

  async handle(query: GetOverdueTasksQuery): Promise<ServiceResult<PaginatedResult<Task>>> {
    return await this.taskQueryService.getOverdueTasks(query);
  }
}

/**
 * Handler for GetTaskStatisticsQuery
 */
@Injectable()
export class GetTaskStatisticsHandler implements IQueryHandler<GetTaskStatisticsQuery, ServiceResult<any>> {
  constructor(private readonly taskQueryService: TaskQueryService) {}

  async handle(query: GetTaskStatisticsQuery): Promise<ServiceResult<any>> {
    return await this.taskQueryService.getTaskStatistics(query);
  }
}

/**
 * Handler for SearchTasksQuery
 */
@Injectable()
export class SearchTasksHandler implements IQueryHandler<SearchTasksQuery, ServiceResult<PaginatedResult<Task>>> {
  constructor(private readonly taskQueryService: TaskQueryService) {}

  async handle(query: SearchTasksQuery): Promise<ServiceResult<PaginatedResult<Task>>> {
    return await this.taskQueryService.searchTasks(query);
  }
}

/**
 * Handler for GetHighPriorityTasksQuery
 */
@Injectable()
export class GetHighPriorityTasksHandler implements IQueryHandler<GetHighPriorityTasksQuery, ServiceResult<Task[]>> {
  constructor(private readonly taskQueryService: TaskQueryService) {}

  async handle(query: GetHighPriorityTasksQuery): Promise<ServiceResult<Task[]>> {
    return await this.taskQueryService.getHighPriorityTasks(query);
  }
}

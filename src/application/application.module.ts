import { Module } from '@nestjs/common';
import { DomainModule } from '../domain/domain.module';
import { InfrastructureModule } from '../infrastructure/infrastructure.module';
import { CommonModule } from '../common/common.module';

// Services
import { CrossCuttingConcernsService } from './services/cross-cutting-concerns.service';
import { TaskCommandService } from './services/task-command.service';
import { TaskQueryService } from './services/task-query.service';

// CQRS
import { CommandBus } from './cqrs/command-bus';
import { QueryBus } from './cqrs/query-bus';
import { CQRSMediator } from './cqrs/cqrs-mediator';

// Command Handlers
import {
  CreateTaskHandler,
  UpdateTaskHandler,
  ChangeTaskStatusHandler,
  DeleteTaskHandler,
  AssignTaskHandler,
  BulkUpdateTaskStatusHandler
} from './handlers/commands/task-command.handlers';

// Query Handlers
import {
  GetTaskByIdHandler,
  GetTasksHandler,
  GetUserTasksHandler,
  GetOverdueTasksHandler,
  GetTaskStatisticsHandler,
  SearchTasksHandler,
  GetHighPriorityTasksHandler
} from './handlers/queries/task-query.handlers';

// Commands
import {
  CreateTaskCommand,
  UpdateTaskCommand,
  ChangeTaskStatusCommand,
  DeleteTaskCommand,
  AssignTaskCommand,
  BulkUpdateTaskStatusCommand
} from './services/task-command.service';

// Queries
import {
  GetTaskByIdQuery,
  GetTasksQuery,
  GetUserTasksQuery,
  GetOverdueTasksQuery,
  GetTaskStatisticsQuery,
  SearchTasksQuery,
  GetHighPriorityTasksQuery
} from './services/task-query.service';

// Unit of Work
import { TypeOrmUnitOfWork, UNIT_OF_WORK } from '../infrastructure/persistence/unit-of-work/typeorm-unit-of-work.service';
import { DataSource } from 'typeorm';

const commandHandlers = [
  CreateTaskHandler,
  UpdateTaskHandler,
  ChangeTaskStatusHandler,
  DeleteTaskHandler,
  AssignTaskHandler,
  BulkUpdateTaskStatusHandler
];

const queryHandlers = [
  GetTaskByIdHandler,
  GetTasksHandler,
  GetUserTasksHandler,
  GetOverdueTasksHandler,
  GetTaskStatisticsHandler,
  SearchTasksHandler,
  GetHighPriorityTasksHandler
];

@Module({
  imports: [
    DomainModule,
    InfrastructureModule,
    CommonModule
  ],
  providers: [
    // Services
    CrossCuttingConcernsService,
    TaskCommandService,
    TaskQueryService,

    // CQRS Infrastructure
    CommandBus,
    QueryBus,
    CQRSMediator,

    // Unit of Work
    {
      provide: UNIT_OF_WORK,
      useClass: TypeOrmUnitOfWork
    },

    // Command Handlers
    ...commandHandlers,

    // Query Handlers
    ...queryHandlers,

    // CQRS Setup Provider
    {
      provide: 'CQRS_SETUP',
      useFactory: (
        commandBus: CommandBus,
        queryBus: QueryBus,
        // Command handlers
        createTaskHandler: CreateTaskHandler,
        updateTaskHandler: UpdateTaskHandler,
        changeTaskStatusHandler: ChangeTaskStatusHandler,
        deleteTaskHandler: DeleteTaskHandler,
        assignTaskHandler: AssignTaskHandler,
        bulkUpdateTaskStatusHandler: BulkUpdateTaskStatusHandler,
        // Query handlers
        getTaskByIdHandler: GetTaskByIdHandler,
        getTasksHandler: GetTasksHandler,
        getUserTasksHandler: GetUserTasksHandler,
        getOverdueTasksHandler: GetOverdueTasksHandler,
        getTaskStatisticsHandler: GetTaskStatisticsHandler,
        searchTasksHandler: SearchTasksHandler,
        getHighPriorityTasksHandler: GetHighPriorityTasksHandler
      ) => {
        // Register command handlers
        commandBus.register(CreateTaskCommand, createTaskHandler);
        commandBus.register(UpdateTaskCommand, updateTaskHandler);
        commandBus.register(ChangeTaskStatusCommand, changeTaskStatusHandler);
        commandBus.register(DeleteTaskCommand, deleteTaskHandler);
        commandBus.register(AssignTaskCommand, assignTaskHandler);
        commandBus.register(BulkUpdateTaskStatusCommand, bulkUpdateTaskStatusHandler);

        // Register query handlers
        queryBus.register(GetTaskByIdQuery, getTaskByIdHandler);
        queryBus.register(GetTasksQuery, getTasksHandler);
        queryBus.register(GetUserTasksQuery, getUserTasksHandler);
        queryBus.register(GetOverdueTasksQuery, getOverdueTasksHandler);
        queryBus.register(GetTaskStatisticsQuery, getTaskStatisticsHandler);
        queryBus.register(SearchTasksQuery, searchTasksHandler);
        queryBus.register(GetHighPriorityTasksQuery, getHighPriorityTasksHandler);

        return 'CQRS_CONFIGURED';
      },
      inject: [
        CommandBus,
        QueryBus,
        ...commandHandlers,
        ...queryHandlers
      ]
    }
  ],
  exports: [
    CrossCuttingConcernsService,
    TaskCommandService,
    TaskQueryService,
    CommandBus,
    QueryBus,
    CQRSMediator,
    UNIT_OF_WORK
  ]
})
export class ApplicationModule {}

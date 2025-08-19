import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserModel } from './persistence/entities/user.model';
import { TaskModel } from './persistence/entities/task.model';
import { TypeOrmUserRepository } from './persistence/repositories/typeorm-user.repository';
import { TypeOrmTaskRepository } from './persistence/repositories/typeorm-task.repository';
import { TypeOrmUnitOfWork, UNIT_OF_WORK } from './persistence/unit-of-work/typeorm-unit-of-work.service';

import { USER_REPOSITORY, TASK_REPOSITORY } from '../domain/repositories/repository.tokens';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserModel, TaskModel]),
  ],
  providers: [
    {
      provide: USER_REPOSITORY,
      useClass: TypeOrmUserRepository,
    },
    {
      provide: TASK_REPOSITORY,
      useClass: TypeOrmTaskRepository,
    },
    {
      provide: UNIT_OF_WORK,
      useClass: TypeOrmUnitOfWork,
    },
  ],
  exports: [USER_REPOSITORY, TASK_REPOSITORY, UNIT_OF_WORK],
})
export class InfrastructureModule {}

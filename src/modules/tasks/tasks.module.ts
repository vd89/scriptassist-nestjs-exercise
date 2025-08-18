import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { TasksService } from './tasks.service';
import { TasksController } from './tasks.controller';
import { Task } from './entities/task.entity';
import { CacheService } from '../../common/services/cache.service';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    TypeOrmModule.forFeature([Task]),
    BullModule.registerQueue({
      name: 'task-processing',
    }),
    ConfigModule, // Required for CacheService
  ],
  controllers: [TasksController],
  providers: [
    TasksService,
    CacheService, // Add CacheService as a provider
  ],
  exports: [TasksService],
})
export class TasksModule {}

import { Module, OnModuleInit, Logger } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OverdueTasksService } from './overdue-tasks.service';
import { TasksModule } from '../../modules/tasks/tasks.module';
import { Task } from '../../modules/tasks/entities/task.entity';
import { HealthService } from '../../modules/health/health.service';
import { HealthModule } from '../../modules/health/health.module';
import { HealthCheckResult } from '@nestjs/terminus';

export class HealthCheckException extends Error {
  constructor(public details: HealthCheckResult) {
    super('Critical health check failed. See details for recovery steps.');
  }
}

@Module({
  imports: [
    ScheduleModule.forRoot(),
    BullModule.registerQueue({ name: 'task-processing' }, { name: 'overdue-tasks-dead-letter' }),
    TypeOrmModule.forFeature([Task]),
    TasksModule,
    HealthModule, // Import HealthModule to provide HealthService
  ],
  providers: [OverdueTasksService],
  exports: [OverdueTasksService],
})
export class ScheduledTasksModule implements OnModuleInit {
  private readonly logger = new Logger(ScheduledTasksModule.name);

  constructor(private readonly healthService: HealthService) {}

  async onModuleInit() {
    this.logger.log('Running pre-start health checks for ScheduledTasksModule...');
    try {
      const result = await this.healthService.check();
      if (result.status !== 'ok') {
        this.logger.error(
          `Health check failed before ScheduledTasksModule start: ${JSON.stringify(result, null, 2)}`,
        );
        // Instead of throwing, log and continue, or implement fallback/alerting logic here
        // Optionally, you can set a flag or notify an external system
      } else {
        this.logger.log('All health checks passed. ScheduledTasksModule is starting.');
      }
    } catch (error) {
      this.logger.error('Exception during health check:', error);
      // Optionally, handle specific error types or notify an external system
    }
  }
}

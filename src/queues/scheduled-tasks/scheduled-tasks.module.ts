import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OverdueTasksService } from './overdue-tasks.service';
import { TasksModule } from '../../modules/tasks/tasks.module';
import { Task } from '../../modules/tasks/entities/task.entity';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

// Create a controller for manual triggering of scheduled tasks
@ApiTags('scheduled-tasks')
@Controller('scheduled-tasks')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class ScheduledTasksController {
  constructor(private readonly overdueTasksService: OverdueTasksService) {}

  @Get('overdue/stats')
  @Roles('admin')
  async getOverdueTasksStats() {
    const stats = await this.overdueTasksService.getOverdueTasksStats();

    return {
      success: true,
      data: stats,
    };
  }

  @Post('overdue/trigger')
  @Roles('admin')
  async triggerOverdueTasks() {
    await this.overdueTasksService.manualCheckOverdueTasks();

    return {
      success: true,
      message: 'Overdue tasks check triggered successfully',
    };
  }
}

@Module({
  imports: [
    ConfigModule,
    ScheduleModule.forRoot(),
    // Register queue with proper configuration
    BullModule.registerQueueAsync({
      name: 'task-processing',
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        // Use configuration from config service
        connection: {
          host: configService.get('bull.connection.host'),
          port: configService.get('bull.connection.port'),
          password: configService.get('bull.connection.password'),
        },
        // Configure default job settings
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 1000,
          },
          removeOnComplete: true,
          removeOnFail: 5000,
        },
      }),
    }),
    TypeOrmModule.forFeature([Task]),
    TasksModule,
  ],
  controllers: [ScheduledTasksController],
  providers: [OverdueTasksService],
  exports: [OverdueTasksService],
})
export class ScheduledTasksModule {}

import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { Task } from '../../modules/tasks/entities/task.entity';
import { TaskStatus } from '../../modules/tasks/enums/task-status.enum';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class OverdueTasksService {
  private readonly logger = new Logger(OverdueTasksService.name);
  private readonly batchSize: number;

  constructor(
    @InjectQueue('task-processing')
    private taskQueue: Queue,
    @InjectRepository(Task)
    private tasksRepository: Repository<Task>,
    private configService: ConfigService,
  ) {
    // Get batch size from config, default to 100
    this.batchSize = this.configService.get<number>('OVERDUE_TASKS_BATCH_SIZE', 100);
  }

  /**
   * Check for overdue tasks every hour
   * Efficiently processes tasks in batches
   */
  @Cron(CronExpression.EVERY_HOUR)
  async checkOverdueTasks() {
    this.logger.log('Starting scheduled overdue tasks check...');

    try {
      // Count overdue tasks first to determine batching strategy
      const now = new Date();

      const overdueTasksCount = await this.tasksRepository.count({
        where: {
          dueDate: LessThan(now),
          status: TaskStatus.PENDING,
        },
      });

      if (overdueTasksCount === 0) {
        this.logger.log('No overdue tasks found');
        return;
      }

      this.logger.log(`Found ${overdueTasksCount} overdue tasks to process`);

      // Calculate number of batches needed
      const totalBatches = Math.ceil(overdueTasksCount / this.batchSize);

      // Process in batches using the queue for better scaling
      for (let batchNumber = 1; batchNumber <= totalBatches; batchNumber++) {
        await this.taskQueue.add(
          'overdue-tasks-notification',
          {
            batchSize: this.batchSize,
            page: batchNumber,
            totalBatches,
            timestamp: now.toISOString(),
          },
          {
            // Add delay between batches to prevent overwhelming the system
            delay: (batchNumber - 1) * 1000,
            // Remove completed jobs from the queue to save memory
            removeOnComplete: true,
            // Keep failed jobs for debugging
            removeOnFail: 5000,
            // Add job ID for better tracking
            jobId: `overdue-tasks-${now.toISOString()}-batch-${batchNumber}`,
          },
        );
      }

      this.logger.log(`Queued ${totalBatches} batches for processing overdue tasks`);
    } catch (error) {
      this.logger.error(`Error checking overdue tasks: ${error.message}`, error.stack);
    }
  }

  /**
   * Manual trigger for processing overdue tasks
   * Useful for testing and forced execution
   */
  async manualCheckOverdueTasks() {
    this.logger.log('Manually triggered overdue tasks check');
    return this.checkOverdueTasks();
  }

  /**
   * Get statistics about overdue tasks
   */
  async getOverdueTasksStats() {
    const now = new Date();

    // Use query builder for more efficient aggregation
    const queryBuilder = this.tasksRepository.createQueryBuilder('task');

    queryBuilder
      .select('COUNT(*)', 'total')
      .addSelect('task.status', 'status')
      .addSelect('task.priority', 'priority')
      .where('task.dueDate < :now', { now })
      .groupBy('task.status, task.priority');

    const stats = await queryBuilder.getRawMany();

    // Calculate totals by status and priority
    const result: {
      total: number;
      byStatus: { [key: string]: number };
      byPriority: { [key: string]: number };
    } = {
      total: 0,
      byStatus: {},
      byPriority: {},
    };

    stats.forEach(item => {
      const count = parseInt(item.total, 10);
      result.total += count;

      // Group by status
      if (!result.byStatus[item.status]) {
        result.byStatus[item.status] = 0;
      }
      result.byStatus[item.status] += count;

      // Group by priority
      if (!result.byPriority[item.priority]) {
        result.byPriority[item.priority] = 0;
      }
      result.byPriority[item.priority] += count;
    });

    return result;
  }
}

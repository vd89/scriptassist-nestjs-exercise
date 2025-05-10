import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue, JobsOptions } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { Task } from '../../modules/tasks/entities/task.entity';
import { TaskStatus } from '../../modules/tasks/enums/task-status.enum';

@Injectable()
export class OverdueTasksService {
  private readonly logger = new Logger(OverdueTasksService.name);
  private readonly BATCH_SIZE = 100;
  private readonly MAX_RETRIES = 3;
  private readonly CONCURRENCY = 5;
  // private readonly DEAD_LETTER_QUEUE = 'overdue-tasks-dead-letter';

  constructor(
    @InjectQueue('task-processing')
    private readonly taskQueue: Queue,
    @InjectRepository(Task)
    private readonly tasksRepository: Repository<Task>,
    @InjectQueue('overdue-tasks-dead-letter')
    private readonly deadLetterQueue: Queue,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async checkOverdueTasks(): Promise<void> {
    this.logger.debug('Checking for overdue tasks...');
    const now = new Date();
    let offset = 0;
    let totalProcessed = 0;
    let batch: Task[];
    do {
      batch = await this.tasksRepository.find({
        where: { dueDate: LessThan(now), status: TaskStatus.PENDING },
        take: this.BATCH_SIZE,
        skip: offset,
      });
      if (batch.length === 0) break;
      await this.processBatch(batch);
      totalProcessed += batch.length;
      offset += this.BATCH_SIZE;
    } while (batch.length === this.BATCH_SIZE);
    this.logger.log(`Processed ${totalProcessed} overdue tasks.`);
    this.logger.debug('Overdue tasks check completed');
  }

  private async processBatch(tasks: Task[]): Promise<void> {
    const promises = [];
    for (const task of tasks) {
      promises.push(this.addToQueueWithRetry(task));
      if (promises.length >= this.CONCURRENCY) {
        await Promise.all(promises);
        promises.length = 0;
      }
    }
    if (promises.length > 0) {
      await Promise.all(promises);
    }
  }

  private async addToQueueWithRetry(task: Task, attempt = 1): Promise<void> {
    const jobOptions: JobsOptions = {
      attempts: this.MAX_RETRIES,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: true,
      removeOnFail: false,
    };
    try {
      await this.taskQueue.add('process-overdue-task', { taskId: task.id }, jobOptions);
    } catch (error: any) {
      this.logger.error(`Failed to queue task ${task.id} (attempt ${attempt}): ${error}`);
      if (attempt < this.MAX_RETRIES) {
        await this.addToQueueWithRetry(task, attempt + 1);
      } else {
        this.logger.warn(
          `Task ${task.id} moved to dead-letter queue after ${this.MAX_RETRIES} attempts.`,
        );
        await this.deadLetterQueue.add('dead-letter', {
          taskId: task.id,
          reason: error.message || String(error),
        });
      }
    }
  }
}

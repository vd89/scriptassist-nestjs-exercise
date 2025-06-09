import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { Task } from '../../modules/tasks/entities/task.entity';
import { TaskStatus } from '../../modules/tasks/enums/task-status.enum';

/**
 * Service responsible for checking and processing overdue tasks.
 * Uses a cron job to periodically check for tasks that have passed their due date
 * and queues them for processing using BullMQ.
 */
@Injectable()
export class OverdueTasksService {
  private readonly logger = new Logger(OverdueTasksService.name);
  // Process tasks in batches to avoid memory issues and improve performance
  private readonly BATCH_SIZE = 100;

  constructor(
    @InjectQueue('task-processing')
    private taskQueue: Queue,
    @InjectRepository(Task)
    private tasksRepository: Repository<Task>,
  ) {}

  /**
   * Cron job that runs every minute to check for overdue tasks.
   * Finds tasks that are:
   * 1. Past their due date
   * 2. Still in PENDING status
   * 
   * These tasks are then queued for processing with retry mechanisms.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async checkOverdueTasks() {
    this.logger.debug('Checking for overdue tasks...');
    
    try {
      const now = new Date();
      let processedCount = 0;

      // Process tasks in batches until no more overdue tasks are found
      while (true) {
        // Find overdue tasks in batches using TypeORM's query builder
        const overdueTasks = await this.tasksRepository.find({
          where: {
            dueDate: LessThan(now),
            status: TaskStatus.PENDING,
          },
          take: this.BATCH_SIZE,
        });

        if (overdueTasks.length === 0) {
          break;
        }

        // Prepare jobs for BullMQ queue with retry configuration
        const jobs = overdueTasks.map(task => ({
          name: 'overdue-tasks-notification',
          data: {
            taskId: task.id,
            dueDate: task.dueDate,
            userId: task.userId,
          },
          opts: {
            attempts: 3, // Retry failed jobs up to 3 times
            backoff: {
              type: 'exponential', // Use exponential backoff for retries
              delay: 1000, // Start with 1 second delay
            },
            removeOnComplete: true, // Clean up completed jobs
            removeOnFail: false, // Keep failed jobs for debugging
          },
        }));

        // Add jobs to the queue in bulk for better performance
        await this.taskQueue.addBulk(jobs);
        
        processedCount += overdueTasks.length;
      }

      this.logger.log(`Successfully queued ${processedCount} overdue tasks for processing`);
    } catch (error) {
      this.logger.error(`Error checking overdue tasks: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    } finally {
      this.logger.debug('Overdue tasks check completed');
    }
  }
} 
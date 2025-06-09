import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { Task } from '../../modules/tasks/entities/task.entity';
import { TaskStatus } from '../../modules/tasks/enums/task-status.enum';

@Injectable()
export class OverdueTasksService {
  private readonly logger = new Logger(OverdueTasksService.name);
  private readonly BATCH_SIZE = 100; // Process in batches of 100 tasks

  constructor(
    @InjectQueue('task-processing')
    private taskQueue: Queue,
    @InjectRepository(Task)
    private tasksRepository: Repository<Task>,
  ) {}

  // TODO: Implement the overdue tasks checker
  // This method should run every hour and check for overdue tasks
  @Cron(CronExpression.EVERY_HOUR)
  async checkOverdueTasks() {
    this.logger.debug('Checking for overdue tasks...');
    
    const now = new Date();
    
    // Efficiently count total overdue tasks first
    const totalOverdueTasks = await this.tasksRepository.count({
      where: {
        dueDate: LessThan(now),
        status: TaskStatus.PENDING,
      },
    });
    
    if (totalOverdueTasks === 0) {
      this.logger.log('No overdue tasks found');
      return;
    }
    
    this.logger.log(`Found ${totalOverdueTasks} overdue tasks, processing in batches`);
    
    let processedCount = 0;
    let currentPage = 0;
    
    // Process in batches to avoid memory issues
    while (processedCount < totalOverdueTasks) {
      const overdueTasks = await this.tasksRepository.find({
        where: {
          dueDate: LessThan(now),
          status: TaskStatus.PENDING,
        },
        take: this.BATCH_SIZE,
        skip: currentPage * this.BATCH_SIZE,
      });
      
      if (overdueTasks.length === 0) {
        break; // No more tasks to process
      }
      
      // Add batch job to process all overdue tasks at once
      await this.taskQueue.add(
        'overdue-tasks-notification',
        {
          taskIds: overdueTasks.map(task => task.id),
          totalTasks: totalOverdueTasks,
          batchNumber: currentPage + 1,
        },
        {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 1000,
          },
        }
      );
      
      processedCount += overdueTasks.length;
      currentPage++;
      
      this.logger.debug(`Processed batch ${currentPage}: ${processedCount}/${totalOverdueTasks} tasks`);
    }
    
    this.logger.log(`Overdue tasks check completed: ${processedCount} tasks processed`);
  }
} 
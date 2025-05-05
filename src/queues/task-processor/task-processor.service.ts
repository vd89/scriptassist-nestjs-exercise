import { Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { TasksService } from '../../modules/tasks/tasks.service';
import { TaskStatus } from '../../modules/tasks/enums/task-status.enum';

interface TaskStatusUpdateData {
  taskId: string;
  status: TaskStatus;
}

@Injectable()
@Processor('task-processing', {
  concurrency: 5,
  limiter: {
    max: 100,
    duration: 1000,
  },
})
export class TaskProcessorService extends WorkerHost {
  private readonly logger = new Logger(TaskProcessorService.name);

  constructor(private readonly tasksService: TasksService) {
    super();
  }

  async process(job: Job): Promise<any> {
    this.logger.debug(`Processing job ${job.id} of type ${job.name}`);

    try {
      switch (job.name) {
        case 'task-status-update':
          return await this.handleStatusUpdate(job);
        case 'overdue-tasks-notification':
          return await this.handleOverdueTasks(job);
        default:
          this.logger.warn(`Unknown job type: ${job.name}`);
          throw new Error(`Unknown job type: ${job.name}`);
      }
    } catch (error) {
      this.logger.error(
        `Error processing job ${job.id}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );

      // Retry strategy based on error type
      if (error instanceof Error) {
        if (error.message.includes('database') || error.message.includes('connection')) {
          // Retry database-related errors
          throw error;
        } else if (error.message.includes('validation')) {
          // Don't retry validation errors
          return { success: false, error: error.message };
        }
      }

      // Default retry behavior
      throw error;
    }
  }

  private async handleStatusUpdate(job: Job<TaskStatusUpdateData>) {
    const { taskId, status } = job.data;

    if (!taskId || !status) {
      throw new Error('Missing required data: taskId and status are required');
    }

    if (!Object.values(TaskStatus).includes(status)) {
      throw new Error(`Invalid status value: ${status}`);
    }

    try {
      const task = await this.tasksService.updateStatus(taskId, status);

      return {
        success: true,
        taskId: task.id,
        newStatus: task.status,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(
        `Failed to update task status: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }
  }

  private async handleOverdueTasks(_: Job) {
    this.logger.debug('Processing overdue tasks notification');

    try {
      const BATCH_SIZE = 100;
      let processedCount = 0;
      let errorCount = 0;

      // Process tasks in batches
      while (true) {
        const tasks = await this.tasksService.findOverdueTasks(BATCH_SIZE, processedCount);

        if (tasks.length === 0) {
          break;
        }

        // Process batch in parallel with error handling
        const results = await Promise.allSettled(tasks.map(task => this.processOverdueTask(task)));

        // Count successes and failures
        results.forEach(result => {
          if (result.status === 'fulfilled') {
            processedCount++;
          } else {
            errorCount++;
            this.logger.error(`Failed to process overdue task: ${result.reason}`);
          }
        });
      }

      return {
        success: true,
        processedCount,
        errorCount,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(
        `Failed to process overdue tasks: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }
  }

  private async processOverdueTask(task: any) {
    // Implement your overdue task processing logic here
    // For example, sending notifications, updating status, etc.
    return { taskId: task.id, processed: true };
  }
}

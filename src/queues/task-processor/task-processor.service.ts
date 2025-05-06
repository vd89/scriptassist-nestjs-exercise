import { Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { TasksService } from '../../modules/tasks/tasks.service';
import { TaskStatus } from '../../modules/tasks/enums/task-status.enum';

/**
 * Service responsible for processing queued tasks using BullMQ.
 * Handles different types of task-related jobs with proper error handling,
 * retries, and concurrency control.
 */
@Injectable()
@Processor('task-processing', {
  concurrency: 10, // Process up to 10 jobs concurrently to prevent system overload
  limiter: {
    max: 100, // Maximum number of jobs processed
    duration: 1000, // Per second to prevent Redis overload
  },
})
export class TaskProcessorService extends WorkerHost {
  private readonly logger = new Logger(TaskProcessorService.name);

  constructor(private readonly tasksService: TasksService) {
    super();
  }

  /**
   * Main job processing method that handles different types of task-related jobs.
   * Implements error handling with retry logic for transient failures.
   * 
   * @param job - The BullMQ job to process
   * @returns The result of the job processing
   */
  async process(job: Job): Promise<any> {
    this.logger.debug(`Processing job ${job.id} of type ${job.name}`);
    
    try {
      // Route the job to the appropriate handler based on job name
      switch (job.name) {
        case 'task-status-update':
          return await this.handleStatusUpdate(job);
        case 'overdue-tasks-notification':
          return await this.handleOverdueTasks(job);
        default:
          this.logger.warn(`Unknown job type: ${job.name}`);
          return { success: false, error: 'Unknown job type' };
      }
    } catch (error) {
      this.logger.error(`Error processing job ${job.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      
      // Determine if the job should be retried based on error type
      const shouldRetry = this.shouldRetryJob(error);
      if (shouldRetry) {
        throw error; // This will trigger BullMQ's retry mechanism
      }
      
      // For non-retryable errors, mark the job as failed
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        retryable: false,
      };
    }
  }

  /**
   * Handles task status update jobs.
   * Validates the input data and updates the task status.
   * 
   * @param job - The job containing task status update data
   * @returns The result of the status update
   */
  private async handleStatusUpdate(job: Job) {
    const { taskId, status } = job.data;
    
    // Validate required job data
    if (!taskId || !status) {
      throw new Error('Missing required data for status update');
    }
    
    // Validate status value against allowed enum values
    if (!Object.values(TaskStatus).includes(status)) {
      throw new Error(`Invalid status value: ${status}`);
    }
    
    // Update the task status
    const task = await this.tasksService.updateStatus(taskId, status);
    
    return { 
      success: true,
      taskId: task.id,
      newStatus: task.status
    };
  }

  /**
   * Handles overdue tasks notification jobs.
   * Updates the task status and prepares for notification.
   * 
   * @param job - The job containing overdue task data
   * @returns The result of the overdue task processing
   */
  private async handleOverdueTasks(job: Job) {
    const { taskId, dueDate, userId } = job.data;
    
    // Validate required job data
    if (!taskId || !dueDate || !userId) {
      throw new Error('Missing required data for overdue task processing');
    }

    // Update task status to IN_PROGRESS since it's overdue and needs attention
    const task = await this.tasksService.updateStatus(taskId, TaskStatus.IN_PROGRESS);
    
    // Here you would typically:
    // 1. Send notifications to the user
    // 2. Update any related metrics
    // 3. Trigger any necessary workflows
    
    return {
      success: true,
      taskId: task.id,
      status: task.status,
      processedAt: new Date(),
    };
  }

  /**
   * Determines if a job should be retried based on the error type.
   * Retries are only attempted for transient failures that might succeed on retry.
   * 
   * @param error - The error that occurred during job processing
   * @returns Whether the job should be retried
   */
  private shouldRetryJob(error: unknown): boolean {
    // Define which errors should trigger a retry
    const retryableErrors = [
      'ECONNRESET',    // Network connection reset
      'ETIMEDOUT',     // Network timeout
      'ECONNREFUSED',  // Connection refused
      'TemporaryError', // Other temporary errors
    ];

    if (error instanceof Error) {
      return retryableErrors.some(errType => error.message.includes(errType));
    }

    return false;
  }
} 
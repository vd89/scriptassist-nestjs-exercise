import { Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq'; // Remove OnWorkerEvent
import { Job, Queue } from 'bullmq';
import { TasksService } from '../../modules/tasks/tasks.service';
import { ConfigService } from '@nestjs/config';


interface TaskResult {
  success: boolean;
  taskId?: string;
  message?: string;
  error?: string;
  newStatus?: string;
  jobId?: string;
}

interface BatchResult {
  success: boolean;
  action?: string;
  processedCount?: number;
  results?: TaskResult[];
}

@Injectable()
@Processor('task-processing')
export class TaskProcessorService extends WorkerHost {
  private readonly logger = new Logger(TaskProcessorService.name);

  constructor(
    @InjectQueue('task-processing') private taskQueue: Queue,
    private readonly tasksService: TasksService,
    private readonly configService: ConfigService,
  ) {
    super();
  }

  /**
   * Process jobs with proper error handling and batching
   */
  async process (job: Job): Promise<TaskResult | BatchResult> {
    this.logger.debug(
      `Processing job ${job.id} of type ${job.name} [attempt: ${job.attemptsMade + 1}]`,
    );

    try {
      // Route job to appropriate handler
      switch (job.name) {
        case 'task-status-update':
          return await this.handleStatusUpdate(job);

        case 'overdue-tasks-notification':
          return await this.handleOverdueTasks(job);

        case 'tasks-batch-process':
          return await this.handleBatchProcess(job);

        default:
          throw new Error(`Unknown job type: ${job.name}`);
      }
    } catch (error) {
      // Enhanced error logging with context
      const err = error as Error;
      this.logger.error(
        `Error processing job ${job.id} (${job.name}): ${err.message}`,
        err.stack,
        {
          jobId: job.id,
          jobName: job.name,
          jobData: job.data,
          attempt: job.attemptsMade + 1,
        },
      );

      // Determine if we should retry based on error type
      const shouldRetry = this.shouldRetryJob(err, job);

      if (shouldRetry) {
        // Throw error to trigger retry
        throw error;
      } else {
        // Return error result to mark job as completed but failed
        return {
          success: false,
          error: err.message,
          jobId: job.id,
        };
      }
    }
  }

  /**
   * Handle task status update jobs
   */
  private async handleStatusUpdate (job: Job): Promise<TaskResult> {
    const { taskId, status } = job.data;

    if (!taskId || !status) {
      throw new Error('Missing required data: taskId and status are required');
    }

    // Validate status value
    const validStatuses = ['PENDING', 'IN_PROGRESS', 'COMPLETED'];
    if (!validStatuses.includes(status)) {
      throw new Error(`Invalid status: ${status}. Must be one of: ${validStatuses.join(', ')}`);
    }

    // Update task status
    const task = await this.tasksService.updateStatus(taskId, status);

    return {
      success: true,
      taskId: task.id,
      newStatus: task.status,
    };
  }

  /**
   * Handle overdue tasks notification
   */
  private async handleOverdueTasks (job: Job): Promise<BatchResult> {
    this.logger.debug('Processing overdue tasks notification');

    // Handle batches for large datasets
    const { batchSize = 100, page = 1 } = job.data;

    try {
      // Find overdue tasks
      const tasks = await this.tasksService.findOverdueTasks(page, batchSize);

      this.logger.log(`Processing ${tasks.data.length} overdue tasks (batch ${page})`);

      // Process notifications or other actions for overdue tasks
      // Add to queue if there are more tasks
      if (tasks.meta.page < tasks.meta.totalPages) {
        await this.taskQueue.add(
          'overdue-tasks-notification',
          {
            batchSize,
            page: page + 1,
          },
          {
            delay: 1000, // Wait 1 second between batches
            removeOnComplete: true,
          },
        );
      }

      return {
        success: true,
        processedCount: tasks.data.length,
      };
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Error processing overdue tasks: ${err.message}`, err.stack);
      throw error;
    }
  }

  /**
   * Handle batch processing of tasks
   */
  private async handleBatchProcess (job: Job): Promise<BatchResult> {
    const { taskIds, action } = job.data;

    if (!taskIds || !Array.isArray(taskIds) || taskIds.length === 0) {
      throw new Error('Missing or invalid taskIds: must be a non-empty array');
    }

    if (!action) {
      throw new Error('Missing required data: action is required');
    }

    // Validate action
    const validActions = ['complete', 'delete'];
    if (!validActions.includes(action)) {
      throw new Error(`Invalid action: ${action}. Must be one of: ${validActions.join(', ')}`);
    }

    // Split large batches into smaller chunks
    const chunkSize = 100;
    const chunks = this.chunkArray(taskIds, chunkSize);

    const results: TaskResult[] = [];

    for (const chunk of chunks) {
      // Process each chunk
      const chunkResults = await this.tasksService.batchProcess(chunk, action);
      results.push(...chunkResults);
    }

    return {
      success: true,
      action,
      processedCount: results.length,
      results,
    };
  }

  /**
   * Helper method to split array into chunks
   */
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Determine if a job should be retried based on the error
   */
  private shouldRetryJob(error: Error, job: Job): boolean {
    // Don't retry if we've already tried too many times
    if (job.attemptsMade >= 5) {
      return false;
    }

    // Don't retry for validation errors
    if (error.message.includes('Invalid') || error.message.includes('Missing required data')) {
      return false;
    }

    // Retry for temporary errors like network issues
    if (
      error.message.includes('ECONNREFUSED') ||
      error.message.includes('timeout') ||
      error.message.includes('ETIMEDOUT')
    ) {
      return true;
    }

    // Default to retry for most errors
    return true;
  }
}

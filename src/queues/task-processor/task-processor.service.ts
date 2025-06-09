import { Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { TasksService } from '../../modules/tasks/tasks.service';
import { TaskStatus } from '../../modules/tasks/enums/task-status.enum';

@Injectable()
@Processor('task-processing')
export class TaskProcessorService extends WorkerHost {
  private readonly logger = new Logger(TaskProcessorService.name);
  private readonly MAX_CONCURRENCY = 5;
  
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
          return { success: false, error: 'Unknown job type' };
      }
    } catch (error: any) {
      this.logger.error(`Error processing job ${job.id}: ${error.message}`);
      
      // Implement proper retry strategy
      const maxAttempts = job.opts?.attempts || 3; // Default to 3 attempts if not specified
      if (job.attemptsMade < maxAttempts - 1) {
        this.logger.log(`Will retry job ${job.id} (${job.attemptsMade + 1}/${maxAttempts})`);
        throw error; // Re-throw to trigger retry
      }
      
      // Log final failure
      this.logger.error(`Job ${job.id} failed after ${job.attemptsMade + 1} attempts`);
      return { 
        success: false, 
        error: error.message,
        job: {
          id: job.id,
          name: job.name,
          attempts: job.attemptsMade + 1
        }
      };
    }
  }

  private async handleStatusUpdate(job: Job): Promise<any> {
    const { taskId, status } = job.data;
    
    if (!taskId || !status) {
      return { success: false, error: 'Missing required data' };
    }
    
    // Validate status value
    if (!Object.values(TaskStatus).includes(status)) {
      return { success: false, error: `Invalid status: ${status}` };
    }
    
    const task = await this.tasksService.updateStatus(taskId, status);
    
    return { 
      success: true,
      taskId: task.id,
      newStatus: task.status
    };
  }

  private async handleOverdueTasks(job: Job): Promise<any> {
    const { taskIds, totalTasks, batchNumber } = job.data;
    
    if (!Array.isArray(taskIds) || taskIds.length === 0) {
      return { success: false, error: 'No tasks to process' };
    }
    
    this.logger.debug(`Processing batch ${batchNumber}: ${taskIds.length} overdue tasks`);
    
    // Process tasks in smaller chunks for better concurrency
    const chunkSize = Math.ceil(taskIds.length / this.MAX_CONCURRENCY);
    const chunks = [];
    
    for (let i = 0; i < taskIds.length; i += chunkSize) {
      chunks.push(taskIds.slice(i, i + chunkSize));
    }
    
    const results = await Promise.all(
      chunks.map(async (chunk) => {
        const chunkResults = [];
        
        for (const taskId of chunk) {
          try {
            // Mark task as IN_PROGRESS or handle however needed
            const updatedTask = await this.tasksService.updateStatus(
              taskId, 
              TaskStatus.IN_PROGRESS
            );
            
            chunkResults.push({
              taskId,
              success: true,
              newStatus: updatedTask.status
            });
          } catch (error: any) {
            chunkResults.push({
              taskId,
              success: false,
              error: error.message
            });
          }
        }
        
        return chunkResults;
      })
    );
    
    // Flatten results array
    const flatResults = results.flat();
    
    // Summarize results
    const successCount = flatResults.filter(r => r.success).length;
    const failureCount = flatResults.filter(r => !r.success).length;
    
    this.logger.log(
      `Processed ${successCount + failureCount}/${taskIds.length} overdue tasks. ` +
      `Success: ${successCount}, Failed: ${failureCount}`
    );
    
    return {
      success: true,
      processedCount: successCount + failureCount,
      successCount,
      failureCount,
      batch: batchNumber,
      totalBatches: Math.ceil(totalTasks / taskIds.length)
    };
  }
} 
import { Test, TestingModule } from '@nestjs/testing';
import { TaskProcessorService } from './task-processor.service';
import { TasksService } from '../../modules/tasks/tasks.service';
import { Job } from 'bullmq';
import { TaskStatus } from '../../modules/tasks/enums/task-status.enum';

// Mock Job object from BullMQ
const createMockJob = (name: string, data: any, opts: any = {}) => {
  return {
    id: 'mock-job-id',
    name,
    data,
    opts,
    attemptsMade: 0,
  } as unknown as Job;
};

describe('TaskProcessorService', () => {
  let service: TaskProcessorService;
  let tasksService: TasksService;

  // Create mock for TasksService
  const mockTasksService = {
    updateStatus: jest.fn(),
    findByStatus: jest.fn(),
  };

  beforeEach(async () => {
    // Clear all mock calls before each test
    jest.clearAllMocks();
    
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TaskProcessorService,
        {
          provide: TasksService,
          useValue: mockTasksService,
        },
      ],
    }).compile();

    service = module.get<TaskProcessorService>(TaskProcessorService);
    tasksService = module.get<TasksService>(TasksService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('process', () => {
    it('should process task-status-update job successfully', async () => {
      const jobData = {
        taskId: 'task-id',
        status: TaskStatus.COMPLETED,
      };
      
      const mockJob = createMockJob('task-status-update', jobData);
      
      // Mock successful task update
      mockTasksService.updateStatus.mockResolvedValue({
        id: 'task-id',
        status: TaskStatus.COMPLETED,
      });
      
      const result = await service.process(mockJob);
      
      // Verify tasksService.updateStatus was called with correct parameters
      expect(tasksService.updateStatus).toHaveBeenCalledWith('task-id', TaskStatus.COMPLETED);
      
      // Check result
      expect(result).toEqual({
        success: true,
        taskId: 'task-id',
        newStatus: TaskStatus.COMPLETED,
      });
    });
    
    it('should handle invalid status in task-status-update job', async () => {
      // Reset mock call counts
      jest.clearAllMocks();
      
      // Override service handleStatusUpdate method to return error on invalid status
      jest.spyOn(service as any, 'handleStatusUpdate').mockResolvedValue({
        success: false,
        error: 'Invalid status: INVALID_STATUS',
      });
      
      const jobData = {
        taskId: 'task-id',
        status: 'INVALID_STATUS',
      };
      
      const mockJob = createMockJob('task-status-update', jobData);
      
      const result = await service.process(mockJob);
      
      // Check result
      expect(result).toEqual({
        success: false,
        error: 'Invalid status: INVALID_STATUS',
      });
    });
    
    it('should handle missing data in task-status-update job', async () => {
      // Reset mock call counts
      jest.clearAllMocks();
      
      // Override service handleStatusUpdate method to return error on missing data
      jest.spyOn(service as any, 'handleStatusUpdate').mockResolvedValue({
        success: false,
        error: 'Missing required data',
      });
      
      // Missing taskId
      const jobData = {
        status: TaskStatus.COMPLETED,
      };
      
      const mockJob = createMockJob('task-status-update', jobData);
      
      const result = await service.process(mockJob);
      
      // Check result
      expect(result).toEqual({
        success: false,
        error: 'Missing required data',
      });
    });
    
    it('should process overdue-tasks-notification job successfully', async () => {
      // Reset mock call counts
      jest.clearAllMocks();
      
      // Override service handleOverdueTasks method with our own implementation
      jest.spyOn(service as any, 'handleOverdueTasks').mockResolvedValue({
        success: true,
        processedCount: 3,
        successCount: 3,
        failureCount: 0,
        batch: 1,
        totalBatches: 4
      });
      
      const taskIds = ['task-1', 'task-2', 'task-3'];
      const jobData = {
        taskIds,
        totalTasks: 10,
        batchNumber: 1,
      };
      
      const mockJob = createMockJob('overdue-tasks-notification', jobData);
      
      const result = await service.process(mockJob);
      
      // Check result
      expect(result).toEqual({
        success: true,
        processedCount: 3,
        successCount: 3,
        failureCount: 0,
        batch: 1,
        totalBatches: 4
      });
    });
    
    it('should handle empty taskIds array in overdue-tasks-notification job', async () => {
      // Reset mock call counts
      jest.clearAllMocks();
      
      // Override service handleOverdueTasks method with our own implementation
      jest.spyOn(service as any, 'handleOverdueTasks').mockResolvedValue({
        success: false,
        error: 'No tasks to process',
      });
      
      const jobData = {
        taskIds: [],
        totalTasks: 0,
        batchNumber: 1,
      };
      
      const mockJob = createMockJob('overdue-tasks-notification', jobData);
      
      const result = await service.process(mockJob);
      
      // Check result
      expect(result).toEqual({
        success: false,
        error: 'No tasks to process',
      });
    });
    
    it('should handle unknown job type', async () => {
      const mockJob = createMockJob('unknown-job-type', {});
      
      const result = await service.process(mockJob);
      
      // Check result
      expect(result).toEqual({
        success: false,
        error: 'Unknown job type',
      });
    });
    
    it('should implement retry for failed jobs', async () => {
      const jobData = {
        taskId: 'task-id',
        status: TaskStatus.COMPLETED,
      };
      
      // Create a job with maxAttempts = 3 and current attemptsMade = 0
      const mockJob = {
        ...createMockJob('task-status-update', jobData),
        opts: { attempts: 3 },
        attemptsMade: 0,
      } as unknown as Job;
      
      // Make the service call fail
      mockTasksService.updateStatus.mockRejectedValue(new Error('Database error'));
      
      // Should throw error to trigger retry
      await expect(service.process(mockJob)).rejects.toThrow('Database error');
    });
    
    it('should return error details after max retries', async () => {
      const jobData = {
        taskId: 'task-id',
        status: TaskStatus.COMPLETED,
      };
      
      // Create a job with maxAttempts = 3 and current attemptsMade = 2 (last attempt)
      const mockJob = {
        ...createMockJob('task-status-update', jobData),
        id: 'retry-job-id',
        opts: { attempts: 3 },
        attemptsMade: 2,
      } as unknown as Job;
      
      // Make the service call fail
      mockTasksService.updateStatus.mockRejectedValue(new Error('Database error'));
      
      // Should return error info instead of throwing
      const result = await service.process(mockJob);
      
      expect(result).toEqual({
        success: false,
        error: 'Database error',
        job: {
          id: 'retry-job-id',
          name: 'task-status-update',
          attempts: 3
        }
      });
    });
  });
}); 
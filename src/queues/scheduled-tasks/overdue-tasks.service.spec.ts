import { Test, TestingModule } from '@nestjs/testing';
import { OverdueTasksService } from './overdue-tasks.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bullmq';
import { Task } from '../../modules/tasks/entities/task.entity';
import { TaskStatus } from '../../modules/tasks/enums/task-status.enum';
import { Queue } from 'bullmq';
import { Repository } from 'typeorm';

describe('OverdueTasksService', () => {
  let service: OverdueTasksService;
  let taskRepository: Repository<Task>;
  let taskQueue: Queue;

  // Create mocks
  const mockRepository = {
    count: jest.fn(),
    find: jest.fn(),
  };

  const mockQueue = {
    add: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OverdueTasksService,
        {
          provide: getRepositoryToken(Task),
          useValue: mockRepository,
        },
        {
          provide: getQueueToken('task-processing'),
          useValue: mockQueue,
        },
      ],
    }).compile();

    service = module.get<OverdueTasksService>(OverdueTasksService);
    taskRepository = module.get<Repository<Task>>(getRepositoryToken(Task));
    taskQueue = module.get<Queue>(getQueueToken('task-processing'));

    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('checkOverdueTasks', () => {
    it('should do nothing when no overdue tasks are found', async () => {
      // Mock count returning 0 overdue tasks
      mockRepository.count.mockResolvedValue(0);

      await service.checkOverdueTasks();

      // Verify the count query was called with correct parameters
      expect(mockRepository.count).toHaveBeenCalledWith({
        where: {
          dueDate: expect.any(Object), // LessThan(now)
          status: TaskStatus.PENDING,
        },
      });

      // Verify find wasn't called
      expect(mockRepository.find).not.toHaveBeenCalled();
      
      // Verify queue add wasn't called
      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('should process overdue tasks in a single batch', async () => {
      // Mock data for a single batch (less than batch size)
      const overdueTasks = [
        { id: 'task-1', status: TaskStatus.PENDING, dueDate: new Date(2023, 0, 1) },
        { id: 'task-2', status: TaskStatus.PENDING, dueDate: new Date(2023, 0, 1) },
      ];

      // Mock count and find
      mockRepository.count.mockResolvedValue(2);
      mockRepository.find.mockResolvedValue(overdueTasks);

      await service.checkOverdueTasks();

      // Verify find was called with correct parameters
      expect(mockRepository.find).toHaveBeenCalledWith({
        where: {
          dueDate: expect.any(Object), // LessThan(now)
          status: TaskStatus.PENDING,
        },
        take: 100, // Batch size
        skip: 0,
      });

      // Verify queue.add was called with correct parameters
      expect(mockQueue.add).toHaveBeenCalledWith(
        'overdue-tasks-notification',
        {
          taskIds: ['task-1', 'task-2'],
          totalTasks: 2,
          batchNumber: 1,
        },
        expect.any(Object)
      );

      // Should only add to queue once for a single batch
      expect(mockQueue.add).toHaveBeenCalledTimes(1);
    });

    it('should process overdue tasks in multiple batches', async () => {
      // Create enough mock tasks to require multiple batches
      const batch1 = Array.from({ length: 100 }, (_, i) => ({
        id: `task-${i + 1}`,
        status: TaskStatus.PENDING,
        dueDate: new Date(2023, 0, 1),
      }));

      const batch2 = Array.from({ length: 50 }, (_, i) => ({
        id: `task-${i + 101}`,
        status: TaskStatus.PENDING,
        dueDate: new Date(2023, 0, 1),
      }));

      // Mock count for total tasks
      mockRepository.count.mockResolvedValue(150);
      
      // Mock a simpler implementation that directly tests the method's behavior
      // Instead of trying to mock internal iterations, let's simplify:
      // 1. First call: 150 tasks in DB
      // 2. Then process first batch (100 tasks)
      // 3. Then process second batch (50 tasks)
      
      mockRepository.find.mockImplementation((params) => {
        const skip = params.skip || 0;
        
        if (skip === 0) {
          return Promise.resolve(batch1); // First 100 tasks
        } else if (skip === 100) {
          return Promise.resolve(batch2); // Next 50 tasks
        } else {
          return Promise.resolve([]); // No more tasks
        }
      });
      
      await service.checkOverdueTasks();

      // Verify find was called for each batch
      expect(mockRepository.find).toHaveBeenCalledWith({
        where: {
          dueDate: expect.any(Object),
          status: TaskStatus.PENDING,
        },
        take: 100,
        skip: 0,
      });
      
      expect(mockRepository.find).toHaveBeenCalledWith({
        where: {
          dueDate: expect.any(Object),
          status: TaskStatus.PENDING,
        },
        take: 100,
        skip: 100,
      });

      // Verify queue.add was called for each batch
      expect(mockQueue.add).toHaveBeenCalledTimes(2);
      
      // Check first batch
      expect(mockQueue.add).toHaveBeenNthCalledWith(
        1,
        'overdue-tasks-notification',
        {
          taskIds: batch1.map(task => task.id),
          totalTasks: 150,
          batchNumber: 1,
        },
        expect.any(Object)
      );
      
      // Check second batch
      expect(mockQueue.add).toHaveBeenNthCalledWith(
        2,
        'overdue-tasks-notification',
        {
          taskIds: batch2.map(task => task.id),
          totalTasks: 150,
          batchNumber: 2,
        },
        expect.any(Object)
      );
    });

    it('should handle database errors gracefully', async () => {
      // Mock an error in the database query
      const dbError = new Error('Database connection error');
      mockRepository.count.mockRejectedValue(dbError);

      // Expect the service to properly handle the error
      await expect(service.checkOverdueTasks()).rejects.toThrow(dbError);

      // No queue additions should have been attempted
      expect(mockQueue.add).not.toHaveBeenCalled();
    });
  });
}); 
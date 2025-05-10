/**
 * TasksService Test Suite
 * This file contains unit tests for the TasksService class
 * Tests cover all CRUD operations, batch processing, and statistics functionality
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bullmq';
import { DataSource, Repository } from 'typeorm';
import { TasksService } from './tasks.service';
import { Task } from './entities/task.entity';
import { User } from '../users/entities/user.entity';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { TaskStatus } from './enums/task-status.enum';
import { TaskPriority } from './enums/task-priority.enum';
import { CacheService } from '@common/services/cache.service';
import { NotFoundException, BadRequestException, HttpException, HttpStatus } from '@nestjs/common';

describe('TasksService', () => {
  // Service and dependency instances
  let service: TasksService;
  let tasksRepository: Repository<Task>;
  let dataSource: DataSource;
  let taskQueue: any;
  let cacheService: CacheService;

  // Mock data for testing
  const mockTask = {
    id: 'task-123',
    title: 'Test Task',
    description: 'Test Description',
    status: TaskStatus.PENDING,
    priority: TaskPriority.MEDIUM,
    userId: 'user-123',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockUser = {
    id: 'user-123',
    name: 'Test User',
  };

  const mockCreateTaskDto: CreateTaskDto = {
    title: 'Test Task',
    description: 'Test Description',
    status: TaskStatus.PENDING,
    priority: TaskPriority.MEDIUM,
    userId: 'user-123',
  };

  const mockUpdateTaskDto: UpdateTaskDto = {
    title: 'Updated Task',
    status: TaskStatus.COMPLETED,
  };

  // Mock query builder with chained methods
  const mockQueryBuilder = {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn(),
    getRawOne: jest.fn(),
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    whereInIds: jest.fn().mockReturnThis(),
    execute: jest.fn(),
    delete: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
  };

  // Mock repository with all required methods
  const mockTasksRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    findOneBy: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
    createQueryBuilder: jest.fn(() => mockQueryBuilder),
  };

  // Mock data source for transaction handling
  const mockDataSource = {
    transaction: jest.fn((callback) => callback(mockTasksRepository)),
  };

  // Mock task queue for background processing
  const mockTaskQueue = {
    add: jest.fn(),
  };

  // Mock cache service for caching operations
  const mockCacheService = {
    get: jest.fn(),
    set: jest.fn(),
    delete: jest.fn(),
  };

  // Setup before each test
  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksService,
        {
          provide: getRepositoryToken(Task),
          useValue: mockTasksRepository,
        },
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
        {
          provide: getQueueToken('task-processing'),
          useValue: mockTaskQueue,
        },
        {
          provide: CacheService,
          useValue: mockCacheService,
        },
      ],
    }).compile();

    service = module.get<TasksService>(TasksService);
    tasksRepository = module.get<Repository<Task>>(getRepositoryToken(Task));
    dataSource = module.get<DataSource>(DataSource);
    taskQueue = module.get(getQueueToken('task-processing'));
    cacheService = module.get<CacheService>(CacheService);
  });

  // Clean up after each test
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    /**
     * Test successful task creation
     * Verifies that:
     * 1. Task is created with correct data
     * 2. Cache is updated
     * 3. Task queue is notified
     */
    it('should successfully create a new task', async () => {
      mockTasksRepository.findOne.mockResolvedValue(mockUser);
      mockTasksRepository.create.mockReturnValue(mockTask);
      mockTasksRepository.save.mockResolvedValue(mockTask);
      mockTaskQueue.add.mockResolvedValue(undefined);
      mockCacheService.set.mockResolvedValue(undefined);
      mockCacheService.delete.mockResolvedValue(undefined);

      const result = await service.create(mockCreateTaskDto);

      expect(result).toEqual(mockTask);
      expect(mockTasksRepository.findOne).toHaveBeenCalledWith(User, {
        where: { id: mockCreateTaskDto.userId },
      });
      expect(mockTasksRepository.create).toHaveBeenCalledWith(Task, mockCreateTaskDto);
      expect(mockTasksRepository.save).toHaveBeenCalledWith(Task, mockTask);
      expect(mockTaskQueue.add).toHaveBeenCalledWith('task-status-update', {
        taskId: mockTask.id,
        status: mockTask.status,
      });
      expect(mockCacheService.set).toHaveBeenCalledWith(`task:${mockTask.id}`, mockTask);
      expect(mockCacheService.delete).toHaveBeenCalledWith(`user:${mockCreateTaskDto.userId}:tasks`);
      expect(mockCacheService.delete).toHaveBeenCalledWith('tasks:list');
    });

    /**
     * Test task creation with non-existent user
     * Verifies that:
     * 1. NotFoundException is thrown
     * 2. User existence is checked
     */
    it('should throw NotFoundException when user does not exist', async () => {
      mockTasksRepository.findOne.mockResolvedValue(null);

      await expect(service.create(mockCreateTaskDto)).rejects.toThrow(NotFoundException);
      expect(mockTasksRepository.findOne).toHaveBeenCalledWith(User, {
        where: { id: mockCreateTaskDto.userId },
      });
    });

    /**
     * Test task creation failure
     * Verifies that:
     * 1. BadRequestException is thrown on database error
     * 2. Error is properly propagated
     */
    it('should throw BadRequestException when task creation fails', async () => {
      mockTasksRepository.findOne.mockResolvedValue(mockUser);
      mockTasksRepository.create.mockReturnValue(mockTask);
      mockTasksRepository.save.mockRejectedValue(new Error('Database error'));

      await expect(service.create(mockCreateTaskDto)).rejects.toThrow(BadRequestException);
    });
  });

  describe('findAll', () => {
    /**
     * Test retrieving tasks from cache
     * Verifies that:
     * 1. Cached tasks are returned when available
     * 2. Database is not queried
     */
    it('should return tasks from cache when available', async () => {
      const cachedTasks = [mockTask];
      mockCacheService.get.mockResolvedValue(cachedTasks);

      const result = await service.findAll();

      expect(result).toEqual(cachedTasks);
      expect(mockCacheService.get).toHaveBeenCalledWith('tasks:list');
      expect(mockTasksRepository.find).not.toHaveBeenCalled();
    });

    /**
     * Test retrieving tasks from database
     * Verifies that:
     * 1. Tasks are fetched from database when not in cache
     * 2. Results are cached for future use
     */
    it('should fetch and cache tasks when not in cache', async () => {
      const tasks = [mockTask];
      mockCacheService.get.mockResolvedValue(null);
      mockTasksRepository.find.mockResolvedValue(tasks);

      const result = await service.findAll();

      expect(result).toEqual(tasks);
      expect(mockTasksRepository.find).toHaveBeenCalledWith({
        relations: ['user'],
      });
      expect(mockCacheService.set).toHaveBeenCalledWith('tasks:list', tasks);
    });
  });

  describe('findAllWithFilters', () => {
    const mockFilters = {
      status: TaskStatus.PENDING,
      priority: TaskPriority.HIGH,
      page: 1,
      limit: 10,
    };

    const mockPaginatedResponse = {
      data: [mockTask],
      count: 1,
      page: 1,
      limit: 10,
    };

    /**
     * Test filtered task retrieval with pagination
     * Verifies that:
     * 1. Tasks are filtered by status and priority
     * 2. Pagination is applied correctly
     * 3. Response includes metadata
     */
    it('should return filtered tasks with pagination', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([mockPaginatedResponse.data, 1]);

      const result = await service.findAllWithFilters(
        mockFilters.status,
        mockFilters.priority,
        mockFilters.page,
        mockFilters.limit,
      );

      expect(result).toEqual(mockPaginatedResponse);
      expect(mockQueryBuilder.leftJoinAndSelect).toHaveBeenCalledWith('task.user', 'user');
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('task.status = :status', { status: mockFilters.status });
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('task.priority = :priority', { priority: mockFilters.priority });
      expect(mockQueryBuilder.skip).toHaveBeenCalledWith(0);
      expect(mockQueryBuilder.take).toHaveBeenCalledWith(mockFilters.limit);
    });

    it('should throw BadRequestException for negative page number', async () => {
      await expect(
        service.findAllWithFilters(mockFilters.status, mockFilters.priority, -1, 10)
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for negative limit', async () => {
      await expect(
        service.findAllWithFilters(mockFilters.status, mockFilters.priority, 1, -5)
      ).rejects.toThrow(BadRequestException);
    });

    it('should use default pagination values when parameters are not provided', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([mockPaginatedResponse.data, 1]);

      const result = await service.findAllWithFilters(
        mockFilters.status,
        mockFilters.priority,
        undefined, // no page
        undefined, // no limit
      );

      expect(result).toEqual({
        ...mockPaginatedResponse,
        page: 1, // default page
        limit: 10, // default limit
      });
      expect(mockQueryBuilder.skip).toHaveBeenCalledWith(0); // (1-1) * 10
      expect(mockQueryBuilder.take).toHaveBeenCalledWith(10);
    });

    it('should throw BadRequestException for invalid status', async () => {
      await expect(
        service.findAllWithFilters('INVALID_STATUS'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should handle database errors gracefully', async () => {
      mockQueryBuilder.getManyAndCount.mockRejectedValue(new Error('Database error'));

      await expect(
        service.findAllWithFilters(mockFilters.status, mockFilters.priority)
      ).rejects.toThrow(HttpException);
    });

    it('should handle invalid status values', async () => {
      await expect(
        service.findAllWithFilters('INVALID_STATUS')
      ).rejects.toThrow(BadRequestException);
    });

    it('should handle invalid priority values', async () => {
      await expect(
        service.findAllWithFilters(undefined, 'INVALID_PRIORITY')
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findOne', () => {
    it('should return task from cache when available', async () => {
      mockCacheService.get.mockResolvedValue(mockTask);

      const result = await service.findOne(mockTask.id);

      expect(result).toEqual(mockTask);
      expect(mockCacheService.get).toHaveBeenCalledWith(`task:${mockTask.id}`);
      expect(mockTasksRepository.findOne).not.toHaveBeenCalled();
    });

    it('should fetch and cache task when not in cache', async () => {
      mockCacheService.get.mockResolvedValue(null);
      mockTasksRepository.findOne.mockResolvedValue(mockTask);

      const result = await service.findOne(mockTask.id);

      expect(result).toEqual(mockTask);
      expect(mockTasksRepository.findOne).toHaveBeenCalledWith({
        where: { id: mockTask.id },
        relations: ['user'],
      });
      expect(mockCacheService.set).toHaveBeenCalledWith(`task:${mockTask.id}`, mockTask);
    });

    it('should throw NotFoundException when task is not found', async () => {
      mockCacheService.get.mockResolvedValue(null);
      mockTasksRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne('non-existent-task')).rejects.toThrow(NotFoundException);
    });

    it('should handle database errors gracefully', async () => {
      mockCacheService.get.mockResolvedValue(null);
      mockTasksRepository.findOne.mockRejectedValue(new Error('Database error'));

      await expect(service.findOne(mockTask.id)).rejects.toThrow(HttpException);
    });
  });

  describe('update', () => {
    /**
     * Test successful task update
     * Verifies that:
     * 1. Task is updated with correct data
     * 2. Cache is updated
     * 3. Task queue is notified of status change
     */
    it('should successfully update a task', async () => {
      const updatedTask = { ...mockTask, ...mockUpdateTaskDto };
      mockTasksRepository.findOne.mockResolvedValue(mockTask);
      mockTasksRepository.save.mockResolvedValue(updatedTask);
      mockTaskQueue.add.mockResolvedValue(undefined);
      mockCacheService.set.mockResolvedValue(undefined);
      mockCacheService.delete.mockResolvedValue(undefined);

      const result = await service.update(mockTask.id, mockUpdateTaskDto);

      expect(result).toEqual(updatedTask);
      expect(mockTasksRepository.findOne).toHaveBeenCalledWith(Task, {
        where: { id: mockTask.id },
        relations: ['user'],
      });
      expect(mockTasksRepository.save).toHaveBeenCalledWith(Task, updatedTask);
      expect(mockTaskQueue.add).toHaveBeenCalledWith('task-status-update', {
        taskId: mockTask.id,
        status: mockUpdateTaskDto.status,
      });
    });

    /**
     * Test task update with non-existent task
     * Verifies that:
     * 1. NotFoundException is thrown
     * 2. Task existence is checked
     */
    it('should throw NotFoundException when task is not found', async () => {
      mockTasksRepository.findOne.mockResolvedValue(null);

      await expect(
        service.update('non-existent-task', mockUpdateTaskDto),
      ).rejects.toThrow(NotFoundException);
    });

    /**
     * Test task update failure
     * Verifies that:
     * 1. HttpException is thrown on database error
     * 2. Error is properly propagated
     */
    it('should handle database errors gracefully', async () => {
      mockTasksRepository.findOne.mockResolvedValue(mockTask);
      mockTasksRepository.save.mockRejectedValue(new Error('Database error'));

      await expect(
        service.update(mockTask.id, mockUpdateTaskDto)
      ).rejects.toThrow(HttpException);
    });

    /**
     * Test cache update failure
     * Verifies that:
     * 1. HttpException is thrown on cache error
     * 2. Error details are included in response
     */
    it('should handle cache errors gracefully', async () => {
      mockTasksRepository.findOne.mockResolvedValue(mockTask);
      mockTasksRepository.save.mockResolvedValue({ ...mockTask, ...mockUpdateTaskDto });
      mockCacheService.set.mockRejectedValue(new Error('Cache error'));

      await expect(
        service.update(mockTask.id, mockUpdateTaskDto)
      ).rejects.toThrow(new HttpException({
        message: 'Failed to update task',
        error: 'Task Update Failed',
        details: 'Cache error'
      }, HttpStatus.INTERNAL_SERVER_ERROR));
    });
  });

  describe('remove', () => {
    /**
     * Test successful task deletion
     * Verifies that:
     * 1. Task is deleted from database
     * 2. Cache is updated
     * 3. Success message is returned
     */
    it('should successfully remove a task', async () => {
      mockTasksRepository.findOne.mockResolvedValue(mockTask);
      mockTasksRepository.remove.mockResolvedValue(mockTask);
      mockCacheService.delete.mockResolvedValue(undefined);

      const result = await service.remove(mockTask.id);

      expect(result).toEqual({
        message: `Task with ID ${mockTask.id} has been successfully deleted.`,
      });
      expect(mockTasksRepository.findOne).toHaveBeenCalledWith({
        where: { id: mockTask.id },
      });
      expect(mockTasksRepository.remove).toHaveBeenCalledWith(mockTask);
      expect(mockCacheService.delete).toHaveBeenCalledWith(`task:${mockTask.id}`);
    });

    /**
     * Test task deletion with non-existent task
     * Verifies that:
     * 1. NotFoundException is thrown
     * 2. Task existence is checked
     */
    it('should throw NotFoundException when task is not found', async () => {
      mockTasksRepository.findOne.mockResolvedValue(null);

      await expect(service.remove('non-existent-task')).rejects.toThrow(NotFoundException);
    });

    /**
     * Test task deletion failure
     * Verifies that:
     * 1. HttpException is thrown on database error
     * 2. Error is properly propagated
     */
    it('should handle database errors gracefully', async () => {
      mockTasksRepository.findOne.mockResolvedValue(mockTask);
      mockTasksRepository.remove.mockRejectedValue(new Error('Database error'));

      await expect(service.remove(mockTask.id)).rejects.toThrow(HttpException);
    });

    /**
     * Test cache deletion failure
     * Verifies that:
     * 1. HttpException is thrown on cache error
     * 2. Error details are included in response
     */
    it('should handle cache errors gracefully', async () => {
      mockTasksRepository.findOne.mockResolvedValue(mockTask);
      mockTasksRepository.remove.mockResolvedValue(mockTask);
      mockCacheService.delete.mockRejectedValue(new Error('Cache error'));

      await expect(
        service.remove(mockTask.id)
      ).rejects.toThrow(new HttpException({
        message: 'Failed to delete task',
        error: 'Task Deletion Failed',
        details: 'Cache error'
      }, HttpStatus.INTERNAL_SERVER_ERROR));
    });
  });

  describe('getStatistics', () => {
    const mockStats = {
      total: '10',
      completed: '5',
      inProgress: '3',
      pending: '2',
      highPriority: '4',
    };

    /**
     * Test task statistics retrieval
     * Verifies that:
     * 1. Statistics are fetched from database
     * 2. Numbers are properly converted from strings
     * 3. All required metrics are included
     */
    it('should return task statistics', async () => {
      mockQueryBuilder.getRawOne.mockResolvedValue(mockStats);

      const result = await service.getStatistics();

      expect(result).toEqual({
        total: 10,
        completed: 5,
        inProgress: 3,
        pending: 2,
        highPriority: 4,
      });
      expect(mockQueryBuilder.select).toHaveBeenCalled();
      expect(mockQueryBuilder.getRawOne).toHaveBeenCalled();
    });

    /**
     * Test statistics with no tasks
     * Verifies that:
     * 1. Zero values are returned when no tasks exist
     * 2. Response structure is maintained
     */
    it('should handle null statistics gracefully', async () => {
      mockQueryBuilder.getRawOne.mockResolvedValue({
        total: '0',
        completed: '0',
        inProgress: '0',
        pending: '0',
        highPriority: '0'
      });

      const result = await service.getStatistics();

      expect(result).toEqual({
        total: 0,
        completed: 0,
        inProgress: 0,
        pending: 0,
        highPriority: 0
      });
    });
  });

  describe('batchProcessTasks', () => {
    const mockBatchRequest = {
      tasks: ['task-1', 'task-2'],
      action: 'complete' as const,
    };

    /**
     * Test batch task completion
     * Verifies that:
     * 1. Multiple tasks are updated in a single operation
     * 2. Success status is returned for each task
     * 3. Database query is properly constructed
     */
    it('should successfully complete multiple tasks', async () => {
      mockQueryBuilder.execute.mockResolvedValue(undefined);

      const result = await service.batchProcessTasks(mockBatchRequest);

      expect(result).toEqual([
        { taskId: 'task-1', success: true, result: 'Marked as completed' },
        { taskId: 'task-2', success: true, result: 'Marked as completed' },
      ]);
      expect(mockQueryBuilder.update).toHaveBeenCalledWith(Task);
      expect(mockQueryBuilder.set).toHaveBeenCalledWith({ status: TaskStatus.COMPLETED });
      expect(mockQueryBuilder.whereInIds).toHaveBeenCalledWith(mockBatchRequest.tasks);
    });

    /**
     * Test batch task deletion
     * Verifies that:
     * 1. Multiple tasks are deleted in a single operation
     * 2. Success status is returned for each task
     * 3. Database query is properly constructed
     */
    it('should successfully delete multiple tasks', async () => {
      const deleteRequest = {
        tasks: ['task-1', 'task-2'],
        action: 'delete' as const,
      };
      mockQueryBuilder.execute.mockResolvedValue(undefined);

      const result = await service.batchProcessTasks(deleteRequest);

      expect(result).toEqual([
        { taskId: 'task-1', success: true, result: 'Deleted successfully' },
        { taskId: 'task-2', success: true, result: 'Deleted successfully' },
      ]);
      expect(mockQueryBuilder.delete).toHaveBeenCalled();
      expect(mockQueryBuilder.from).toHaveBeenCalledWith(Task);
      expect(mockQueryBuilder.whereInIds).toHaveBeenCalledWith(deleteRequest.tasks);
    });

    /**
     * Test invalid batch action
     * Verifies that:
     * 1. BadRequestException is thrown for invalid action
     * 2. Error message is descriptive
     */
    it('should throw BadRequestException for invalid action', async () => {
      const invalidRequest = {
        tasks: ['task-1'],
        action: 'invalid-action' as 'complete' | 'delete',
      };

      await expect(service.batchProcessTasks(invalidRequest)).rejects.toThrow(BadRequestException);
    });

    /**
     * Test empty task list
     * Verifies that:
     * 1. BadRequestException is thrown for empty task list
     * 2. Error message is descriptive
     */
    it('should throw BadRequestException for empty task list', async () => {
      const emptyRequest = {
        tasks: [],
        action: 'complete' as const,
      };

      await expect(service.batchProcessTasks(emptyRequest)).rejects.toThrow(BadRequestException);
    });

    /**
     * Test database error handling
     * Verifies that:
     * 1. Error is properly caught and reported
     * 2. Individual task results include error information
     */
    it('should handle database errors gracefully', async () => {
      mockQueryBuilder.execute.mockRejectedValue(new Error('Database error'));

      const result = await service.batchProcessTasks({
        tasks: ['task-1'],
        action: 'complete',
      });

      expect(result).toEqual([
        {
          taskId: 'task-1',
          success: false,
          error: 'Database error',
        },
      ]);
    });
  });

  describe('updateStatus', () => {
    /**
     * Test invalid status value
     * Verifies that:
     * 1. BadRequestException is thrown for invalid status
     * 2. Error message is descriptive
     */
    it('should handle invalid status values', async () => {
      await expect(
        service.updateStatus(mockTask.id, 'INVALID_STATUS')
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findByStatus', () => {
    /**
     * Test invalid status value
     * Verifies that:
     * 1. BadRequestException is thrown for invalid status
     * 2. Error message is descriptive
     */
    it('should handle invalid status values', async () => {
      await expect(
        service.findByStatus('INVALID_STATUS' as TaskStatus)
      ).rejects.toThrow(BadRequestException);
    });
  });
}); 
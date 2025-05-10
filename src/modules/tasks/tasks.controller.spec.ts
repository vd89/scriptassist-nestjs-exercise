/**
 * TasksController Test Suite
 * This file contains unit tests for the TasksController class
 * Tests cover all HTTP endpoints and their corresponding service method calls
 */
import { Test, TestingModule } from '@nestjs/testing';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { TaskStatus } from './enums/task-status.enum';
import { TaskPriority } from './enums/task-priority.enum';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { IBatchProcessRequest } from './interfaces/tasks.interface';

describe('TasksController', () => {
  // Controller and service instances
  let controller: TasksController;
  let service: TasksService;

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

  const mockBatchRequest: IBatchProcessRequest = {
    tasks: ['task-1', 'task-2'],
    action: 'complete',
  };

  // Mock service with all required methods
  const mockTasksService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findAllWithFilters: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    getStatistics: jest.fn(),
    batchProcessTasks: jest.fn(),
  };

  // Setup before each test
  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TasksController],
      providers: [
        {
          provide: TasksService,
          useValue: mockTasksService,
        },
      ],
    }).compile();

    controller = module.get<TasksController>(TasksController);
    service = module.get<TasksService>(TasksService);
  });

  // Clean up after each test
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    /**
     * Test successful task creation endpoint
     * Verifies that:
     * 1. Controller properly delegates to service
     * 2. Response matches service output
     * 3. Service is called with correct parameters
     */
    it('should successfully create a new task', async () => {
      mockTasksService.create.mockResolvedValue(mockTask);

      const result = await controller.create(mockCreateTaskDto);

      expect(result).toEqual(mockTask);
      expect(service.create).toHaveBeenCalledWith(mockCreateTaskDto);
      expect(service.create).toHaveBeenCalledTimes(1);
    });

    /**
     * Test task creation with non-existent user
     * Verifies that:
     * 1. NotFoundException is properly propagated
     * 2. Error handling is consistent
     */
    it('should throw NotFoundException when user does not exist', async () => {
      const error = new NotFoundException('User not found');
      mockTasksService.create.mockRejectedValue(error);

      await expect(controller.create(mockCreateTaskDto)).rejects.toThrow(NotFoundException);
      expect(service.create).toHaveBeenCalledWith(mockCreateTaskDto);
    });
  });

  describe('findAll', () => {
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
     * Test filtered task retrieval endpoint
     * Verifies that:
     * 1. Controller properly handles filter parameters
     * 2. Pagination is applied correctly
     * 3. Response includes all required metadata
     */
    it('should return paginated tasks with filters', async () => {
      mockTasksService.findAllWithFilters.mockResolvedValue(mockPaginatedResponse);

      const result = await controller.findAll(
        mockFilters.status,
        mockFilters.priority,
        mockFilters.page,
        mockFilters.limit,
      );

      expect(result).toEqual(mockPaginatedResponse);
      expect(service.findAllWithFilters).toHaveBeenCalledWith(
        mockFilters.status,
        mockFilters.priority,
        mockFilters.page,
        mockFilters.limit,
      );
    });

    /**
     * Test invalid filter parameters
     * Verifies that:
     * 1. BadRequestException is thrown for invalid parameters
     * 2. Error handling is consistent
     */
    it('should handle invalid filter parameters', async () => {
      const error = new BadRequestException('Invalid filter parameters');
      mockTasksService.findAllWithFilters.mockRejectedValue(error);

      await expect(
        controller.findAll('INVALID_STATUS', mockFilters.priority),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findOne', () => {
    /**
     * Test single task retrieval endpoint
     * Verifies that:
     * 1. Controller properly delegates to service
     * 2. Response matches service output
     * 3. Service is called with correct ID
     */
    it('should return a task by id', async () => {
      mockTasksService.findOne.mockResolvedValue(mockTask);

      const result = await controller.findOne(mockTask.id);

      expect(result).toEqual(mockTask);
      expect(service.findOne).toHaveBeenCalledWith(mockTask.id);
      expect(service.findOne).toHaveBeenCalledTimes(1);
    });

    /**
     * Test task retrieval with non-existent ID
     * Verifies that:
     * 1. NotFoundException is properly propagated
     * 2. Error handling is consistent
     */
    it('should throw NotFoundException when task is not found', async () => {
      const error = new NotFoundException('Task not found');
      mockTasksService.findOne.mockRejectedValue(error);

      await expect(controller.findOne('non-existent-task')).rejects.toThrow(NotFoundException);
      expect(service.findOne).toHaveBeenCalledWith('non-existent-task');
    });
  });

  describe('update', () => {
    /**
     * Test successful task update endpoint
     * Verifies that:
     * 1. Controller properly delegates to service
     * 2. Response matches service output
     * 3. Service is called with correct parameters
     */
    it('should successfully update a task', async () => {
      const updatedTask = { ...mockTask, ...mockUpdateTaskDto };
      mockTasksService.update.mockResolvedValue(updatedTask);

      const result = await controller.update(mockTask.id, mockUpdateTaskDto);

      expect(result).toEqual(updatedTask);
      expect(service.update).toHaveBeenCalledWith(mockTask.id, mockUpdateTaskDto);
      expect(service.update).toHaveBeenCalledTimes(1);
    });

    /**
     * Test task update with non-existent task
     * Verifies that:
     * 1. NotFoundException is properly propagated
     * 2. Error handling is consistent
     */
    it('should throw NotFoundException when task to update is not found', async () => {
      const error = new NotFoundException('Task not found');
      mockTasksService.update.mockRejectedValue(error);

      await expect(
        controller.update('non-existent-task', mockUpdateTaskDto),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    const mockDeleteResponse = {
      message: `Task with ID ${mockTask.id} has been successfully deleted.`,
    };

    /**
     * Test successful task deletion endpoint
     * Verifies that:
     * 1. Controller properly delegates to service
     * 2. Success message is returned
     * 3. Service is called with correct ID
     */
    it('should successfully delete a task', async () => {
      mockTasksService.remove.mockResolvedValue(mockDeleteResponse);

      const result = await controller.remove(mockTask.id);

      expect(result).toEqual(mockDeleteResponse);
      expect(service.remove).toHaveBeenCalledWith(mockTask.id);
      expect(service.remove).toHaveBeenCalledTimes(1);
    });

    /**
     * Test task deletion with non-existent task
     * Verifies that:
     * 1. NotFoundException is properly propagated
     * 2. Error handling is consistent
     */
    it('should throw NotFoundException when task to delete is not found', async () => {
      const error = new NotFoundException('Task not found');
      mockTasksService.remove.mockRejectedValue(error);

      await expect(controller.remove('non-existent-task')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getStats', () => {
    const mockStats = {
      total: 10,
      completed: 5,
      inProgress: 3,
      pending: 2,
      highPriority: 4,
    };

    /**
     * Test statistics retrieval endpoint
     * Verifies that:
     * 1. Controller properly delegates to service
     * 2. Statistics are returned correctly
     * 3. Service is called exactly once
     */
    it('should return task statistics', async () => {
      mockTasksService.getStatistics.mockResolvedValue(mockStats);

      const result = await controller.getStats();

      expect(result).toEqual(mockStats);
      expect(service.getStatistics).toHaveBeenCalled();
      expect(service.getStatistics).toHaveBeenCalledTimes(1);
    });

    /**
     * Test statistics retrieval failure
     * Verifies that:
     * 1. BadRequestException is properly propagated
     * 2. Error handling is consistent
     */
    it('should handle errors when fetching statistics', async () => {
      const error = new BadRequestException('Failed to fetch statistics');
      mockTasksService.getStatistics.mockRejectedValue(error);

      await expect(controller.getStats()).rejects.toThrow(BadRequestException);
    });
  });

  describe('batchProcess', () => {
    const mockBatchResponse = [
      { taskId: 'task-1', success: true, result: 'Marked as completed' },
      { taskId: 'task-2', success: true, result: 'Marked as completed' },
    ];

    /**
     * Test batch processing endpoint
     * Verifies that:
     * 1. Controller properly delegates to service
     * 2. Batch results are returned correctly
     * 3. Service is called with correct parameters
     */
    it('should successfully process multiple tasks', async () => {
      mockTasksService.batchProcessTasks.mockResolvedValue(mockBatchResponse);

      const result = await controller.batchProcess(mockBatchRequest);

      expect(result).toEqual(mockBatchResponse);
      expect(service.batchProcessTasks).toHaveBeenCalledWith(mockBatchRequest);
      expect(service.batchProcessTasks).toHaveBeenCalledTimes(1);
    });

    /**
     * Test batch processing with invalid action
     * Verifies that:
     * 1. BadRequestException is properly propagated
     * 2. Error handling is consistent
     */
    it('should throw BadRequestException for invalid action', async () => {
      const invalidRequest = {
        tasks: ['task-1'],
        action: 'invalid-action' as 'complete' | 'delete',
      };
      const error = new BadRequestException('Invalid action');
      mockTasksService.batchProcessTasks.mockRejectedValue(error);

      await expect(controller.batchProcess(invalidRequest)).rejects.toThrow(BadRequestException);
    });

    /**
     * Test batch processing with empty task list
     * Verifies that:
     * 1. BadRequestException is properly propagated
     * 2. Error handling is consistent
     */
    it('should handle empty task list', async () => {
      const emptyRequest = { tasks: [], action: 'complete' as const };
      const error = new BadRequestException('No task IDs provided');
      mockTasksService.batchProcessTasks.mockRejectedValue(error);

      await expect(controller.batchProcess(emptyRequest)).rejects.toThrow(BadRequestException);
    });
  });
}); 
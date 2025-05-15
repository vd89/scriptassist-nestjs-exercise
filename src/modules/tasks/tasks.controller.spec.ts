import { Test, TestingModule } from '@nestjs/testing';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { ValidationPipe, HttpException, HttpStatus } from '@nestjs/common';
import { Task } from './entities/task.entity';
import { TaskStatus } from './enums/task-status.enum';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { PaginatedResponseDto } from '../../common/dto/pagination-response.dto';

// Mock request object with authenticated user
const mockRequest = (user = {}) => ({
  user: {
    id: 'user-id',
    email: 'user@example.com',
    role: 'admin',
    ...user,
  },
});

describe('TasksController', () => {
  let controller: TasksController;
  let service: TasksService;

  // Mock TasksService
  const mockTasksService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    findByName: jest.fn(),
    getTaskStatistics: jest.fn(),
    batchProcessTasks: jest.fn(),
  };

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
    
    // Clear mock call history before each test
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should create a new task', async () => {
      const createTaskDto: CreateTaskDto = {
        title: 'New Task',
        description: 'Task Description',
        priority: 'high',
        status: TaskStatus.PENDING,
        dueDate: new Date().toISOString(),
      };

      const mockedTask = {
        id: 'task-id',
        ...createTaskDto,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockTasksService.create.mockResolvedValue(mockedTask);

      const result = await controller.create(createTaskDto);

      expect(service.create).toHaveBeenCalledWith(createTaskDto);
      expect(result).toEqual(mockedTask);
    });
  });

  describe('findAll', () => {
    it('should return paginated tasks with filters', async () => {
      const filterDto = {
        status: TaskStatus.PENDING,
        page: 1,
        limit: 10,
      };

      const mockTasks = [
        { id: '1', title: 'Task 1', status: TaskStatus.PENDING },
        { id: '2', title: 'Task 2', status: TaskStatus.PENDING },
      ];

      const paginatedResponse = {
        data: mockTasks,
        total: 2,
        page: 1,
        limit: 10,
        pageCount: 1,
        hasPreviousPage: false,
        hasNextPage: false,
      };

      mockTasksService.findAll.mockResolvedValue(paginatedResponse);
      
      const req = mockRequest();
      const result = await controller.findAll(filterDto, req);

      expect(service.findAll).toHaveBeenCalledWith(filterDto, req.user);
      expect(result).toEqual(paginatedResponse);
    });

    it('should pass user context for authorization filtering', async () => {
      const filterDto = {
        page: 1,
        limit: 10,
      };
      
      const regularUser = { id: 'regular-user-id', role: 'user' };
      const req = { user: regularUser };
      
      const mockResponse = {
        data: [],
        total: 0,
        page: 1,
        limit: 10,
        pageCount: 0,
        hasPreviousPage: false,
        hasNextPage: false,
      };
      
      jest.clearAllMocks();
      mockTasksService.findAll.mockResolvedValue(mockResponse);
      
      await controller.findAll(filterDto, req);
      
      expect(mockTasksService.findAll).toHaveBeenCalledWith(filterDto, regularUser);
    });
  });

  describe('findOne', () => {
    it('should return a task by ID', async () => {
      const mockTask = {
        id: 'task-id',
        title: 'Test Task',
        status: TaskStatus.PENDING,
      };

      mockTasksService.findOne.mockResolvedValue(mockTask);
      const req = mockRequest();
      
      const result = await controller.findOne('task-id', req);

      expect(service.findOne).toHaveBeenCalledWith('task-id', req.user);
      expect(result).toEqual(mockTask);
    });
  });

  describe('update', () => {
    it('should update a task', async () => {
      const updateTaskDto: UpdateTaskDto = {
        title: 'Updated Task',
        status: TaskStatus.COMPLETED,
      };

      const mockUpdatedTask = {
        id: 'task-id',
        title: 'Updated Task',
        status: TaskStatus.COMPLETED,
        updatedAt: new Date(),
      };

      mockTasksService.update.mockResolvedValue(mockUpdatedTask);
      const req = mockRequest();
      
      const result = await controller.update('task-id', updateTaskDto, req);

      expect(service.update).toHaveBeenCalledWith('task-id', updateTaskDto, req.user);
      expect(result).toEqual(mockUpdatedTask);
    });
  });

  describe('remove', () => {
    it('should delete a task', async () => {
      mockTasksService.remove.mockResolvedValue(undefined);
      const req = mockRequest();
      
      const result = await controller.remove('task-id', req);

      expect(service.remove).toHaveBeenCalledWith('task-id', req.user);
      expect(result).toEqual({ success: true });
    });
  });

  describe('findByName', () => {
    it('should find tasks by name (partial match)', async () => {
      const mockTasks = [
        { id: '1', title: 'Task One', status: TaskStatus.PENDING },
        { id: '2', title: 'Task Two', status: TaskStatus.IN_PROGRESS },
      ];

      mockTasksService.findByName.mockResolvedValue(mockTasks);
      const req = mockRequest();
      
      const result = await controller.findByName('Task', req);

      expect(service.findByName).toHaveBeenCalledWith('Task', req.user);
      expect(result).toEqual(mockTasks);
    });
  });

  describe('getStats', () => {
    it('should return task statistics', async () => {
      const mockStats = {
        totalTasks: 10,
        pendingTasks: 5,
        completedTasks: 3,
        inProgressTasks: 2,
      };

      mockTasksService.getTaskStatistics.mockResolvedValue(mockStats);

      const result = await controller.getStats();

      expect(service.getTaskStatistics).toHaveBeenCalled();
      expect(result).toEqual(mockStats);
    });
  });

  describe('batchProcess', () => {
    it('should batch process tasks with valid action', async () => {
      const operations = {
        tasks: ['task-1', 'task-2'],
        action: 'complete',
      };

      const mockResults = [
        { id: 'task-1', status: TaskStatus.COMPLETED },
        { id: 'task-2', status: TaskStatus.COMPLETED },
      ];

      mockTasksService.batchProcessTasks.mockResolvedValue(mockResults);
      const req = mockRequest();
      
      const result = await controller.batchProcess(operations, req);

      expect(service.batchProcessTasks).toHaveBeenCalledWith(
        operations.tasks,
        operations.action,
        req.user
      );
      expect(result).toEqual(mockResults);
    });

    it('should throw exception for empty tasks array', async () => {
      const operations = {
        tasks: [],
        action: 'complete',
      };
      
      const req = mockRequest();

      await expect(controller.batchProcess(operations, req)).rejects.toThrow(
        new HttpException('Tasks array must not be empty', HttpStatus.BAD_REQUEST)
      );
    });

    it('should throw exception for invalid action', async () => {
      const operations = {
        tasks: ['task-1', 'task-2'],
        action: 'invalid-action',
      };
      
      const req = mockRequest();

      await expect(controller.batchProcess(operations, req)).rejects.toThrow(
        new HttpException('Invalid action. Must be "complete" or "delete"', HttpStatus.BAD_REQUEST)
      );
    });
  });
}); 
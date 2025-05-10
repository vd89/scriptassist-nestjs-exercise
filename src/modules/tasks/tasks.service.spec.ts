import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TasksService } from './tasks.service';
import { Task } from './entities/task.entity';
import { TaskStatus } from './enums/task-status.enum';
import { TaskPriority } from './enums/task-priority.enum';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Queue } from 'bullmq';
import { User } from '../users/entities/user.entity';
import { CreateTaskDto } from './dto/create-task.dto';

describe('TasksService', () => {
  let service: TasksService;
  // let taskRepository: Repository<Task>;
  let taskQueue: Queue;

  // const mockTask = {
  //   id: '1',
  //   title: 'Test Task',
  //   description: 'Test Description',
  //   status: TaskStatus.PENDING,
  //   priority: TaskPriority.MEDIUM,
  //   dueDate: new Date().toISOString(),
  //   userId: 'user1',
  //   createdAt: new Date(),
  //   updatedAt: new Date(),
  // };

  const mockTaskRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    findAndCount: jest.fn(),
    remove: jest.fn(),
    createQueryBuilder: jest.fn(),
    find: jest.fn(),
  };

  const mockTaskQueue = {
    add: jest.fn(),
  };

  const mockUser: User = {
    id: 'user1',
    email: 'test@example.com',
    name: 'Test User',
    role: 'USER',
    password: 'hashedPassword',
    createdAt: new Date(),
    updatedAt: new Date(),
    tasks: [],
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksService,
        {
          provide: getRepositoryToken(Task),
          useValue: mockTaskRepository,
        },
        {
          provide: 'BullQueue_task-processing',
          useValue: mockTaskQueue,
        },
      ],
    }).compile();

    service = module.get<TasksService>(TasksService);
    // taskRepository = module.get<Repository<Task>>(getRepositoryToken(Task));
    taskQueue = module.get('BullQueue_task-processing');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a new task', async () => {
      const createTaskDto: CreateTaskDto = {
        title: 'Test Task',
        description: 'Test Description',
        status: TaskStatus.PENDING,
        priority: TaskPriority.MEDIUM,
        dueDate: new Date().toISOString(),
      };

      const mockTask = {
        id: '1',
        ...createTaskDto,
        userId: mockUser.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockTaskRepository.create.mockReturnValue(mockTask);
      mockTaskRepository.save.mockResolvedValue(mockTask);
      mockTaskQueue.add.mockResolvedValue(undefined);

      const result = await service.create(createTaskDto, mockUser.id);

      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('title', createTaskDto.title);
      expect(result).toHaveProperty('userId', mockUser.id);
      expect(taskQueue.add).toHaveBeenCalledWith('task-status-update', {
        taskId: result.id,
        status: result.status,
      });
    });
  });

  describe('findAll', () => {
    it('should return an array of tasks', async () => {
      const mockTasks = [
        {
          id: '1',
          title: 'Test Task 1',
          userId: mockUser.id,
        },
        {
          id: '2',
          title: 'Test Task 2',
          userId: mockUser.id,
        },
      ];

      mockTaskRepository.findAndCount.mockResolvedValue([mockTasks, 2]);

      const result = await service.findAll({
        page: 1,
        limit: 10,
        userId: mockUser.id,
      });

      expect(result.data).toEqual(mockTasks);
      expect(result.meta.total).toBe(2);
      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(10);
    });
  });

  describe('findOne', () => {
    it('should return a task by id', async () => {
      const mockTask = {
        id: '1',
        title: 'Test Task',
        userId: mockUser.id,
      };

      mockTaskRepository.findOne.mockResolvedValue(mockTask);

      const result = await service.findOne('1', mockUser);

      expect(result).toEqual(mockTask);
    });

    it('should throw NotFoundException when task is not found', async () => {
      mockTaskRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne('1', mockUser)).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when user is not the owner', async () => {
      const mockTask = {
        id: '1',
        title: 'Test Task',
        userId: 'user2',
      };

      mockTaskRepository.findOne.mockResolvedValue(mockTask);

      await expect(service.findOne('1', mockUser)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('update', () => {
    it('should update a task', async () => {
      const updateTaskDto = {
        title: 'Updated Task',
      };

      const mockTask = {
        id: '1',
        title: 'Test Task',
        userId: mockUser.id,
      };

      const updatedTask = {
        ...mockTask,
        ...updateTaskDto,
        status: TaskStatus.PENDING,
      };

      mockTaskRepository.findOne.mockResolvedValue(mockTask);
      mockTaskRepository.save.mockResolvedValue(updatedTask);
      mockTaskQueue.add.mockResolvedValue(undefined);

      const result = await service.update('1', updateTaskDto, mockUser);

      expect(result).toEqual(updatedTask);
      expect(taskQueue.add).toHaveBeenCalledWith('task-status-update', {
        taskId: '1',
        status: updatedTask.status,
      });
    });

    it('should throw NotFoundException when task is not found', async () => {
      mockTaskRepository.findOne.mockResolvedValue(null);

      await expect(service.update('1', { title: 'Updated Task' }, mockUser)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException when user is not the owner', async () => {
      const mockTask = {
        id: '1',
        title: 'Test Task',
        userId: 'user2',
      };

      mockTaskRepository.findOne.mockResolvedValue(mockTask);

      await expect(service.update('1', { title: 'Updated Task' }, mockUser)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('remove', () => {
    it('should remove a task', async () => {
      const mockTask = {
        id: '1',
        title: 'Test Task',
        userId: mockUser.id,
      };

      mockTaskRepository.findOne.mockResolvedValue(mockTask);
      mockTaskRepository.remove.mockResolvedValue(mockTask);

      await service.remove('1', mockUser);

      expect(mockTaskRepository.remove).toHaveBeenCalledWith(mockTask);
    });

    it('should throw NotFoundException when task is not found', async () => {
      mockTaskRepository.findOne.mockResolvedValue(null);

      await expect(service.remove('1', mockUser)).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when user is not the owner', async () => {
      const mockTask = {
        id: '1',
        title: 'Test Task',
        userId: 'user2',
      };

      mockTaskRepository.findOne.mockResolvedValue(mockTask);

      await expect(service.remove('1', mockUser)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('findOverdueTasks', () => {
    it('should return overdue tasks', async () => {
      const mockOverdueTasks = [
        {
          id: '1',
          title: 'Overdue Task 1',
          dueDate: new Date(Date.now() - 86400000), // 1 day ago
          status: TaskStatus.PENDING,
        },
        {
          id: '2',
          title: 'Overdue Task 2',
          dueDate: new Date(Date.now() - 172800000), // 2 days ago
          status: TaskStatus.PENDING,
        },
      ];

      mockTaskRepository.find.mockResolvedValue(mockOverdueTasks);

      const result = await service.findOverdueTasks(10, 0);

      expect(result).toEqual(mockOverdueTasks);
    });
  });
});

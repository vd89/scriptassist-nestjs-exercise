import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
// import { Repository } from 'typeorm';
import { TaskHistoryService } from './task-history.service';
import { TaskHistory } from '../entities/task-history.entity';
import { Task } from '../entities/task.entity';
import { NotFoundException } from '@nestjs/common';
import { TaskHistoryAction } from '../enums/task-history-action.enum';

describe('TaskHistoryService', () => {
  let service: TaskHistoryService;

  const mockTask = {
    id: '1',
    title: 'Test Task',
    description: 'Test Description',
    status: 'PENDING',
    priority: 'MEDIUM',
    dueDate: new Date(),
    userId: 'user1',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockHistoryEntry = {
    id: '1',
    taskId: '1',
    userId: 'user1',
    action: TaskHistoryAction.STATUS_CHANGED,
    oldValue: { status: 'PENDING' },
    newValue: { status: 'IN_PROGRESS' },
    description: 'Task status changed from PENDING to IN_PROGRESS',
    createdAt: new Date(),
    task: mockTask,
    user: {
      id: 'user1',
      name: 'Test User',
      email: 'test@example.com',
    },
  };

  const mockHistoryRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    remove: jest.fn(),
  };

  const mockTaskRepository = {
    findOne: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TaskHistoryService,
        {
          provide: getRepositoryToken(TaskHistory),
          useValue: mockHistoryRepository,
        },
        {
          provide: getRepositoryToken(Task),
          useValue: mockTaskRepository,
        },
      ],
    }).compile();

    service = module.get<TaskHistoryService>(TaskHistoryService);
    // historyRepository = module.get<Repository<TaskHistory>>(getRepositoryToken(TaskHistory));
    // taskRepository = module.get<Repository<Task>>(getRepositoryToken(Task));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a new history entry', async () => {
      const createHistoryDto = {
        action: TaskHistoryAction.STATUS_CHANGED,
        oldValue: { status: 'PENDING' },
        newValue: { status: 'IN_PROGRESS' },
        description: 'Task status changed from PENDING to IN_PROGRESS',
      };

      mockTaskRepository.findOne.mockResolvedValue(mockTask);
      mockHistoryRepository.create.mockReturnValue({
        ...createHistoryDto,
        id: '2',
        taskId: '1',
        userId: 'user1',
        createdAt: new Date(),
      });
      mockHistoryRepository.save.mockResolvedValue({
        ...createHistoryDto,
        id: '2',
        taskId: '1',
        userId: 'user1',
        createdAt: new Date(),
      });

      const result = await service.create('1', 'user1', createHistoryDto);

      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('action', createHistoryDto.action);
      expect(result).toHaveProperty('taskId', '1');
      expect(result).toHaveProperty('userId', 'user1');
    });

    it('should throw NotFoundException when task is not found', async () => {
      const createHistoryDto = {
        action: TaskHistoryAction.STATUS_CHANGED,
        oldValue: { status: 'PENDING' },
        newValue: { status: 'IN_PROGRESS' },
        description: 'Task status changed from PENDING to IN_PROGRESS',
      };

      mockTaskRepository.findOne.mockResolvedValue(null);

      await expect(service.create('1', 'user1', createHistoryDto)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findAll', () => {
    it('should return all history entries for a task', async () => {
      const mockHistoryEntries = [mockHistoryEntry];
      mockHistoryRepository.find.mockResolvedValue(mockHistoryEntries);

      const result = await service.findAll('1');

      expect(result).toEqual(mockHistoryEntries);
      expect(mockHistoryRepository.find).toHaveBeenCalledWith({
        where: { taskId: '1' },
        relations: ['user'],
        order: {
          createdAt: 'DESC',
        },
      });
    });
  });

  describe('findOne', () => {
    it('should return a history entry by id', async () => {
      mockHistoryRepository.findOne.mockResolvedValue(mockHistoryEntry);

      const result = await service.findOne('1');

      expect(result).toEqual(mockHistoryEntry);
      expect(mockHistoryRepository.findOne).toHaveBeenCalledWith({
        where: { id: '1' },
        relations: ['user', 'task'],
      });
    });

    it('should throw NotFoundException when history entry is not found', async () => {
      mockHistoryRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne('1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findByAction', () => {
    it('should return history entries filtered by action', async () => {
      const mockHistoryEntries = [mockHistoryEntry];
      mockHistoryRepository.find.mockResolvedValue(mockHistoryEntries);

      const result = await service.findByAction('1', TaskHistoryAction.STATUS_CHANGED);

      expect(result).toEqual(mockHistoryEntries);
      expect(mockHistoryRepository.find).toHaveBeenCalledWith({
        where: { taskId: '1', action: TaskHistoryAction.STATUS_CHANGED },
        relations: ['user'],
        order: {
          createdAt: 'DESC',
        },
      });
    });
  });

  describe('findByDateRange', () => {
    it('should return history entries within date range', async () => {
      const mockHistoryEntries = [mockHistoryEntry];
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-12-31');

      mockHistoryRepository.find.mockResolvedValue(mockHistoryEntries);

      const result = await service.findByDateRange('1', startDate, endDate);

      expect(result).toEqual(mockHistoryEntries);
      expect(mockHistoryRepository.find).toHaveBeenCalledWith({
        where: {
          taskId: '1',
          createdAt: expect.any(Object),
        },
        relations: ['user'],
        order: {
          createdAt: 'DESC',
        },
      });
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TaskDependencyService } from './task-dependency.service';
import { TaskDependency } from '../entities/task-dependency.entity';
import { Task } from '../entities/task.entity';
import { TaskHistory } from '../entities/task-history.entity';
import { TaskHistoryAction } from '../enums/task-history-action.enum';
import { NotFoundException, BadRequestException } from '@nestjs/common';

describe('TaskDependencyService', () => {
  let service: TaskDependencyService;
  let taskDependencyRepository: jest.Mocked<Repository<TaskDependency>>;
  let taskRepository: jest.Mocked<Repository<Task>>;
  let taskHistoryRepository: jest.Mocked<Repository<TaskHistory>>;

  const mockTask = {
    id: '1',
    title: 'Test Task',
    description: 'Test Description',
  };

  const mockDependentTask = {
    id: '2',
    title: 'Dependent Task',
    description: 'Dependent Description',
    status: 'PENDING',
    priority: 'MEDIUM',
    dueDate: new Date(),
    userId: 'user1',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockDependency = {
    id: '1',
    taskId: '1',
    dependentTaskId: '2',
    type: 'BLOCKS' as const,
    task: mockTask,
    dependentTask: mockDependentTask,
    createdAt: new Date(),
  };

  const mockHistory = {
    taskId: '1',
    userId: '1',
    action: TaskHistoryAction.DEPENDENCY_ADDED,
    newValue: { dependentTaskId: '2', type: 'BLOCKS' as const },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TaskDependencyService,
        {
          provide: getRepositoryToken(TaskDependency),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            find: jest.fn(),
            findOne: jest.fn(),
            remove: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Task),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(TaskHistory),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<TaskDependencyService>(TaskDependencyService);
    taskDependencyRepository = module.get(getRepositoryToken(TaskDependency));
    taskRepository = module.get(getRepositoryToken(Task));
    taskHistoryRepository = module.get(getRepositoryToken(TaskHistory));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a new dependency', async () => {
      const createDependencyDto = {
        dependentTaskId: '2',
        type: 'BLOCKS' as const,
      };

      (taskRepository.findOne as jest.Mock).mockResolvedValue(mockTask as Task);
      (taskDependencyRepository.create as jest.Mock).mockReturnValue(
        mockDependency as TaskDependency,
      );
      (taskDependencyRepository.save as jest.Mock).mockResolvedValue(
        mockDependency as TaskDependency,
      );
      (taskHistoryRepository.create as jest.Mock).mockReturnValue(mockHistory as TaskHistory);
      // Mock find to return empty array (no circular dependency)
      (taskDependencyRepository.find as jest.Mock).mockResolvedValue([]);

      const result = await service.create('1', createDependencyDto);

      expect(result).toEqual(mockDependency);
      expect(taskDependencyRepository.create).toHaveBeenCalledWith({
        taskId: '1',
        ...createDependencyDto,
      });
      expect(taskDependencyRepository.save).toHaveBeenCalledWith(mockDependency);
      expect(taskHistoryRepository.create).toHaveBeenCalled();
      expect(taskHistoryRepository.save).toHaveBeenCalled();
    });

    it('should throw NotFoundException if task not found', async () => {
      const createDependencyDto = {
        dependentTaskId: '2',
        type: 'BLOCKS' as const,
      };

      (taskRepository.findOne as jest.Mock).mockResolvedValue(null);

      await expect(service.create('1', createDependencyDto)).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if dependency already exists', async () => {
      const createDependencyDto = {
        dependentTaskId: '2',
        type: 'BLOCKS' as const,
      };

      (taskRepository.findOne as jest.Mock).mockResolvedValue(mockTask as Task);
      // Mock existing dependency
      (taskDependencyRepository.findOne as jest.Mock).mockResolvedValue(
        mockDependency as TaskDependency,
      );
      // Mock find to return empty array (no circular dependency)
      (taskDependencyRepository.find as jest.Mock).mockResolvedValue([]);

      await expect(service.create('1', createDependencyDto)).rejects.toThrow(BadRequestException);
      await expect(service.create('1', createDependencyDto)).rejects.toThrow(
        'Dependency already exists',
      );
    });
  });

  describe('findAll', () => {
    it('should return all dependencies for a task', async () => {
      const mockDependencies = [mockDependency];
      (taskDependencyRepository.find as jest.Mock).mockResolvedValue(
        mockDependencies as TaskDependency[],
      );

      const result = await service.findAll('1');

      expect(result).toEqual(mockDependencies);
      expect(taskDependencyRepository.find).toHaveBeenCalledWith({
        where: { taskId: '1' },
        relations: ['task', 'dependentTask'],
      });
    });
  });

  describe('findDependentTasks', () => {
    it('should return all tasks that depend on a task', async () => {
      const mockDependencies = [mockDependency];
      (taskDependencyRepository.find as jest.Mock).mockResolvedValue(
        mockDependencies as TaskDependency[],
      );

      const result = await service.findDependentTasks('1');

      expect(result).toEqual(mockDependencies);
      expect(taskDependencyRepository.find).toHaveBeenCalledWith({
        where: { dependentTaskId: '1' },
        relations: ['task', 'dependentTask'],
      });
    });
  });

  describe('remove', () => {
    it('should remove a dependency', async () => {
      (taskDependencyRepository.findOne as jest.Mock).mockResolvedValue(
        mockDependency as TaskDependency,
      );
      (taskDependencyRepository.remove as jest.Mock).mockResolvedValue(
        mockDependency as TaskDependency,
      );

      await service.remove('1');

      expect(taskDependencyRepository.remove).toHaveBeenCalledWith(mockDependency);
    });

    it('should throw NotFoundException when dependency is not found', async () => {
      (taskDependencyRepository.findOne as jest.Mock).mockResolvedValue(null);

      await expect(service.remove('1')).rejects.toThrow(NotFoundException);
    });
  });
});

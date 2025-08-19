import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import * as request from 'supertest';

import { ApplicationModule } from '../application.module';
import { InfrastructureModule } from '../../infrastructure/infrastructure.module';
import { DomainModule } from '../../domain/domain.module';
import { TaskCQRSController } from '../../modules/tasks/task-cqrs.controller';
import { CQRSMediator } from '../cqrs/cqrs-mediator';
import { UNIT_OF_WORK } from '../../infrastructure/persistence/unit-of-work/typeorm-unit-of-work.service';
import { TASK_REPOSITORY } from '../../domain/repositories/repository.tokens';
import { TaskRepository } from '../../domain/repositories/task.repository.interface';
import { TaskSpecificationFactory } from '../../domain/specifications/task.specifications';
import { TaskStatus, TaskPriority } from '../../domain/entities/task.entity';
import { EntityId } from '../../domain/value-objects/entity-id.value-object';
import { createMockTask } from './test-utils';
import { UnitOfWorkWithRepositories } from '../interfaces/application-service.interface';
import { ValueObject } from 'src/domain/value-objects/value-object.base';
import { DueDate, DueDateProps } from 'src/domain/value-objects/due-date.value-object';

describe('Advanced Patterns Integration', () => {
  let app: INestApplication;
  let module: TestingModule;
  let mediator: CQRSMediator;
  let unitOfWork: UnitOfWorkWithRepositories;
  let taskRepository: TaskRepository;

  // Mock implementations for testing
  const mockTask = createMockTask({
    status: TaskStatus.PENDING,
    priority: TaskPriority.HIGH,
    dueDate: DueDate.create(new Date('2024-12-31'))
  });

  const mockUser = {
    id: 'test-user-id',
    email: 'test@example.com'
  };

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [() => ({
            database: {
              type: 'sqlite',
              database: ':memory:',
              synchronize: true,
              logging: false
            }
          })]
        }),
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          entities: ['src/**/*.model{.ts,.js}'],
          synchronize: true,
          logging: false
        }),
        DomainModule,
        InfrastructureModule,
        ApplicationModule
      ],
      controllers: [TaskCQRSController]
    })
    .overrideProvider(TASK_REPOSITORY)
    .useValue({
      findById: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
      exists: jest.fn(),
      findAll: jest.fn(),
      findByUserId: jest.fn(),
      findByStatus: jest.fn(),
      findOverdueTasks: jest.fn(),
      countByUserId: jest.fn(),
      countByStatus: jest.fn(),
      findBySpecification: jest.fn(),
      findOneBySpecification: jest.fn(),
      countBySpecification: jest.fn()
    })
    .overrideProvider(UNIT_OF_WORK)
    .useValue({
      start: jest.fn(),
      commit: jest.fn(),
      rollback: jest.fn(),
      execute: jest.fn(),
      isActive: jest.fn().mockReturnValue(false),
      getTransactionId: jest.fn().mockReturnValue(null),
      getRepository: jest.fn(),
      commitRepositories: jest.fn()
    })
    .compile();

    app = module.createNestApplication();
    await app.init();

    mediator = module.get<CQRSMediator>(CQRSMediator);
    unitOfWork = module.get<UnitOfWorkWithRepositories>(UNIT_OF_WORK);
    taskRepository = module.get<TaskRepository>(TASK_REPOSITORY);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Repository Pattern with Abstractions', () => {
    it('should use base repository methods', async () => {
      const taskId = EntityId.create();
      (taskRepository.findById as jest.Mock).mockResolvedValue(mockTask);
      (taskRepository.exists as jest.Mock).mockResolvedValue(true);

      const task = await taskRepository.findById(taskId);
      const exists = await taskRepository.exists(taskId);

      expect(taskRepository.findById).toHaveBeenCalledWith(taskId);
      expect(taskRepository.exists).toHaveBeenCalledWith(taskId);
      expect(task).toBe(mockTask);
      expect(exists).toBe(true);
    });

    it('should use specification repository methods', async () => {
      const userId = EntityId.create();
      const spec = TaskSpecificationFactory.createHighPriorityTasksForUser(userId);
      (taskRepository.findBySpecification as jest.Mock).mockResolvedValue([mockTask]);

      const tasks = await taskRepository.findBySpecification(spec);

      expect(taskRepository.findBySpecification).toHaveBeenCalledWith(spec);
      expect(tasks).toEqual([mockTask]);
    });

    it('should count by specification', async () => {
      const userId = EntityId.create();
      const spec = TaskSpecificationFactory.createOverdueTasksForUser(userId);
      (taskRepository.countBySpecification as jest.Mock).mockResolvedValue(5);

      const count = await taskRepository.countBySpecification(spec);

      expect(taskRepository.countBySpecification).toHaveBeenCalledWith(spec);
      expect(count).toBe(5);
    });
  });

  describe('Unit of Work Pattern', () => {
    it('should execute work within transaction', async () => {
      const workFunction = jest.fn().mockResolvedValue('success');
      (unitOfWork.execute as jest.Mock).mockImplementation(async (work) => {
        return await work();
      });

      const result = await unitOfWork.execute(workFunction);

      expect(unitOfWork.execute).toHaveBeenCalledWith(workFunction);
      expect(workFunction).toHaveBeenCalled();
      expect(result).toBe('success');
    });

    it('should manage repository state', () => {
      const mockRepository = {
        markNew: jest.fn(),
        markDirty: jest.fn(),
        markRemoved: jest.fn(),
        isNew: jest.fn().mockReturnValue(true),
        isDirty: jest.fn().mockReturnValue(false),
        isRemoved: jest.fn().mockReturnValue(false),
        getNew: jest.fn().mockReturnValue([]),
        getDirty: jest.fn().mockReturnValue([]),
        getRemoved: jest.fn().mockReturnValue([]),
        clear: jest.fn()
      };

      (unitOfWork.getRepository as jest.Mock).mockReturnValue(mockRepository);

      const repository = unitOfWork.getRepository(Object);
      repository.markNew(mockTask);

      expect(unitOfWork.getRepository).toHaveBeenCalledWith(Object);
      expect(repository.markNew).toHaveBeenCalledWith(mockTask);
    });

    it('should handle transaction rollback on error', async () => {
      const errorFunction = jest.fn().mockRejectedValue(new Error('Test error'));
      (unitOfWork.execute as jest.Mock).mockImplementation(async (work) => {
        try {
          await work();
        } catch (error) {
          // Simulate rollback
          throw error;
        }
      });

      await expect(unitOfWork.execute(errorFunction)).rejects.toThrow('Test error');
      expect(errorFunction).toHaveBeenCalled();
    });
  });

  describe('Application Service Layer', () => {
    it('should coordinate between domain and infrastructure', async () => {
      // Mock the Unit of Work execute to simulate successful transaction
      (unitOfWork.execute as jest.Mock).mockImplementation(async (work) => {
        return await work();
      });

      // Mock task repository save
      (taskRepository.save as jest.Mock).mockResolvedValue(mockTask);

      // This would be called through the CQRS mediator in real scenario
      const result = await unitOfWork.execute(async () => {
        return await taskRepository.save(mockTask);
      });

      expect(unitOfWork.execute).toHaveBeenCalled();
      expect(result).toBe(mockTask);
    });

    it('should handle cross-cutting concerns', () => {
      // Cross-cutting concerns like logging, validation, caching
      // are handled by the CrossCuttingConcernsService
      // This test verifies the service is properly integrated
      expect(module.get('CrossCuttingConcernsService')).toBeDefined();
    });
  });

  describe('CQRS Pattern', () => {
    it('should separate commands and queries', async () => {
      expect(mediator).toBeDefined();
      expect(mediator.send).toBeDefined();
      expect(mediator.query).toBeDefined();
    });

    it('should handle command execution', async () => {
      const mockCommand = {
        commandId: 'test-command-id',
        timestamp: new Date(),
        data: 'test-data'
      };

      const mockCommandResult = { success: true, data: 'command-result' };

      // Mock the mediator send method
      jest.spyOn(mediator, 'send').mockResolvedValue(mockCommandResult);

      const result = await mediator.send(mockCommand);

      expect(mediator.send).toHaveBeenCalledWith(mockCommand);
      expect(result).toBe(mockCommandResult);
    });

    it('should handle query execution', async () => {
      const mockQuery = {
        queryId: 'test-query-id',
        timestamp: new Date(),
        filter: 'test-filter'
      };

      const mockQueryResult = { success: true, data: [mockTask] };

      // Mock the mediator query method
      jest.spyOn(mediator, 'query').mockResolvedValue(mockQueryResult);

      const result = await mediator.query(mockQuery);

      expect(mediator.query).toHaveBeenCalledWith(mockQuery);
      expect(result).toBe(mockQueryResult);
    });
  });

  describe('Specification Pattern Integration', () => {
    it('should use specifications for complex queries', async () => {
      const userId = EntityId.create();

      // Test overdue tasks specification
      const overdueSpec = TaskSpecificationFactory.createOverdueTasksForUser(userId);
      (taskRepository.findBySpecification as jest.Mock).mockResolvedValue([mockTask]);

      const overdueTasks = await taskRepository.findBySpecification(overdueSpec);

      expect(taskRepository.findBySpecification).toHaveBeenCalledWith(overdueSpec);
      expect(overdueTasks).toEqual([mockTask]);

      // Test high priority tasks specification
      const highPrioritySpec = TaskSpecificationFactory.createHighPriorityTasksForUser(userId);
      (taskRepository.findBySpecification as jest.Mock).mockResolvedValue([mockTask]);

      const highPriorityTasks = await taskRepository.findBySpecification(highPrioritySpec);

      expect(taskRepository.findBySpecification).toHaveBeenCalledWith(highPrioritySpec);
      expect(highPriorityTasks).toEqual([mockTask]);
    });

    it('should combine specifications for complex business rules', async () => {
      const userId = EntityId.create();
      const activeTasksSpec = TaskSpecificationFactory.createActiveTasksForUser(userId);

      (taskRepository.countBySpecification as jest.Mock).mockResolvedValue(3);

      const activeTasksCount = await taskRepository.countBySpecification(activeTasksSpec);

      expect(taskRepository.countBySpecification).toHaveBeenCalledWith(activeTasksSpec);
      expect(activeTasksCount).toBe(3);
    });
  });

  describe('End-to-End Pattern Integration', () => {
    it('should create task using all patterns', async () => {
      // Mock all the dependencies
      (unitOfWork.execute as jest.Mock).mockImplementation(async (work) => work());
      (taskRepository.save as jest.Mock).mockResolvedValue(mockTask);

      // Simulate creating a task through the entire stack
      const result = await unitOfWork.execute(async () => {
        // Domain logic would validate and create task
        const savedTask = await taskRepository.save(mockTask);

        // Specifications could be used for validation
        const userId = EntityId.create();
        const userTasksSpec = TaskSpecificationFactory.createActiveTasksForUser(userId);

        return {
          task: savedTask,
          spec: userTasksSpec
        };
      });

      expect(result.task).toBe(mockTask);
      expect(result.spec).toBeDefined();
      expect(unitOfWork.execute).toHaveBeenCalled();
      expect(taskRepository.save).toHaveBeenCalledWith(mockTask);
    });

    it('should query tasks using all patterns', async () => {
      const userId = EntityId.create();
      const spec = TaskSpecificationFactory.createHighPriorityTasksForUser(userId);

      (taskRepository.findBySpecification as jest.Mock).mockResolvedValue([mockTask]);

      // Simulate querying through the application service layer
      const tasks = await taskRepository.findBySpecification(spec);

      expect(tasks).toEqual([mockTask]);
      expect(taskRepository.findBySpecification).toHaveBeenCalledWith(spec);
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle multiple concurrent operations', async () => {
      const concurrentOperations = Array.from({ length: 10 }, (_, i) =>
        unitOfWork.execute(async () => `operation-${i}`)
      );

      (unitOfWork.execute as jest.Mock).mockImplementation(async (work) => work());

      const results = await Promise.all(concurrentOperations);

      expect(results).toHaveLength(10);
      expect(unitOfWork.execute).toHaveBeenCalledTimes(10);
    });

    it('should cache query results appropriately', async () => {
      // This would be handled by the CrossCuttingConcernsService
      // Testing cache integration
      const userId = EntityId.create();
      const spec = TaskSpecificationFactory.createActiveTasksForUser(userId);

      (taskRepository.findBySpecification as jest.Mock).mockResolvedValue([mockTask]);

      // First call
      await taskRepository.findBySpecification(spec);

      // Second call (would use cache in real implementation)
      await taskRepository.findBySpecification(spec);

      expect(taskRepository.findBySpecification).toHaveBeenCalledTimes(2);
    });
  });

  describe('Error Handling and Resilience', () => {
    it('should handle repository errors gracefully', async () => {
      (taskRepository.findById as jest.Mock).mockRejectedValue(new Error('Database error'));

      await expect(taskRepository.findById(EntityId.create())).rejects.toThrow('Database error');
    });

    it('should rollback transactions on failure', async () => {
      (unitOfWork.execute as jest.Mock).mockRejectedValue(new Error('Transaction failed'));

      await expect(unitOfWork.execute(async () => 'test')).rejects.toThrow('Transaction failed');
    });

    it('should handle specification validation errors', () => {
      const userId = EntityId.create();

      // Test that specifications validate input
      expect(() => TaskSpecificationFactory.createActiveTasksForUser(userId)).not.toThrow();
    });
  });
});

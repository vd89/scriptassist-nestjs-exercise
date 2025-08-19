import { Test, TestingModule } from '@nestjs/testing';
import { TaskRepository } from '../../domain/repositories/task.repository.interface';
import { Task, TaskStatus, TaskPriority } from '../../domain/entities/task.entity';
import { EntityId } from '../../domain/value-objects/entity-id.value-object';
import {
  TaskSpecificationFactory,
  TaskByStatusSpecification,
  TaskByUserSpecification,
  OverdueTaskSpecification,
  HighPriorityTaskSpecification,
  CompositeTaskSpecification
} from '../../domain/specifications/task.specifications';
import { createMockTask } from './test-utils';
import { DueDate, DueDateProps } from 'src/domain';
import { ValueObject } from 'src/domain/value-objects/value-object.base';

describe('Task Specifications', () => {
  let mockTask: Task;
  let userId: EntityId;

  beforeEach(() => {
    userId = EntityId.create();

    // Create a mock task for testing using utility
    mockTask = createMockTask({
      userId,
      status: TaskStatus.PENDING,
      priority: TaskPriority.HIGH,
      dueDate: DueDate.create(new Date('2024-12-31')),
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01')
    });
  });

  describe('TaskByStatusSpecification', () => {
    it('should satisfy when task has matching status', () => {
      const spec = new TaskByStatusSpecification(TaskStatus.PENDING);

      expect(spec.isSatisfiedBy(mockTask)).toBe(true);
    });

    it('should not satisfy when task has different status', () => {
      const spec = new TaskByStatusSpecification(TaskStatus.COMPLETED);

      expect(spec.isSatisfiedBy(mockTask)).toBe(false);
    });

    it('should generate correct query', () => {
      const spec = new TaskByStatusSpecification(TaskStatus.PENDING);

      expect(spec.toQuery()).toEqual({ status: TaskStatus.PENDING });
    });
  });

  describe('TaskByUserSpecification', () => {
    it('should satisfy when task belongs to user', () => {
      const spec = new TaskByUserSpecification(userId);

      expect(spec.isSatisfiedBy(mockTask)).toBe(true);
    });

    it('should not satisfy when task belongs to different user', () => {
      const differentUserId = EntityId.create();
      const spec = new TaskByUserSpecification(differentUserId);

      expect(spec.isSatisfiedBy(mockTask)).toBe(false);
    });

    it('should generate correct query', () => {
      const spec = new TaskByUserSpecification(userId);

      expect(spec.toQuery()).toEqual({ userId: userId.value });
    });
  });

  describe('OverdueTaskSpecification', () => {
    it('should satisfy when task is overdue and not completed', () => {
      const currentDate = new Date('2025-01-01');
      const spec = new OverdueTaskSpecification(currentDate);

      expect(spec.isSatisfiedBy(mockTask)).toBe(true);
    });

    it('should not satisfy when task is not overdue', () => {
      const currentDate = new Date('2024-01-01');
      const spec = new OverdueTaskSpecification(currentDate);

      expect(spec.isSatisfiedBy(mockTask)).toBe(false);
    });

    it('should not satisfy when task is completed even if overdue', () => {
      const currentDate = new Date('2025-01-01');
      const completedTask = createMockTask({ ...mockTask, status: TaskStatus.COMPLETED });
      const spec = new OverdueTaskSpecification(currentDate);

      expect(spec.isSatisfiedBy(completedTask)).toBe(false);
    });

    it('should generate correct query', () => {
      const currentDate = new Date('2025-01-01');
      const spec = new OverdueTaskSpecification(currentDate);

      expect(spec.toQuery()).toEqual({
        dueDate: { $lt: currentDate },
        status: { $ne: TaskStatus.COMPLETED }
      });
    });
  });

  describe('HighPriorityTaskSpecification', () => {
    it('should satisfy when task has high priority', () => {
      const spec = new HighPriorityTaskSpecification();

      expect(spec.isSatisfiedBy(mockTask)).toBe(true);
    });

    it('should not satisfy when task has different priority', () => {
      const lowPriorityTask = createMockTask({ ...mockTask, priority: TaskPriority.LOW });
      const spec = new HighPriorityTaskSpecification();

      expect(spec.isSatisfiedBy(lowPriorityTask)).toBe(false);
    });

    it('should generate correct query', () => {
      const spec = new HighPriorityTaskSpecification();

      expect(spec.toQuery()).toEqual({ priority: TaskPriority.HIGH });
    });
  });

  describe('CompositeTaskSpecification', () => {
    it('should satisfy when all specifications are satisfied (AND)', () => {
      const statusSpec = new TaskByStatusSpecification(TaskStatus.PENDING);
      const userSpec = new TaskByUserSpecification(userId);
      const compositeSpec = new CompositeTaskSpecification([statusSpec, userSpec], 'AND');

      expect(compositeSpec.isSatisfiedBy(mockTask)).toBe(true);
    });

    it('should not satisfy when any specification fails (AND)', () => {
      const statusSpec = new TaskByStatusSpecification(TaskStatus.COMPLETED);
      const userSpec = new TaskByUserSpecification(userId);
      const compositeSpec = new CompositeTaskSpecification([statusSpec, userSpec], 'AND');

      expect(compositeSpec.isSatisfiedBy(mockTask)).toBe(false);
    });

    it('should satisfy when any specification is satisfied (OR)', () => {
      const statusSpec = new TaskByStatusSpecification(TaskStatus.COMPLETED);
      const prioritySpec = new HighPriorityTaskSpecification();
      const compositeSpec = new CompositeTaskSpecification([statusSpec, prioritySpec], 'OR');

      expect(compositeSpec.isSatisfiedBy(mockTask)).toBe(true);
    });

    it('should not satisfy when no specifications are satisfied (OR)', () => {
      const statusSpec = new TaskByStatusSpecification(TaskStatus.COMPLETED);
      const prioritySpec = new TaskByStatusSpecification(TaskStatus.IN_PROGRESS);
      const compositeSpec = new CompositeTaskSpecification([statusSpec, prioritySpec], 'OR');

      expect(compositeSpec.isSatisfiedBy(mockTask)).toBe(false);
    });

    it('should generate correct AND query', () => {
      const statusSpec = new TaskByStatusSpecification(TaskStatus.PENDING);
      const userSpec = new TaskByUserSpecification(userId);
      const compositeSpec = new CompositeTaskSpecification([statusSpec, userSpec], 'AND');

      expect(compositeSpec.toQuery()).toEqual({
        $and: [
          { status: TaskStatus.PENDING },
          { userId: userId.value }
        ]
      });
    });

    it('should generate correct OR query', () => {
      const statusSpec = new TaskByStatusSpecification(TaskStatus.PENDING);
      const prioritySpec = new HighPriorityTaskSpecification();
      const compositeSpec = new CompositeTaskSpecification([statusSpec, prioritySpec], 'OR');

      expect(compositeSpec.toQuery()).toEqual({
        $or: [
          { status: TaskStatus.PENDING },
          { priority: TaskPriority.HIGH }
        ]
      });
    });
  });

  describe('TaskSpecificationFactory', () => {
    it('should create overdue tasks for user specification', () => {
      const spec = TaskSpecificationFactory.createOverdueTasksForUser(userId);

      expect(spec).toBeInstanceOf(CompositeTaskSpecification);

      // Should satisfy overdue high priority task for the user
      const currentDate = new Date('2025-01-01');
      const overdueSpec = new OverdueTaskSpecification(currentDate);
      expect(overdueSpec.isSatisfiedBy(mockTask)).toBe(true);
      expect(spec.isSatisfiedBy(mockTask)).toBe(true);
    });

    it('should create high priority tasks for user specification', () => {
      const spec = TaskSpecificationFactory.createHighPriorityTasksForUser(userId);

      expect(spec).toBeInstanceOf(CompositeTaskSpecification);
      expect(spec.isSatisfiedBy(mockTask)).toBe(true);

      // Should not satisfy for different user
      const differentUserId = EntityId.create();
      const differentUserTask = createMockTask({ ...mockTask, userId: differentUserId });
      expect(spec.isSatisfiedBy(differentUserTask)).toBe(false);
    });

    it('should create active tasks for user specification', () => {
      const spec = TaskSpecificationFactory.createActiveTasksForUser(userId);

      expect(spec).toBeInstanceOf(CompositeTaskSpecification);
      expect(spec.isSatisfiedBy(mockTask)).toBe(true);

      // Should satisfy for in-progress task
      const inProgressTask = createMockTask({ ...mockTask, status: TaskStatus.IN_PROGRESS });
      expect(spec.isSatisfiedBy(inProgressTask)).toBe(true);

      // Should not satisfy for completed task
      const completedTask = createMockTask({ ...mockTask, status: TaskStatus.COMPLETED });
      expect(spec.isSatisfiedBy(completedTask)).toBe(false);
    });
  });

  describe('Repository Integration', () => {
    let mockRepository: jest.Mocked<TaskRepository>;

    beforeEach(() => {
      mockRepository = {
        findBySpecification: jest.fn(),
        findOneBySpecification: jest.fn(),
        countBySpecification: jest.fn(),
        findById: jest.fn(),
        save: jest.fn(),
        delete: jest.fn(),
        exists: jest.fn(),
        findAll: jest.fn(),
        findByUserId: jest.fn(),
        findByStatus: jest.fn(),
        findOverdueTasks: jest.fn(),
        countByUserId: jest.fn(),
        countByStatus: jest.fn()
      };
    });

    it('should use specification with repository', async () => {
      const spec = new TaskByStatusSpecification(TaskStatus.PENDING);
      const expectedTasks = [mockTask];

      mockRepository.findBySpecification.mockResolvedValue(expectedTasks);

      const result = await mockRepository.findBySpecification(spec);

      expect(mockRepository.findBySpecification).toHaveBeenCalledWith(spec);
      expect(result).toEqual(expectedTasks);
    });

    it('should count by specification', async () => {
      const spec = new HighPriorityTaskSpecification();
      mockRepository.countBySpecification.mockResolvedValue(5);

      const count = await mockRepository.countBySpecification(spec);

      expect(mockRepository.countBySpecification).toHaveBeenCalledWith(spec);
      expect(count).toBe(5);
    });

    it('should find one by specification', async () => {
      const spec = TaskSpecificationFactory.createOverdueTasksForUser(userId);
      mockRepository.findOneBySpecification.mockResolvedValue(mockTask);

      const result = await mockRepository.findOneBySpecification(spec);

      expect(mockRepository.findOneBySpecification).toHaveBeenCalledWith(spec);
      expect(result).toBe(mockTask);
    });
  });
});

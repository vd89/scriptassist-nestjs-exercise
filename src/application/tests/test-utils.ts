import { Task, TaskStatus, TaskPriority } from '../../domain/entities/task.entity';
import { EntityId } from '../../domain/value-objects/entity-id.value-object';
import { TaskTitle } from '../../domain/value-objects/task-title.value-object';
import { TaskDescription } from '../../domain/value-objects/task-description.value-object';
import { DueDate } from '../../domain/value-objects/due-date.value-object';

/**
 * Test utility to create mock Task objects
 */
export function createMockTask(overrides: Partial<Record<string, any>> = {}): Task {
  // First create an actual Task instance using its constructor or factory method
  const task = Task.create({
    userId: overrides.userId || EntityId.create(),
    title: overrides.title || { value: 'Test Task' },
    description: overrides.description || { value: 'Test Description' },
    priority: overrides.priority || TaskPriority.HIGH,
    dueDate: overrides.dueDate || { value: new Date('2024-12-31') }
  });

  // Then mock its methods
  task.updateTitle = jest.fn();
  task.updateDescription = jest.fn();
  task.updatePriority = jest.fn();
  task.updateDueDate = jest.fn();
  task.isCompleted = jest.fn();
  task.isInProgress = jest.fn();
  task.isOverdue = jest.fn().mockReturnValue(false);
  task.equals = jest.fn().mockReturnValue(false);
  Object.defineProperty(task, 'domainEvents', {
    get: jest.fn().mockReturnValue([])
  });
  (task as any).addDomainEvent = jest.fn();

  // Override any additional properties
  Object.keys(overrides).forEach(key => {
    if (!['userId', 'title', 'description', 'priority', 'dueDate'].includes(key)) {
      (task as any)[key] = overrides[key];
    }
  });

  return task;
}

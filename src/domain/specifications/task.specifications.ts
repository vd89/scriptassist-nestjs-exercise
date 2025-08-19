import { Specification } from '../repositories/base.repository.interface';
import { Task, TaskStatus, TaskPriority } from '../entities/task.entity';
import { EntityId } from '../value-objects/entity-id.value-object';

/**
 * Base task specification
 */
export abstract class TaskSpecification implements Specification<Task> {
  abstract isSatisfiedBy(task: Task): boolean;
  abstract toQuery(): any;
}

/**
 * Specification for tasks by status
 */
export class TaskByStatusSpecification extends TaskSpecification {
  constructor(private readonly status: TaskStatus) {
    super();
  }

  isSatisfiedBy(task: Task): boolean {
    return task.status === this.status;
  }

  toQuery(): any {
    return { status: this.status };
  }
}

/**
 * Specification for tasks by user
 */
export class TaskByUserSpecification extends TaskSpecification {
  constructor(private readonly userId: EntityId) {
    super();
  }

  isSatisfiedBy(task: Task): boolean {
    return task.userId.equals(this.userId);
  }

  toQuery(): any {
    return { userId: this.userId.value };
  }
}

/**
 * Specification for overdue tasks
 */
export class OverdueTaskSpecification extends TaskSpecification {
  private readonly currentDate: Date;

  constructor(currentDate?: Date) {
    super();
    this.currentDate = currentDate || new Date();
  }

  isSatisfiedBy(task: Task): boolean {
    return task.dueDate?.value !== null &&
           task.dueDate.value < this.currentDate &&
           task.status !== TaskStatus.COMPLETED;
  }

  toQuery(): any {
    return {
      dueDate: { $lt: this.currentDate },
      status: { $ne: TaskStatus.COMPLETED }
    };
  }
}

/**
 * Specification for high priority tasks
 */
export class HighPriorityTaskSpecification extends TaskSpecification {
  isSatisfiedBy(task: Task): boolean {
    return task.priority === TaskPriority.HIGH;
  }

  toQuery(): any {
    return { priority: TaskPriority.HIGH };
  }
}

/**
 * Composite specification for combining multiple specifications
 */
export class CompositeTaskSpecification extends TaskSpecification {
  constructor(
    private readonly specifications: TaskSpecification[],
    private readonly operator: 'AND' | 'OR' = 'AND'
  ) {
    super();
  }

  isSatisfiedBy(task: Task): boolean {
    if (this.operator === 'AND') {
      return this.specifications.every(spec => spec.isSatisfiedBy(task));
    } else {
      return this.specifications.some(spec => spec.isSatisfiedBy(task));
    }
  }

  toQuery(): any {
    const queries = this.specifications.map(spec => spec.toQuery());

    if (this.operator === 'AND') {
      return { $and: queries };
    } else {
      return { $or: queries };
    }
  }
}

/**
 * Factory for creating common task specifications
 */
export class TaskSpecificationFactory {
  static createOverdueTasksForUser(userId: EntityId): CompositeTaskSpecification {
    return new CompositeTaskSpecification([
      new TaskByUserSpecification(userId),
      new OverdueTaskSpecification()
    ]);
  }

  static createHighPriorityTasksForUser(userId: EntityId): CompositeTaskSpecification {
    return new CompositeTaskSpecification([
      new TaskByUserSpecification(userId),
      new HighPriorityTaskSpecification()
    ]);
  }

  static createActiveTasksForUser(userId: EntityId): CompositeTaskSpecification {
    return new CompositeTaskSpecification([
      new TaskByUserSpecification(userId),
      new CompositeTaskSpecification([
        new TaskByStatusSpecification(TaskStatus.PENDING),
        new TaskByStatusSpecification(TaskStatus.IN_PROGRESS)
      ], 'OR')
    ]);
  }
}

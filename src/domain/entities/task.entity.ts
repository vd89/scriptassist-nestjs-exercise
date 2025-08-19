import { AggregateRoot } from './aggregate-root.base';
import { EntityId } from '../value-objects/entity-id.value-object';
import { TaskTitle } from '../value-objects/task-title.value-object';
import { TaskDescription } from '../value-objects/task-description.value-object';
import { DueDate } from '../value-objects/due-date.value-object';

export enum TaskStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
}

export enum TaskPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
}

interface TaskProps {
  title: TaskTitle;
  description: TaskDescription;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: DueDate;
  userId: EntityId;
  createdAt: Date;
  updatedAt: Date;
}

export class Task extends AggregateRoot<TaskProps> {
  markAsPending: jest.Mock<any, any, any>;
  assignToUser: jest.Mock<any, any, any>;
  canBeCompletedBy: jest.Mock<any, any, any>;
  canBeModifiedBy: jest.Mock<any, any, any>;
  toJSON: jest.Mock<any, any, any>;
  clearDomainEvents: jest.Mock<any, any, any>;
  constructor(props: TaskProps, id?: EntityId) {
    super(props, id);
  }

  static create(props: {
    title: string;
    description?: string;
    priority?: TaskPriority;
    dueDate?: Date | string | null;
    userId: string;
  }, id?: EntityId): Task {
    const taskProps: TaskProps = {
      title: TaskTitle.create(props.title),
      description: TaskDescription.create(props.description || null),
      status: TaskStatus.PENDING,
      priority: props.priority || TaskPriority.MEDIUM,
      dueDate: DueDate.create(props.dueDate || null),
      userId: EntityId.fromString(props.userId),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    return new Task(taskProps, id);
  }

  static createFromPersistence(props: {
    title: string;
    description: string | null;
    status: TaskStatus;
    priority: TaskPriority;
    dueDate: Date | null;
    userId: string;
    createdAt: Date;
    updatedAt: Date;
  }, id: EntityId): Task {
    const taskProps: TaskProps = {
      title: TaskTitle.create(props.title),
      description: TaskDescription.create(props.description),
      status: props.status,
      priority: props.priority,
      dueDate: DueDate.create(props.dueDate),
      userId: EntityId.fromString(props.userId),
      createdAt: props.createdAt,
      updatedAt: props.updatedAt,
    };

    return new Task(taskProps, id);
  }

  get title(): TaskTitle {
    return this.props.title;
  }

  get description(): TaskDescription {
    return this.props.description;
  }

  get status(): TaskStatus {
    return this.props.status;
  }

  get priority(): TaskPriority {
    return this.props.priority;
  }

  get dueDate(): DueDate {
    return this.props.dueDate;
  }

  get userId(): EntityId {
    return this.props.userId;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  public updateTitle(title: string): void {
    this.props.title = TaskTitle.create(title);
    this.props.updatedAt = new Date();
  }

  public updateDescription(description: string | null): void {
    this.props.description = TaskDescription.create(description);
    this.props.updatedAt = new Date();
  }

  public updatePriority(priority: TaskPriority): void {
    this.props.priority = priority;
    this.props.updatedAt = new Date();
  }

  public updateDueDate(dueDate: Date | string | null): void {
    this.props.dueDate = DueDate.createWithValidation(dueDate);
    this.props.updatedAt = new Date();
  }

  public startProgress(): void {
    if (this.props.status !== TaskStatus.PENDING) {
      throw new Error('Only pending tasks can be started');
    }
    this.props.status = TaskStatus.IN_PROGRESS;
    this.props.updatedAt = new Date();
  }

  public complete(): void {
    if (this.props.status === TaskStatus.COMPLETED) {
      throw new Error('Task is already completed');
    }
    this.props.status = TaskStatus.COMPLETED;
    this.props.updatedAt = new Date();
  }

  public reopen(): void {
    if (this.props.status !== TaskStatus.COMPLETED) {
      throw new Error('Only completed tasks can be reopened');
    }
    this.props.status = TaskStatus.PENDING;
    this.props.updatedAt = new Date();
  }

  public isOverdue(): boolean {
    return this.props.status !== TaskStatus.COMPLETED && this.props.dueDate.isPast();
  }

  public isCompleted(): boolean {
    return this.props.status === TaskStatus.COMPLETED;
  }

  public isPending(): boolean {
    return this.props.status === TaskStatus.PENDING;
  }

  public isInProgress(): boolean {
    return this.props.status === TaskStatus.IN_PROGRESS;
  }

  public isHighPriority(): boolean {
    return this.props.priority === TaskPriority.HIGH;
  }

  public belongsToUser(userId: EntityId): boolean {
    return this.props.userId.equals(userId);
  }
}

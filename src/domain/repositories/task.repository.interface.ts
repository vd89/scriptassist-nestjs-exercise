import { Task, TaskStatus, TaskPriority } from '../entities/task.entity';
import { EntityId } from '../value-objects/entity-id.value-object';

export interface TaskFilters {
  status?: TaskStatus;
  priority?: TaskPriority;
  userId?: EntityId;
  search?: string;
  dueDateStart?: Date;
  dueDateEnd?: Date;
  createdAtStart?: Date;
  createdAtEnd?: Date;
}

export interface PaginationOptions {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
}

export interface PaginatedResult<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface TaskRepository {
  findById(id: EntityId): Promise<Task | null>;
  save(task: Task): Promise<Task>;
  delete(id: EntityId): Promise<void>;
  findAll(filters?: TaskFilters, pagination?: PaginationOptions): Promise<PaginatedResult<Task>>;
  findByUserId(userId: EntityId): Promise<Task[]>;
  findByStatus(status: TaskStatus): Promise<Task[]>;
  findOverdueTasks(pagination?: PaginationOptions): Promise<PaginatedResult<Task>>;
  exists(id: EntityId): Promise<boolean>;
  countByUserId(userId: EntityId): Promise<number>;
  countByStatus(status: TaskStatus): Promise<number>;
}

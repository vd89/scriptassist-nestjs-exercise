import { Task, TaskStatus, TaskPriority } from '../entities/task.entity';
import { EntityId } from '../value-objects/entity-id.value-object';
import { BaseRepository, SpecificationRepository } from './base.repository.interface';

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

export interface TaskRepository extends BaseRepository<Task>, SpecificationRepository<Task> {
  // Base methods inherited from BaseRepository and SpecificationRepository
  findAll(filters?: TaskFilters, pagination?: PaginationOptions): Promise<PaginatedResult<Task>>;
  findByUserId(userId: EntityId): Promise<Task[]>;
  findByStatus(status: TaskStatus): Promise<Task[]>;
  findOverdueTasks(pagination?: PaginationOptions): Promise<PaginatedResult<Task>>;
  // exists method inherited from BaseRepository
  countByUserId(userId: EntityId): Promise<number>;
  countByStatus(status: TaskStatus): Promise<number>;
}

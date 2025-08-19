import { EntityId } from '../value-objects/entity-id.value-object';

/**
 * Base repository interface that provides common CRUD operations
 * This enforces a consistent contract across all repositories
 */
export interface BaseRepository<T> {
  findById(id: EntityId): Promise<T | null>;
  save(entity: T): Promise<T>;
  delete(id: EntityId): Promise<void>;
  exists(id: EntityId): Promise<boolean>;
}

/**
 * Read-only repository interface for CQRS read models
 */
export interface ReadOnlyRepository<T> {
  findById(id: EntityId): Promise<T | null>;
  exists(id: EntityId): Promise<boolean>;
}

/**
 * Write-only repository interface for CQRS write models
 */
export interface WriteOnlyRepository<T> {
  save(entity: T): Promise<T>;
  delete(id: EntityId): Promise<void>;
}

/**
 * Specification pattern for complex queries
 */
export interface Specification<T> {
  isSatisfiedBy(entity: T): boolean;
  toQuery(): any; // Database-specific query object
}

/**
 * Repository with specification support
 */
export interface SpecificationRepository<T> extends BaseRepository<T> {
  findBySpecification(spec: Specification<T>): Promise<T[]>;
  findOneBySpecification(spec: Specification<T>): Promise<T | null>;
  countBySpecification(spec: Specification<T>): Promise<number>;
}

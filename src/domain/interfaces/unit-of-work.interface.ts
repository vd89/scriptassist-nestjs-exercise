import { EntityId } from '../value-objects/entity-id.value-object';

/**
 * Represents a unit of work that manages transaction boundaries
 * and coordinates the work of multiple repositories
 */
export interface UnitOfWork {
  /**
   * Start a new transaction
   */
  start(): Promise<void>;

  /**
   * Commit the current transaction
   */
  commit(): Promise<void>;

  /**
   * Rollback the current transaction
   */
  rollback(): Promise<void>;

  /**
   * Execute work within a transaction
   */
  execute<T>(work: () => Promise<T>): Promise<T>;

  /**
   * Check if currently in a transaction
   */
  isActive(): boolean;

  /**
   * Get the current transaction ID
   */
  getTransactionId(): string | null;
}

/**
 * Repository registry for the Unit of Work pattern
 */
export interface UnitOfWorkRepository<T> {
  /**
   * Register an entity for creation
   */
  markNew(entity: T): void;

  /**
   * Register an entity for update
   */
  markDirty(entity: T): void;

  /**
   * Register an entity for deletion
   */
  markRemoved(entityId: EntityId): void;

  /**
   * Check if an entity is registered for creation
   */
  isNew(entity: T): boolean;

  /**
   * Check if an entity is registered for update
   */
  isDirty(entity: T): boolean;

  /**
   * Check if an entity is registered for deletion
   */
  isRemoved(entityId: EntityId): boolean;

  /**
   * Get all entities marked for creation
   */
  getNew(): T[];

  /**
   * Get all entities marked for update
   */
  getDirty(): T[];

  /**
   * Get all entity IDs marked for deletion
   */
  getRemoved(): EntityId[];

  /**
   * Clear all tracked changes
   */
  clear(): void;
}

/**
 * Unit of Work with repository management
 */
export interface UnitOfWorkWithRepositories extends UnitOfWork {
  /**
   * Get a repository for a specific entity type
   */
  getRepository<T>(type: new () => T): UnitOfWorkRepository<T>;

  /**
   * Commit all changes tracked by repositories
   */
  commitRepositories(): Promise<void>;
}

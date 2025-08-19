import { Injectable, Logger } from '@nestjs/common';
import { DataSource, QueryRunner } from 'typeorm';
import { 
  UnitOfWork, 
  UnitOfWorkRepository, 
  UnitOfWorkWithRepositories 
} from '../../../domain/interfaces/unit-of-work.interface';
import { EntityId } from '../../../domain/value-objects/entity-id.value-object';
import { v4 as uuidv4 } from 'uuid';

/**
 * Generic repository implementation for Unit of Work pattern
 */
class GenericUnitOfWorkRepository<T> implements UnitOfWorkRepository<T> {
  private newEntities: T[] = [];
  private dirtyEntities: T[] = [];
  private removedEntityIds: EntityId[] = [];

  markNew(entity: T): void {
    if (!this.isNew(entity)) {
      this.newEntities.push(entity);
    }
  }

  markDirty(entity: T): void {
    if (!this.isDirty(entity) && !this.isNew(entity)) {
      this.dirtyEntities.push(entity);
    }
  }

  markRemoved(entityId: EntityId): void {
    if (!this.isRemoved(entityId)) {
      this.removedEntityIds.push(entityId);
    }
  }

  isNew(entity: T): boolean {
    return this.newEntities.includes(entity);
  }

  isDirty(entity: T): boolean {
    return this.dirtyEntities.includes(entity);
  }

  isRemoved(entityId: EntityId): boolean {
    return this.removedEntityIds.some(id => id.equals(entityId));
  }

  getNew(): T[] {
    return [...this.newEntities];
  }

  getDirty(): T[] {
    return [...this.dirtyEntities];
  }

  getRemoved(): EntityId[] {
    return [...this.removedEntityIds];
  }

  clear(): void {
    this.newEntities = [];
    this.dirtyEntities = [];
    this.removedEntityIds = [];
  }
}

/**
 * TypeORM implementation of Unit of Work pattern
 */
@Injectable()
export class TypeOrmUnitOfWork implements UnitOfWorkWithRepositories {
  private readonly logger = new Logger(TypeOrmUnitOfWork.name);
  private queryRunner: QueryRunner | null = null;
  private transactionId: string | null = null;
  private repositories = new Map<string, UnitOfWorkRepository<any>>();

  constructor(private readonly dataSource: DataSource) {}

  async start(): Promise<void> {
    if (this.isActive()) {
      throw new Error('Transaction is already active');
    }

    this.queryRunner = this.dataSource.createQueryRunner();
    await this.queryRunner.connect();
    await this.queryRunner.startTransaction();
    this.transactionId = uuidv4();

    this.logger.debug(`Transaction started with ID: ${this.transactionId}`);
  }

  async commit(): Promise<void> {
    if (!this.isActive()) {
      throw new Error('No active transaction to commit');
    }

    try {
      // First commit all repository changes
      await this.commitRepositories();
      
      // Then commit the database transaction
      await this.queryRunner!.commitTransaction();
      
      this.logger.debug(`Transaction committed with ID: ${this.transactionId}`);
    } catch (error) {
      this.logger.error(`Failed to commit transaction ${this.transactionId}:`, error);
      await this.rollback();
      throw error;
    } finally {
      await this.cleanup();
    }
  }

  async rollback(): Promise<void> {
    if (!this.isActive()) {
      this.logger.warn('No active transaction to rollback');
      return;
    }

    try {
      await this.queryRunner!.rollbackTransaction();
      this.logger.debug(`Transaction rolled back with ID: ${this.transactionId}`);
    } catch (error) {
      this.logger.error(`Failed to rollback transaction ${this.transactionId}:`, error);
      throw error;
    } finally {
      await this.cleanup();
    }
  }

  async execute<T>(work: () => Promise<T>): Promise<T> {
    await this.start();
    
    try {
      const result = await work();
      await this.commit();
      return result;
    } catch (error) {
      await this.rollback();
      throw error;
    }
  }

  isActive(): boolean {
    return this.queryRunner !== null && 
           this.queryRunner.isTransactionActive && 
           this.transactionId !== null;
  }

  getTransactionId(): string | null {
    return this.transactionId;
  }

  getRepository<T>(type: new () => T): UnitOfWorkRepository<T> {
    const typeName = type.name;
    
    if (!this.repositories.has(typeName)) {
      this.repositories.set(typeName, new GenericUnitOfWorkRepository<T>());
    }
    
    return this.repositories.get(typeName)!;
  }

  async commitRepositories(): Promise<void> {
    if (!this.isActive()) {
      throw new Error('No active transaction for repository commits');
    }

    // This is a simplified implementation
    // In a real scenario, you would iterate through repositories
    // and persist their changes using the query runner
    
    for (const [typeName, repository] of this.repositories) {
      this.logger.debug(`Committing changes for repository: ${typeName}`);
      
      // Get the actual TypeORM repository through the query runner
      // This is where you would map domain entities to persistence models
      // and save them using this.queryRunner.manager
      
      const newEntities = repository.getNew();
      const dirtyEntities = repository.getDirty();
      const removedEntityIds = repository.getRemoved();

      this.logger.debug(`Repository ${typeName}: ${newEntities.length} new, ${dirtyEntities.length} dirty, ${removedEntityIds.length} removed`);

      // Clear the repository after processing
      repository.clear();
    }
  }

  private async cleanup(): Promise<void> {
    if (this.queryRunner) {
      await this.queryRunner.release();
      this.queryRunner = null;
    }
    
    this.transactionId = null;
    this.repositories.clear();
  }

  /**
   * Get the current query runner for advanced operations
   */
  getQueryRunner(): QueryRunner | null {
    return this.queryRunner;
  }

  /**
   * Execute raw SQL within the transaction
   */
  async executeRawQuery(sql: string, parameters?: any[]): Promise<any> {
    if (!this.isActive()) {
      throw new Error('No active transaction for raw query execution');
    }

    return await this.queryRunner!.query(sql, parameters);
  }
}

/**
 * Unit of Work token for dependency injection
 */
export const UNIT_OF_WORK = Symbol('UNIT_OF_WORK');

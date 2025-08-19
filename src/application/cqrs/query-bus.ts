import { Injectable, Logger } from '@nestjs/common';
import { IQuery, IQueryHandler, IQueryBus } from './interfaces';

/**
 * In-memory query bus implementation
 */
@Injectable()
export class QueryBus implements IQueryBus {
  private readonly logger = new Logger(QueryBus.name);
  private readonly handlers = new Map<string, IQueryHandler<any, any>>();

  async execute<TQuery extends IQuery, TResult = any>(
    query: TQuery
  ): Promise<TResult> {
    const queryName = query.constructor.name;
    this.logger.debug(`Executing query: ${queryName}`, {
      queryId: query.queryId,
      timestamp: query.timestamp
    });

    const handler = this.handlers.get(queryName);
    if (!handler) {
      throw new Error(`No handler registered for query: ${queryName}`);
    }

    try {
      const startTime = Date.now();
      const result = await handler.handle(query);
      const duration = Date.now() - startTime;

      this.logger.debug(`Query executed successfully: ${queryName}`, {
        queryId: query.queryId,
        duration
      });

      return result;
    } catch (error) {
      this.logger.error(`Query execution failed: ${queryName}`, {
        queryId: query.queryId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  register<TQuery extends IQuery, TResult = any>(
    queryType: new (...args: any[]) => TQuery,
    handler: IQueryHandler<TQuery, TResult>
  ): void {
    const queryName = queryType.name;
    this.logger.debug(`Registering query handler: ${queryName}`);
    this.handlers.set(queryName, handler);
  }

  /**
   * Get all registered query types
   */
  getRegisteredQueries(): string[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * Check if a query handler is registered
   */
  isHandlerRegistered(queryType: new (...args: any[]) => IQuery): boolean {
    return this.handlers.has(queryType.name);
  }
}

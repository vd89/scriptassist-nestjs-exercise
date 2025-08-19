/**
 * Base interface for all application services
 */
export interface ApplicationService {
  /**
   * Get the service name for logging and identification
   */
  getServiceName(): string;
}

/**
 * Command interface for command-based operations
 */
export interface Command {
  readonly commandId: string;
  readonly timestamp: Date;
  readonly userId?: string;
}

/**
 * Query interface for query-based operations
 */
export interface Query {
  readonly queryId: string;
  readonly timestamp: Date;
  readonly userId?: string;
}

/**
 * Result interface for service operations
 */
export interface ServiceResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  metadata?: Record<string, any>;
}

/**
 * Cross-cutting concerns interface
 */
export interface CrossCuttingConcerns {
  /**
   * Log operation
   */
  log(level: 'debug' | 'info' | 'warn' | 'error', message: string, context?: any): void;

  /**
   * Validate input
   */
  validate<T>(input: T, rules?: any): Promise<boolean>;

  /**
   * Handle caching
   */
  cache: {
    get<T>(key: string): Promise<T | null>;
    set<T>(key: string, value: T, ttl?: number): Promise<void>;
    delete(key: string): Promise<void>;
    clear(): Promise<void>;
  };

  /**
   * Handle events
   */
  publishEvent(event: any): Promise<void>;

  /**
   * Handle metrics
   */
  recordMetric(name: string, value: number, tags?: Record<string, string>): void;
}



export interface UnitOfWorkWithRepositories {
  start (): Promise<void>;
  commit (): Promise<void>;
  rollback (): Promise<void>;
  isActive (): boolean;
  getTransactionId (): string | null;
  execute<T> (work: () => Promise<T>): Promise<T>;
  getRepository<T> (entityClass: new (...args: any[]) => T): any;
}
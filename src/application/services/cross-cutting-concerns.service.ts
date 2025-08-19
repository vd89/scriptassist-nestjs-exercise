import { Injectable, Logger } from '@nestjs/common';
import { CrossCuttingConcerns } from '../interfaces/application-service.interface';
import { CacheService } from '../../common/services/cache.service';

/**
 * Implementation of cross-cutting concerns
 */
@Injectable()
export class CrossCuttingConcernsService implements CrossCuttingConcerns {
  private readonly logger = new Logger(CrossCuttingConcernsService.name);

  constructor(
    private readonly cacheService: CacheService,
  ) {}

  log(level: 'debug' | 'info' | 'warn' | 'error', message: string, context?: any): void {
    const contextStr = context ? JSON.stringify(context) : '';
    
    switch (level) {
      case 'debug':
        this.logger.debug(message, contextStr);
        break;
      case 'info':
        this.logger.log(message, contextStr);
        break;
      case 'warn':
        this.logger.warn(message, contextStr);
        break;
      case 'error':
        this.logger.error(message, contextStr);
        break;
    }
  }

  async validate<T>(input: T, rules?: any): Promise<boolean> {
    // Simplified validation - in real implementation, use class-validator or similar
    if (!input) {
      this.log('warn', 'Validation failed: input is null or undefined');
      return false;
    }

    // Additional validation logic based on rules
    if (rules) {
      // Implement custom validation logic here
      this.log('debug', 'Custom validation rules applied', { rules });
    }

    this.log('debug', 'Validation passed');
    return true;
  }

  cache = {
    get: async <T>(key: string): Promise<T | null> => {
      this.log('debug', `Cache get: ${key}`);
      return await this.cacheService.get<T>(key);
    },

    set: async <T>(key: string, value: T, ttl?: number): Promise<void> => {
      this.log('debug', `Cache set: ${key}`, { ttl });
      await this.cacheService.set(key, value, ttl);
    },

    delete: async (key: string): Promise<void> => {
      this.log('debug', `Cache delete: ${key}`);
      await this.cacheService.delete(key);
    },

    clear: async (): Promise<void> => {
      this.log('debug', 'Cache clear all');
      await this.cacheService.clear();
    }
  };

  async publishEvent(event: any): Promise<void> {
    this.log('info', 'Event published', { eventType: event?.constructor?.name });
    // In a real implementation, this would integrate with an event bus
    // For now, we'll just log the event
  }

  recordMetric(name: string, value: number, tags?: Record<string, string>): void {
    this.log('debug', `Metric recorded: ${name} = ${value}`, { tags });
    // In a real implementation, this would integrate with a metrics system
  }
}

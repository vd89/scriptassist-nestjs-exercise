import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, RedisClientType } from 'redis';

@Injectable()
export class CacheService implements OnModuleInit {
  private client: RedisClientType;
  private readonly logger = new Logger(CacheService.name);
  private readonly namespace: string;
  private readonly defaultTtl: number;
  private isConnected = false;

  constructor(private configService: ConfigService) {
    this.namespace = this.configService.get('CACHE_NAMESPACE', 'app:cache:');
    this.defaultTtl = parseInt(this.configService.get('CACHE_DEFAULT_TTL', '300'), 10);

    const redisUrl = this.configService.get('REDIS_URL', 'redis://localhost:6379');

    this.client = createClient({
      url: redisUrl,
    });

    this.client.on('error', err => this.logger.error(`Redis cache error: ${err}`));
    this.client.on('connect', () => this.logger.log('Redis cache connected'));
    this.client.on('reconnecting', () => this.logger.log('Redis cache reconnecting'));
    this.client.on('ready', () => {
      this.isConnected = true;
      this.logger.log('Redis cache ready');
    });
  }

  async onModuleInit() {
    try {
      await this.client.connect();
    } catch (err) {
      this.logger.error(`Failed to connect to Redis: ${err}`);
      // Continue without failing - the service will attempt to reconnect
    }
  }

  private getKey(key: string): string {
    return `${this.namespace}${key}`;
  }

  private ensureConnected() {
    if (!this.isConnected) {
      throw new Error('Cache service not connected to Redis');
    }
  }

  /**
   * Set a value in the cache
   * @param key Cache key
   * @param value Value to store (will be JSON stringified)
   * @param ttlSeconds Time to live in seconds (defaults to configured default)
   */
  async set(key: string, value: any, ttlSeconds = this.defaultTtl): Promise<void> {
    try {
      this.ensureConnected();

      if (!key) {
        throw new Error('Cache key cannot be empty');
      }

      const serializedValue = JSON.stringify(value);
      const cacheKey = this.getKey(key);

      await this.client.set(cacheKey, serializedValue, { EX: ttlSeconds });
      this.logger.debug(`Cache set: ${cacheKey} (TTL: ${ttlSeconds}s)`);
    } catch (error) {
      this.logger.error(
        `Cache set error for key ${key}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      // Allow operation to continue without cache rather than failing
    }
  }

  /**
   * Get a value from the cache
   * @param key Cache key
   * @returns Parsed value or null if not found
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      this.ensureConnected();

      if (!key) {
        throw new Error('Cache key cannot be empty');
      }

      const cacheKey = this.getKey(key);
      const value = await this.client.get(cacheKey);

      if (!value) {
        this.logger.debug(`Cache miss: ${cacheKey}`);
        return null;
      }

      this.logger.debug(`Cache hit: ${cacheKey}`);
      return JSON.parse(value) as T;
    } catch (error) {
      this.logger.error(
        `Cache get error for key ${key}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      return null;
    }
  }

  /**
   * Delete a value from the cache
   * @param key Cache key
   * @returns True if the key was deleted, false otherwise
   */
  async delete(key: string): Promise<boolean> {
    try {
      this.ensureConnected();

      if (!key) {
        throw new Error('Cache key cannot be empty');
      }

      const cacheKey = this.getKey(key);
      const result = await this.client.del(cacheKey);

      const deleted = result > 0;
      this.logger.debug(`Cache delete ${deleted ? 'hit' : 'miss'}: ${cacheKey}`);

      return deleted;
    } catch (error) {
      this.logger.error(
        `Cache delete error for key ${key}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      return false;
    }
  }

  /**
   * Check if a key exists in the cache
   * @param key Cache key
   * @returns True if the key exists, false otherwise
   */
  async has(key: string): Promise<boolean> {
    try {
      this.ensureConnected();

      if (!key) {
        throw new Error('Cache key cannot be empty');
      }

      const cacheKey = this.getKey(key);
      const exists = await this.client.exists(cacheKey);

      return exists === 1;
    } catch (error) {
      this.logger.error(
        `Cache has error for key ${key}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      return false;
    }
  }

  /**
   * Clear all cache entries with the current namespace
   */
  async clear(): Promise<void> {
    try {
      this.ensureConnected();

      const keys = await this.client.keys(`${this.namespace}*`);

      if (keys.length > 0) {
        await this.client.del(keys);
        this.logger.log(`Cleared ${keys.length} cache entries`);
      }
    } catch (error) {
      this.logger.error(
        `Cache clear error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Store multiple key-value pairs at once
   * @param items Array of key-value pairs to store
   * @param ttlSeconds Time to live in seconds
   */
  async mset(
    items: Array<{ key: string; value: any }>,
    ttlSeconds = this.defaultTtl,
  ): Promise<void> {
    try {
      this.ensureConnected();

      if (!items.length) {
        return;
      }

      const pipeline = this.client.multi();

      for (const item of items) {
        if (!item.key) {
          throw new Error('Cache key cannot be empty');
        }

        const cacheKey = this.getKey(item.key);
        const serializedValue = JSON.stringify(item.value);

        pipeline.set(cacheKey, serializedValue, { EX: ttlSeconds });
      }

      await pipeline.exec();
      this.logger.debug(`Bulk set ${items.length} cache entries (TTL: ${ttlSeconds}s)`);
    } catch (error) {
      this.logger.error(
        `Cache mset error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Get multiple values from the cache at once
   * @param keys Array of cache keys
   * @returns Object with requested keys and their values (or null if not found)
   */
  async mget<T>(keys: string[]): Promise<Record<string, T | null>> {
    try {
      this.ensureConnected();

      if (!keys.length) {
        return {};
      }

      const cacheKeys = keys.map(key => this.getKey(key));
      const values = await this.client.mGet(cacheKeys);

      const result: Record<string, T | null> = {};

      keys.forEach((key, index) => {
        const value = values[index];
        result[key] = value ? (JSON.parse(value as string) as T) : null;
      });

      return result;
    } catch (error) {
      this.logger.error(
        `Cache mget error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      return {};
    }
  }

  /**
   * Increment a numeric value in the cache
   * @param key Cache key
   * @param value Amount to increment by (default: 1)
   * @returns The new value
   */
  async increment(key: string, value = 1): Promise<number> {
    try {
      this.ensureConnected();

      if (!key) {
        throw new Error('Cache key cannot be empty');
      }

      const cacheKey = this.getKey(key);
      const result = await this.client.incrBy(cacheKey, value);

      return result;
    } catch (error) {
      this.logger.error(
        `Cache increment error for key ${key}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }
  }

  /**
   * Get cache statistics
   * @returns Object with cache statistics
   */
  async getStats(): Promise<any> {
    try {
      this.ensureConnected();

      const info = await this.client.info();
      return info;
    } catch (error) {
      this.logger.error(
        `Cache stats error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      return {};
    }
  }
}

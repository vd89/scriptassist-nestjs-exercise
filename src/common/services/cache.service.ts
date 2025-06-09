import { Injectable, Inject, Logger } from '@nestjs/common';
import { Redis } from 'ioredis';
import { ConfigService } from '@nestjs/config';

/**
 * CacheService provides a distributed caching solution using Redis.
 * This service is available throughout the application and can be injected
 * into any module that needs caching functionality.
 * 
 * Features:
 * - Distributed caching (works across multiple application instances)
 * - Automatic key expiration
 * - Namespaced keys to prevent collisions
 * - JSON serialization/deserialization
 * - Error handling and logging
 * - Cache statistics
 */
@Injectable()
export class CacheService {
  // Logger instance for tracking cache operations
  private readonly logger = new Logger(CacheService.name);
  
  // Cache configuration values loaded from environment
  private readonly namespace: string;
  private readonly defaultTTL: number;
  private readonly enabled: boolean;

  constructor(
    // Inject Redis client instance provided by CacheModule
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
    // ConfigService for accessing cache configuration
    private readonly configService: ConfigService,
  ) {
    // Load cache configuration from environment
    const config = this.configService.get('cache');
    this.namespace = config.namespace;
    this.defaultTTL = config.defaultTTL;
    this.enabled = config.enabled;
  }

  /**
   * Creates a namespaced key to prevent collisions between different parts of the application
   * @param key - The original key
   * @returns The namespaced key in format 'namespace:key'
   */
  private getNamespacedKey(key: string): string {
    return `${this.namespace}:${key}`;
  }

  /**
   * Stores a value in the cache with an optional TTL (Time To Live)
   * @param key - The cache key
   * @param value - The value to cache (will be JSON serialized)
   * @param ttlSeconds - Optional TTL in seconds (defaults to config value)
   * @throws Error if Redis operation fails
   */
  async set(key: string, value: any, ttlSeconds?: number): Promise<void> {
    // Skip operation if cache is disabled
    if (!this.enabled) {
      this.logger.debug('Cache is disabled, skipping set operation');
      return;
    }

    try {
      // Create namespaced key and serialize value
      const namespacedKey = this.getNamespacedKey(key);
      const serializedValue = JSON.stringify(value);
      const ttl = ttlSeconds ?? this.defaultTTL;

      // Store in Redis with expiration
      await this.redis.setex(namespacedKey, ttl, serializedValue);
      this.logger.debug(`Cache set for key: ${namespacedKey}`);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to set cache for key ${key}: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Retrieves a value from the cache
   * @param key - The cache key
   * @returns The cached value or null if not found/expired
   * @throws Error if Redis operation fails
   */
  async get<T>(key: string): Promise<T | null> {
    // Return null if cache is disabled
    if (!this.enabled) {
      this.logger.debug('Cache is disabled, returning null');
      return null;
    }

    try {
      // Get value from Redis and deserialize
      const namespacedKey = this.getNamespacedKey(key);
      const value = await this.redis.get(namespacedKey);

      if (!value) {
        this.logger.debug(`Cache miss for key: ${namespacedKey}`);
        return null;
      }

      this.logger.debug(`Cache hit for key: ${namespacedKey}`);
      return JSON.parse(value) as T;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to get cache for key ${key}: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Removes a value from the cache
   * @param key - The cache key to delete
   * @returns true if the key was deleted, false if it didn't exist
   * @throws Error if Redis operation fails
   */
  async delete(key: string): Promise<boolean> {
    // Skip operation if cache is disabled
    if (!this.enabled) {
      this.logger.debug('Cache is disabled, skipping delete operation');
      return false;
    }

    try {
      // Delete key from Redis
      const namespacedKey = this.getNamespacedKey(key);
      const result = await this.redis.del(namespacedKey);
      this.logger.debug(`Cache delete for key: ${namespacedKey}`);
      return result > 0;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to delete cache for key ${key}: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Removes all cached values for the current namespace
   * @throws Error if Redis operation fails
   */
  async clear(): Promise<void> {
    // Skip operation if cache is disabled
    if (!this.enabled) {
      this.logger.debug('Cache is disabled, skipping clear operation');
      return;
    }

    try {
      // Find and delete all keys in the namespace
      const pattern = `${this.namespace}:*`;
      const keys = await this.redis.keys(pattern);
      
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
      
      this.logger.debug(`Cache cleared for pattern: ${pattern}`);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to clear cache: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Checks if a key exists in the cache and is not expired
   * @param key - The cache key to check
   * @returns true if the key exists and is not expired
   * @throws Error if Redis operation fails
   */
  async has(key: string): Promise<boolean> {
    // Return false if cache is disabled
    if (!this.enabled) {
      return false;
    }

    try {
      // Check if key exists in Redis
      const namespacedKey = this.getNamespacedKey(key);
      const exists = await this.redis.exists(namespacedKey);
      return exists === 1;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to check cache existence for key ${key}: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Retrieves cache statistics including:
   * - Number of keys in the namespace
   * - Memory usage
   * - Cache hits/misses (currently not implemented)
   * @returns Cache statistics object
   * @throws Error if Redis operation fails
   */
  async getStats(): Promise<{
    keys: number;
    memory: number;
    hits: number;
    misses: number;
  }> {
    // Return empty stats if cache is disabled
    if (!this.enabled) {
      return {
        keys: 0,
        memory: 0,
        hits: 0,
        misses: 0,
      };
    }

    try {
      // Get all keys in namespace and memory usage from Redis
      const pattern = `${this.namespace}:*`;
      const keys = await this.redis.keys(pattern);
      const info = await this.redis.info('memory');
      const memory = parseInt(info.match(/used_memory:(\d+)/)?.[1] || '0', 10);

      return {
        keys: keys.length,
        memory,
        hits: 0, // These would need to be tracked separately
        misses: 0,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to get cache stats: ${errorMessage}`);
      throw error;
    }
  }

  async keys(pattern: string): Promise<string[]> {
    return this.redis.keys(pattern);
  }
} 
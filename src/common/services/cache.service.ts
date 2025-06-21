import { Inject, Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);

  constructor(@Inject('REDIS_CLIENT') private readonly redis: Redis) {}

  private buildKey(namespace: string, key: string): string {
    if (!namespace || !key) throw new Error('Invalid key or namespace');
    return `${namespace}:${key}`;
  }

  async set(namespace: string, key: string, value: any, ttlSeconds = 300): Promise<void> {
    const redisKey = this.buildKey(namespace, key);
    const serialized = JSON.stringify(value);

    try {
      await this.redis.set(redisKey, serialized, 'EX', ttlSeconds);
      this.logger.debug(`Cache set: ${redisKey}`);
    } catch (err) {
      this.logger.error(`Redis SET error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async get<T>(namespace: string, key: string): Promise<T | null> {
    const redisKey = this.buildKey(namespace, key);
    try {
      const data = await this.redis.get(redisKey);
      if (!data) {
        this.logger.debug(`Cache miss: ${redisKey}`);
        return null;
      }
      return JSON.parse(data) as T;
    } catch (err) {
      this.logger.error(`Redis GET error: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  async delete(namespace: string, key: string): Promise<boolean> {
    const redisKey = this.buildKey(namespace, key);
    try {
      const result = await this.redis.del(redisKey);
      return result > 0;
    } catch (err) {
      this.logger.error(`Redis DEL error: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }

  async has(namespace: string, key: string): Promise<boolean> {
    const redisKey = this.buildKey(namespace, key);
    try {
      const exists = await this.redis.exists(redisKey);
      return exists === 1;
    } catch (err) {
      this.logger.error(`Redis EXISTS error: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }

  async clearNamespace(namespace: string): Promise<void> {
    try {
      const keys = await this.redis.keys(`${namespace}:*`);
      if (keys.length > 0) {
        await this.redis.del(...keys);
        this.logger.warn(`Cleared namespace: ${namespace} (${keys.length} keys)`);
      }
    } catch (err) {
      this.logger.error(
        `Redis clearNamespace error: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async scanKeys(pattern: string): Promise<string[]> {
    const matchedKeys: string[] = [];
    let cursor = '0';

    try {
      do {
        const [nextCursor, keys] = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        matchedKeys.push(...keys);
        cursor = nextCursor;
      } while (cursor !== '0');

      this.logger.debug(`Found ${matchedKeys.length} keys matching pattern: ${pattern}`);
      return matchedKeys;
    } catch (err) {
      this.logger.error(
        `Redis SCAN error for pattern "${pattern}": ${err instanceof Error ? err.message : String(err)}`,
      );
      return [];
    }
  }

  async increment(namespace: string, key: string): Promise<number> {
    const fullKey = `${namespace}:${key}`;
    return await this.redis.incr(fullKey);
  }

  async getTTL(namespace: string, key: string): Promise<number> {
    const fullKey = `${namespace}:${key}`;
    return await this.redis.ttl(fullKey);
  }

  async getStats(): Promise<{ totalKeys: number }> {
    try {
      const info = await this.redis.info('keyspace');
      const matches = info.match(/db\d+:keys=(\d+)/);
      return { totalKeys: matches ? parseInt(matches[1], 10) : 0 };
    } catch (err) {
      this.logger.error(`Redis info error: ${err instanceof Error ? err.message : String(err)}`);
      return { totalKeys: 0 };
    }
  }
}

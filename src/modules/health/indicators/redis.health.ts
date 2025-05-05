import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HealthIndicator, HealthIndicatorResult } from '@nestjs/terminus';
import Redis from 'ioredis';

@Injectable()
export class RedisHealthIndicator extends HealthIndicator {
  private redis: Redis;

  constructor(private configService: ConfigService) {
    super();
    this.redis = new Redis({
      host: this.configService.get<string>('REDIS_HOST', 'localhost'),
      port: this.configService.get<number>('REDIS_PORT', 6379),
      enableOfflineQueue: false,
      connectTimeout: 1000, // Short timeout for health checks
      maxRetriesPerRequest: 1,
    });
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      const start = Date.now();
      await this.redis.ping();
      const latency = Date.now() - start;

      return this.getStatus(key, true, { latency: `${latency}ms` });
    } catch (error) {
      return this.getStatus(key, false, { message: error.message });
    }
  }

  /**
   * When the service is being shut down, we should close the Redis connection
   */
  async onApplicationShutdown(): Promise<void> {
    await this.redis.quit();
  }
}

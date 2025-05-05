import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  HealthCheckService,
  TypeOrmHealthIndicator,
  MemoryHealthIndicator,
  DiskHealthIndicator,
  HealthCheckResult,
  HealthIndicatorFunction,
} from '@nestjs/terminus';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { RedisHealthIndicator } from './indicators/redis.health';
import * as os from 'os';

@Injectable()
export class HealthService {
  constructor(
    private health: HealthCheckService,
    private typeOrmHealthIndicator: TypeOrmHealthIndicator,
    private memoryHealthIndicator: MemoryHealthIndicator,
    private diskHealthIndicator: DiskHealthIndicator,
    private redisHealthIndicator: RedisHealthIndicator,
    private configService: ConfigService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  /**
   * Perform a complete health check of all system components
   */
  async check(): Promise<HealthCheckResult> {
    const diskPath = os.platform() === 'win32' ? 'C:\\' : '/';
    const checks: HealthIndicatorFunction[] = [
      // Database connection check
      async () =>
        this.typeOrmHealthIndicator.pingCheck('database', { connection: this.dataSource }),

      // Redis connection check
      async () => this.redisHealthIndicator.isHealthy('redis'),

      // Memory usage check (max 512MB heap)
      async () => this.memoryHealthIndicator.checkHeap('memory_heap', 512 * 1024 * 1024),

      // Memory RSS check (max 1GB)
      async () => this.memoryHealthIndicator.checkRSS('memory_rss', 1024 * 1024 * 1024),

      // Disk storage check (ensure at least 500MB free)
      async () =>
        this.diskHealthIndicator.checkStorage('disk', {
          thresholdPercent: 0.9,
          path: diskPath,
        }),
    ];

    return this.health.check(checks);
  }

  /**
   * Liveness probe - minimal check to verify the application is running
   */
  async checkLiveness(): Promise<HealthCheckResult> {
    return this.health.check([]);
  }

  /**
   * Readiness probe - check if the application is ready to accept traffic
   */
  async checkReadiness(): Promise<HealthCheckResult> {
    const checks: HealthIndicatorFunction[] = [
      // Database connection check
      async () =>
        this.typeOrmHealthIndicator.pingCheck('database', { connection: this.dataSource }),

      // Redis connection check
      async () => this.redisHealthIndicator.isHealthy('redis'),
    ];

    return this.health.check(checks);
  }
}

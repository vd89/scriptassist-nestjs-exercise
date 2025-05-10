import { Injectable, CanActivate, ExecutionContext, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { ConfigService } from '@nestjs/config';
import {
  IRateLimiterOptions,
  RateLimiterMemory,
  RateLimiterRedis,
  RateLimiterRes,
} from 'rate-limiter-flexible';
import Redis from 'ioredis';
import { Request } from 'express';
import { RATE_LIMIT_KEY, RateLimitOptions } from '../decorators/rate-limit.decorator';
import { RateLimitException } from '../exceptions/rate-limit.exception';

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);
  private redisClient: Redis;
  private readonly limiters = new Map<string, RateLimiterRedis>();
  private readonly defaultPoints = 100;
  private readonly defaultDuration = 60; // Default duration in seconds

  constructor(
    private reflector: Reflector,
    private configService: ConfigService,
  ) {
    // Create Redis client for the rate limiter
    this.redisClient = new Redis({
      host: this.configService.get('REDIS_HOST', 'localhost'),
      port: this.configService.get<number>('REDIS_PORT', 6379),
      enableOfflineQueue: false,
    });

    // Set up error handling for Redis
    this.redisClient.on(
      'error',
      (err: Error & { code?: string; address?: string; port?: number }) => {
        if (err.code === 'ECONNREFUSED') {
          this.logger.warn(
            `Redis connection refused at ${err.address}:${err.port}. Rate limiting is running in degraded (in-memory) mode.`,
          );
        } else {
          this.logger.error(`Redis error: ${err.message}`);
        }
      },
    );
  }

  private createRateLimiter(points: number, duration: number): RateLimiterRedis {
    const keyPrefix = `ratelimit_${points}_${duration}`;

    const insuranceLimiterOptions: IRateLimiterOptions = {
      points,
      duration,
      keyPrefix: 'ratelimit_insurance',
    };

    this.logger.debug(`Creating rate limiter: ${points} points per ${duration}s`);

    return new RateLimiterRedis({
      storeClient: this.redisClient,
      keyPrefix,
      points,
      duration,
      blockDuration: duration,
      inMemoryBlockOnConsumed: points + 1,
      inMemoryBlockDuration: duration,
      insuranceLimiter: new RateLimiterMemory(insuranceLimiterOptions),
    });
  }

  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const handler = context.getHandler();
    const controller = context.getClass();

    // First check for handler-level rate limit options
    let rateLimitOptions = this.reflector.get<RateLimitOptions>(RATE_LIMIT_KEY, handler);

    // If not found on handler, check for controller-level options
    if (!rateLimitOptions) {
      rateLimitOptions = this.reflector.get<RateLimitOptions>(RATE_LIMIT_KEY, controller);
    }

    this.logger.debug(`Rate limit options: ${JSON.stringify(rateLimitOptions)}`);

    // Extract points and duration from options or use defaults
    const points = rateLimitOptions?.points ?? this.defaultPoints;
    const duration = rateLimitOptions?.duration ?? this.defaultDuration;

    const routeName = handler.name || 'unknown';
    const isCustomLimit = !!rateLimitOptions;
    this.logger.debug(
      `Rate limit for ${routeName}: ${points} requests per ${duration}s ${isCustomLimit ? '(custom)' : '(default)'}`,
    );

    // Generate a unique key for the limiter configuration
    const configKey = `${points}:${duration}`;

    // Get or create the limiter instance for this configuration
    let limiter = this.limiters.get(configKey);
    if (!limiter) {
      limiter = this.createRateLimiter(points, duration);
      this.limiters.set(configKey, limiter);
    }

    // Create a unique key for each client
    const userId = (request.user as any)?.id || '';
    const clientKey = userId ? `${userId}_${this.getClientIp(request)}` : this.getClientIp(request);

    // Pass the specific limiter instance and points to the handler
    return this.handleRateLimit(limiter, clientKey, points);
  }

  private async handleRateLimit(
    limiter: RateLimiterRedis,
    key: string,
    points: number,
  ): Promise<boolean> {
    try {
      await limiter.consume(key, 1);
      return true;
    } catch (rateLimiterRes) {
      if (rateLimiterRes instanceof RateLimiterRes) {
        const retryAfter = Math.ceil(rateLimiterRes.msBeforeNext / 1000) || 1;
        const resetTime = Math.floor(Date.now() / 1000) + retryAfter;

        throw new RateLimitException(retryAfter, points, rateLimiterRes.remainingPoints, resetTime);
      }

      this.logger.error('Rate limiter unexpected error:', rateLimiterRes);
      return true; // Fail open for better availability
    }
  }

  private getClientIp(request: Request): string {
    const forwardedFor = request.headers['x-forwarded-for'];
    if (typeof forwardedFor === 'string') {
      return forwardedFor.split(',')[0].trim();
    }
    if (Array.isArray(forwardedFor) && forwardedFor.length > 0) {
      return forwardedFor[0].trim();
    }

    const ip = request.headers['x-real-ip'] || request.connection.remoteAddress;
    return (typeof ip === 'string' ? ip : null) ?? '127.0.0.1';
  }
}

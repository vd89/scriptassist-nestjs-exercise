import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
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
  private redisClient: Redis;
  private insuranceLimiter: RateLimiterMemory;
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
      enableOfflineQueue: false, // Prevent commands from being queued when Redis is not connected
    });

    // Set up error handling for Redis
    this.redisClient.on(
      'error',
      (err: Error & { code?: string; address?: string; port?: number }) => {
        if (err.code === 'ECONNREFUSED') {
          // Log a concise, user-friendly warning and degrade gracefully
          // eslint-disable-next-line no-console
          console.warn(
            `Redis connection refused at ${err.address}:${err.port}. Rate limiting is running in degraded (in-memory) mode. Please ensure Redis is running and accessible.`,
          );
        } else {
          // eslint-disable-next-line no-console
          console.error('Redis error:', err.message);
        }
        // Do not throw or crash the app
      },
    );

    // Create an insurance limiter (in-memory fallback)
    // Use defaults matching the most common rate limit expected, or make configurable
    const insuranceLimiterOptions: IRateLimiterOptions = {
      points: this.defaultPoints, // Fallback points
      duration: this.defaultDuration, // Fallback duration
      keyPrefix: 'ratelimit_insurance', // Use a different prefix for insurance
    };
    this.insuranceLimiter = new RateLimiterMemory(insuranceLimiterOptions);
  }

  private createRateLimiter(points: number, duration: number): RateLimiterRedis {
    // Create a unique key prefix for this specific limit configuration
    // This ensures keys in Redis don't clash for different limits on the same resource
    const keyPrefix = `ratelimit_${points}_${duration}`;

    return new RateLimiterRedis({
      storeClient: this.redisClient,
      keyPrefix: keyPrefix,
      points: points,
      duration: duration,
      blockDuration: duration, // Block for the duration of the limit window when exceeded
      inMemoryBlockOnConsumed: points + 1, // Block in memory if Redis is down after exceeding points
      inMemoryBlockDuration: duration,
      insuranceLimiter: this.insuranceLimiter, // Use the shared insurance limiter
    });
  }

  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    // Get custom rate limit settings if provided via decorator
    const rateLimitOptions = this.reflector.get<RateLimitOptions>(
      RATE_LIMIT_KEY,
      context.getHandler(),
    );

    // Extract points and duration from options or use defaults
    const points = rateLimitOptions?.points ?? this.defaultPoints;
    const duration = rateLimitOptions?.duration ?? this.defaultDuration;

    // Generate a unique key for the limiter configuration
    const configKey = `${points}:${duration}`;

    // Get or create the limiter instance for this configuration
    let limiter = this.limiters.get(configKey);
    if (!limiter) {
      limiter = this.createRateLimiter(points, duration);
      this.limiters.set(configKey, limiter);
    }

    // Create a unique key for each client (IP or IP + User ID)
    const userId = (request.user as any)?.id || ''; // Use nullish coalescing
    // Note: The key for the limiter instance (configKey) is different from the client key
    const clientKey = userId ? `${userId}_${this.getClientIp(request)}` : this.getClientIp(request);

    // Pass the specific limiter instance and points to the handler
    return this.handleRateLimit(limiter, clientKey, points);
  }

  private async handleRateLimit(
    limiter: RateLimiterRedis,
    key: string,
    points: number, // Pass points to use in the exception
  ): Promise<boolean> {
    try {
      // Consume 1 point for the specific client key using the correct limiter instance
      await limiter.consume(key, 1);
      return true;
    } catch (rateLimiterRes) {
      if (rateLimiterRes instanceof RateLimiterRes) {
        const retryAfter = Math.ceil(rateLimiterRes.msBeforeNext / 1000) || 1; // Use ceil and ensure minimum 1
        const resetTime = Math.floor(Date.now() / 1000) + retryAfter; // Use floor for timestamp

        // Throw custom exception with details from the specific limit configuration
        throw new RateLimitException(
          retryAfter,
          points, // Use the actual points limit for this route
          rateLimiterRes.remainingPoints, // Provide remaining points if available
          resetTime,
        );
      }

      // If error is not a RateLimiterRes instance, it's likely a Redis connection issue
      // The insuranceLimiter should handle this, but log unexpected errors
      console.error('Rate limiter unexpected error:', rateLimiterRes);
      // Depending on policy, you might want to fail closed (return false)
      // But failing open maintains availability during Redis issues
      return true; // Fail open for better availability
    }
  }

  private getClientIp(request: Request): string {
    // Prioritize 'x-forwarded-for' if behind a proxy
    const forwardedFor = request.headers['x-forwarded-for'];
    if (typeof forwardedFor === 'string') {
      // Take the first IP if multiple are present
      return forwardedFor.split(',')[0].trim();
    }
    if (Array.isArray(forwardedFor) && forwardedFor.length > 0) {
      return forwardedFor[0].trim();
    }

    // Fallback to other headers or connection remote address
    const ip = request.headers['x-real-ip'] || request.connection.remoteAddress;

    // Ensure a string is returned, default to localhost if unavailable
    return (typeof ip === 'string' ? ip : null) ?? '127.0.0.1';
  }
}

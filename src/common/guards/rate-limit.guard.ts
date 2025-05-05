import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { ConfigService } from '@nestjs/config';
import { RateLimiterRedis, RateLimiterRes } from 'rate-limiter-flexible';
import Redis from 'ioredis';
import { Request } from 'express';
import { RATE_LIMIT_KEY, RateLimitOptions } from '../decorators/rate-limit.decorator';
import { RateLimitException } from '../exceptions/rate-limit.exception';

@Injectable()
export class RateLimitGuard implements CanActivate {
  private rateLimiter: RateLimiterRedis;
  private readonly defaultPoints = 100;
  private readonly defaultDuration = 60;

  constructor(
    private reflector: Reflector,
    private configService: ConfigService,
  ) {
    // Create Redis client for the rate limiter
    const redisClient = new Redis({
      host: this.configService.get('REDIS_HOST', 'localhost'),
      port: this.configService.get<number>('REDIS_PORT', 6379),
      enableOfflineQueue: false, // Prevent commands from being queued when Redis is not connected
    });

    // Set up error handling for Redis
    redisClient.on('error', err => {
      console.error('Redis error:', err);
    });

    // Initialize rate limiter with Redis
    this.rateLimiter = new RateLimiterRedis({
      storeClient: redisClient,
      keyPrefix: 'ratelimit',
      points: this.defaultPoints, // Default max requests per minute
      duration: this.defaultDuration, // 1 minute in seconds
      blockDuration: 60, // Block for 1 minute when exceeding limit
      inmemoryBlockOnConsumed: 101, // Block on 101st request in memory if Redis is down
      inmemoryBlockDuration: 60,
      insuranceLimiter: {
        points: this.defaultPoints, // Fallback points
        duration: this.defaultDuration, // Fallback duration
      },
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
    const points = rateLimitOptions?.points || this.defaultPoints;
    const duration = rateLimitOptions?.duration || this.defaultDuration;

    // Create a unique key for each client
    // Consider both IP address and user ID if authenticated
    const userId = (request.user as any)?.id || '';
    const key = userId ? `${userId}_${this.getClientIp(request)}` : this.getClientIp(request);

    return this.handleRateLimit(key, points, duration);
  }

  private async handleRateLimit(key: string, points: number, duration: number): Promise<boolean> {
    try {
      await this.rateLimiter.consume(key, 1);
      return true;
    } catch (rateLimiterRes) {
      if (rateLimiterRes instanceof RateLimiterRes) {
        const retryAfter = Math.round(rateLimiterRes.msBeforeNext / 1000) || 1;
        const resetTime = Math.round(Date.now() / 1000) + retryAfter;

        throw new RateLimitException(
          retryAfter,
          points,
          0, // Remaining requests
          resetTime,
        );
      }

      // If error is not a RateLimiterRes instance, it's likely a Redis connection issue
      // Fall back to allow the request but log the error
      console.error('Rate limiter error:', rateLimiterRes);
      return true; // Fail open for better availability
    }
  }

  private getClientIp(request: Request): string {
    // Get IP from various headers or connection object
    const ip =
      request.headers['x-forwarded-for'] ||
      request.headers['x-real-ip'] ||
      request.connection.remoteAddress;

    // Handle array case for x-forwarded-for
    return Array.isArray(ip) ? ip[0] : (ip as string) || '127.0.0.1';
  }
}

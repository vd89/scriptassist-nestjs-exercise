import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { ConfigService } from '@nestjs/config';
import { RateLimiterRedis, RateLimiterRes } from 'rate-limiter-flexible';
import Redis from 'ioredis';
import { Request } from 'express';
import { RATE_LIMIT_KEY } from '../decorators/rate-limit.decorator';

@Injectable()
export class RateLimitGuard implements CanActivate {
  private rateLimiter: RateLimiterRedis;

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
      points: 100, // Default max requests per minute
      duration: 60, // 1 minute in seconds
      blockDuration: 60, // Block for 1 minute when exceeding limit
      inmemoryBlockOnConsumed: 101, // Block on 101st request in memory if Redis is down
      inmemoryBlockDuration: 60,
      insuranceLimiter: {
        points: 100, // Fallback points
        duration: 60, // Fallback duration
      },
    });
  }

  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    // Get custom rate limit settings if provided via decorator
    const rateLimit = this.reflector.get<{ points: number; duration: number }>(
      RATE_LIMIT_KEY,
      context.getHandler(),
    );

    const points = rateLimit?.points || 100;
    const duration = rateLimit?.duration || 60;

    // Create a unique key for each client
    // Consider both IP address and user ID if authenticated
    const userId = (request.user as any)?.id || '';
    const key = userId ? `${userId}_${this.getClientIp(request)}` : this.getClientIp(request);

    return this.handleRateLimit(key, points, duration, request);
  }

  private async handleRateLimit(
    key: string,
    points: number,
    duration: number,
    request: Request,
  ): Promise<boolean> {
    try {
      await this.rateLimiter.consume(key, 1);
      return true;
    } catch (rateLimiterRes) {
      if (rateLimiterRes instanceof RateLimiterRes) {
        const retryAfter = Math.round(rateLimiterRes.msBeforeNext / 1000) || 1;

        throw new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            error: 'Too Many Requests',
            message: 'Rate limit exceeded',
            retryAfter, // Seconds until the client can retry
          },
          HttpStatus.TOO_MANY_REQUESTS,
          {
            headers: {
              'Retry-After': `${retryAfter}`, // RFC 7231 compliant header
              'X-RateLimit-Limit': `${points}`, // Maximum allowed requests
              'X-RateLimit-Remaining': `0`, // Number of remaining requests
              'X-RateLimit-Reset': `${Math.round(Date.now() / 1000) + retryAfter}`, // Timestamp when client can retry
            },
          },
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

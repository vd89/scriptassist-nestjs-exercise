import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Inject,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { CacheService } from '../services/cache.service';
import { RATE_LIMIT_KEY, RateLimitOptions } from '../decorators/rate-limit.decorator';
import { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';

/**
 * Rate Limit Guard with Redis-based implementation
 * Provides distributed rate limiting with improved security
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);
  private readonly defaultOptions: RateLimitOptions;

  constructor(
    private reflector: Reflector,
    private cacheService: CacheService,
    private configService: ConfigService,
  ) {
    // Default rate limit options from configuration
    this.defaultOptions = {
      limit: configService.get<number>('RATE_LIMIT_MAX_REQUESTS', 100),
      windowMs: configService.get<number>('RATE_LIMIT_WINDOW_MS', 60000), // 1 minute
    };
  }

  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    // Get custom rate limit options from decorator
    const options =
      this.reflector.getAllAndOverride<RateLimitOptions>(RATE_LIMIT_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) || this.defaultOptions;

    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();

    return this.handleRateLimit(request, response, options);
  }

  private generateRateLimitKey(request: Request, options: RateLimitOptions): string {
    // Enhanced client identification to prevent spoofing
    const clientId = this.getClientIdentifier(request);

    // Generate a hash of the client ID to ensure privacy
    const hashedClientId = this.hashIdentifier(clientId);

    // Use the request path for more granular control
    const path = request.path;

    // Include window size in key to handle configuration changes
    const windowSizeId = `${options.windowMs}`;

    return `ratelimit:${hashedClientId}:${path}:${windowSizeId}`;
  }

  private getClientIdentifier(request: Request): string {
    // Use multiple request properties to better identify clients
    // while being careful not to leak any PII
    const ip =
      request.ip || request.headers['x-forwarded-for'] || request.socket.remoteAddress || 'unknown';

    const userAgent = request.headers['user-agent'] || 'unknown';

    // Optional: Add more properties if needed for better identification
    return `${ip}:${userAgent}`;
  }

  private hashIdentifier(identifier: string): string {
    // Use SHA-256 to hash the identifier for privacy
    return createHash('sha256').update(identifier).digest('hex');
  }

  private async handleRateLimit(
    request: Request,
    response: Response,
    options: RateLimitOptions,
  ): Promise<boolean> {
    const { limit, windowMs } = options;
    const key = this.generateRateLimitKey(request, options);

    try {
      // Get the current count or create if not exists
      const currentCount = await this.cacheService.increment(key);

      // Set expiration (TTL) on first request
      if (currentCount === 1) {
        await this.cacheService.set(key, 1, Math.ceil(windowMs / 1000));
      }

      // Calculate remaining requests and reset time
      const remaining = Math.max(0, limit - currentCount);
      const resetTime = Date.now() + windowMs;

      // Set rate limit headers (following standard conventions)
      response.header('X-RateLimit-Limit', limit.toString());
      response.header('X-RateLimit-Remaining', remaining.toString());
      response.header('X-RateLimit-Reset', Math.ceil(resetTime / 1000).toString());

      // If limit exceeded, return 429 Too Many Requests
      if (currentCount > limit) {
        this.logger.warn(`Rate limit exceeded for ${request.ip} on ${request.path}`);

        response.status(HttpStatus.TOO_MANY_REQUESTS);
        response.header('Retry-After', Math.ceil(windowMs / 1000).toString());

        response.json({
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Too many requests, please try again later.',
          error: 'Rate limit exceeded',
        });

        return false;
      }

      return true;
    } catch (error) {
      // If cache service fails, log the error but allow the request to proceed
      this.logger.error(
        `Rate limit error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      return true;
    }
  }
}

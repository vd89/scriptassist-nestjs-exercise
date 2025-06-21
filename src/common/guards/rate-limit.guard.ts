import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CacheService } from '@common/services/cache.service';
import { RATE_LIMIT_KEY } from '@common/decorators/rate-limit.decorator';

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(private reflector: Reflector, private cache: CacheService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const ip = request.ip;

    const handler = context.getHandler();
    const limitConfig =
      this.reflector.get<{ limit: number; windowMs: number }>(
        RATE_LIMIT_KEY,
        handler,
      ) || { limit: 100, windowMs: 60_000 };

    return this.handleRateLimit(ip, limitConfig.limit, limitConfig.windowMs);
  }

  private async handleRateLimit(
    ip: string,
    maxRequests: number,
    windowMs: number,
  ): Promise<boolean> {
    const now = Date.now();

    const requestCount = await this.cache.get<number>('ratelimit', ip);
    if (requestCount && requestCount >= maxRequests) {
      const ttl = await this.cache.getTTL('ratelimit', ip);
      throw new HttpException(
        {
          status: HttpStatus.TOO_MANY_REQUESTS,
          error: 'Rate limit exceeded',
          message: `You have exceeded the ${maxRequests} requests per ${
            windowMs / 1000
          } seconds limit.`,
          limit: maxRequests,
          current: requestCount,
          remaining: 0,
          nextValidRequestTime: new Date(now + ttl * 1000).toISOString(),
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (requestCount) {
      await this.cache.increment('ratelimit', ip);
    } else {
      await this.cache.set('ratelimit', ip, 1, windowMs / 1000);
    }

    return true;
  }
}
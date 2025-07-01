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
import * as crypto from 'crypto';

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private cache: CacheService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const ip = request.ip;

    const handler = context.getHandler();
    const targetClass = context.getClass();
    const limitConfig = this.reflector.getAllAndOverride<{ limit: number; windowMs: number }>(
      RATE_LIMIT_KEY,
      [handler, targetClass],
    );
    return this.handleRateLimit(ip, limitConfig.limit, limitConfig.windowMs);
  }

  private async handleRateLimit(
    ip: string,
    maxRequests: number,
    windowMs: number,
  ): Promise<boolean> {
    const now = Date.now();
    const maskedIp = this.hashIp(ip);
    const requestCount = await this.cache.get<number>('ratelimit', maskedIp);
    if (requestCount && requestCount >= maxRequests) {
      const ttl = await this.cache.getTTL('ratelimit', maskedIp);
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
      await this.cache.increment('ratelimit', maskedIp);
    } else {
      await this.cache.set('ratelimit', maskedIp, 1, windowMs / 1000);
    }

    return true;
  }

  private hashIp(ip: string): string {
    return crypto.createHash('sha256').update(ip).digest('hex');
  }
}

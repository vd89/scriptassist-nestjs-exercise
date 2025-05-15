import { Injectable, CanActivate, ExecutionContext, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';

export const RATE_LIMIT_KEY = 'rate_limit';

export interface RateLimitOptions {
  limit: number;
  windowMs: number;
}

// Improved in-memory storage with cleanup mechanism
// Note: In production, Redis would be better for distributed rate limiting
class RateLimitStore {
  private store: Map<string, { count: number, timestamp: number }[]> = new Map();
  private readonly cleanupInterval: NodeJS.Timeout;
  private readonly logger = new Logger('RateLimitStore');

  constructor(private readonly ttl: number = 60 * 60 * 1000) { // 1 hour default TTL
    // Cleanup every 5 minutes
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  private cleanup(): void {
    const now = Date.now();
    let cleanupCount = 0;
    
    for (const [key, records] of this.store.entries()) {
      // Remove entries older than TTL
      const filtered = records.filter(record => now - record.timestamp < this.ttl);
      
      if (filtered.length === 0) {
        this.store.delete(key);
        cleanupCount++;
      } else if (filtered.length < records.length) {
        this.store.set(key, filtered);
      }
    }
    
    this.logger.verbose(`Cleaned up ${cleanupCount} rate limit entries`);
  }

  // Add a request record
  addRecord(key: string, windowMs: number): void {
    const now = Date.now();
    const records = this.store.get(key) || [];
    
    // Remove outdated records
    const windowStart = now - windowMs;
    const filtered = records.filter(record => record.timestamp > windowStart);
    
    // Add new record
    filtered.push({ count: 1, timestamp: now });
    this.store.set(key, filtered);
  }

  // Check if rate limit is exceeded
  isRateLimited(key: string, limit: number, windowMs: number): boolean {
    const now = Date.now();
    const records = this.store.get(key) || [];
    
    // Filter records within time window
    const windowStart = now - windowMs;
    const filtered = records.filter(record => record.timestamp > windowStart);
    
    return filtered.length >= limit;
  }

  // Get rate limit info
  getRateLimitInfo(key: string, limit: number, windowMs: number): { current: number, remaining: number, reset: number } {
    const now = Date.now();
    const records = this.store.get(key) || [];
    
    // Filter records within time window
    const windowStart = now - windowMs;
    const filtered = records.filter(record => record.timestamp > windowStart);
    
    // Calculate reset time (oldest record + windowMs, or now + windowMs if no records)
    const oldestRecord = filtered.length > 0 ? Math.min(...filtered.map(r => r.timestamp)) : now;
    const reset = oldestRecord + windowMs;
    
    return {
      current: filtered.length,
      remaining: Math.max(0, limit - filtered.length),
      reset,
    };
  }
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  private static readonly store = new RateLimitStore();
  private readonly logger = new Logger(RateLimitGuard.name);
  
  constructor(
    private reflector: Reflector,
    private configService: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    
    // Get rate limit options from decorator
    const options = this.reflector.get<RateLimitOptions>(
      RATE_LIMIT_KEY,
      context.getHandler(),
    ) || this.reflector.get<RateLimitOptions>(
      RATE_LIMIT_KEY,
      context.getClass(),
    );

    if (!options) {
      return true; // No rate limiting if no options
    }

    const { limit, windowMs } = options as RateLimitOptions;
    
    // Generate a key for the rate limit
    // Preferably use authenticated user ID if available
    const user = request.user;
    let key = user?.id ? `user:${user.id}` : `ip:${this.hashIp(request.ip)}`;
    
    // Add endpoint information to make rate limiting more specific
    const endpoint = `${request.method}:${request.route?.path || 'unknown'}`;
    key = `${key}:${endpoint}`;
    
    // Check if rate limit is exceeded
    if (RateLimitGuard.store.isRateLimited(key, limit, windowMs)) {
      const rateLimitInfo = RateLimitGuard.store.getRateLimitInfo(key, limit, windowMs);
      
      // Add rate limit headers
      const response = context.switchToHttp().getResponse();
      response.header('X-RateLimit-Limit', limit);
      response.header('X-RateLimit-Remaining', 0);
      response.header('X-RateLimit-Reset', rateLimitInfo.reset);
      
      this.logger.warn(`Rate limit exceeded for ${key}, limit: ${limit}, window: ${windowMs}ms`);
      
      throw new HttpException({
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message: 'Too many requests, please try again later.',
        error: 'Too Many Requests',
      }, HttpStatus.TOO_MANY_REQUESTS);
    }
    
    // Add record and update headers
    RateLimitGuard.store.addRecord(key, windowMs);
    const rateLimitInfo = RateLimitGuard.store.getRateLimitInfo(key, limit, windowMs);
    
    // Add rate limit headers
    const response = context.switchToHttp().getResponse();
    response.header('X-RateLimit-Limit', limit);
    response.header('X-RateLimit-Remaining', rateLimitInfo.remaining);
    response.header('X-RateLimit-Reset', rateLimitInfo.reset);
    
    return true;
  }
  
  // Hash IP address for privacy
  private hashIp(ip: string): string {
    // Simple hashing for example purposes
    // In production, use a proper crypto hashing function
    let hash = 0;
    for (let i = 0; i < ip.length; i++) {
      const char = ip.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(36);
  }
} 
import { Injectable, CanActivate, ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import * as crypto from 'crypto';

// Improved storage using Map for better performance
const requestRecords = new Map<string, { count: number, timestamp: number }[]>();
const CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(private reflector: Reflector) {
    // Initialize cleanup interval
    setInterval(() => this.cleanupOldRecords(), CLEANUP_INTERVAL);
  }

  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToHttp().getRequest();
    const ip = request.ip;
    
    // Get rate limit options from decorator metadata
    const options = this.reflector.get<{ limit: number; windowMs: number }>(
      'rate_limit',
      context.getHandler(),
    ) || { limit: 100, windowMs: 60 * 1000 }; // Default values
    
    // Hash IP for privacy and security
    const hashedIp = this.hashIp(ip);
    return this.handleRateLimit(hashedIp, options);
  }

  private hashIp(ip: string): string {
    return crypto.createHash('sha256').update(ip).digest('hex');
  }

  private handleRateLimit(hashedIp: string, options: { limit: number; windowMs: number }): boolean {
    const now = Date.now();
    const { limit: maxRequests, windowMs } = options;
    
    // Initialize records for IP if not exists
    if (!requestRecords.has(hashedIp)) {
      requestRecords.set(hashedIp, []);
    }
    
    const records = requestRecords.get(hashedIp)!;
    const windowStart = now - windowMs;
    
    // Filter out old records
    const recentRecords = records.filter(record => record.timestamp > windowStart);
    requestRecords.set(hashedIp, recentRecords);
    
    // Check rate limit
    if (recentRecords.length >= maxRequests) {
      throw new HttpException({
        status: HttpStatus.TOO_MANY_REQUESTS,
        error: 'Rate limit exceeded',
        message: `You have exceeded the ${maxRequests} requests per ${windowMs / 1000} seconds limit.`,
        remaining: 0,
        reset: recentRecords[0].timestamp + windowMs,
      }, HttpStatus.TOO_MANY_REQUESTS);
    }
    
    // Add new record
    recentRecords.push({ count: 1, timestamp: now });
    requestRecords.set(hashedIp, recentRecords);
    
    return true;
  }

  private cleanupOldRecords(): void {
    const now = Date.now();
    for (const [ip, records] of requestRecords.entries()) {
      const windowStart = now - 60 * 60 * 1000; // Clean up records older than 1 hour
      const recentRecords = records.filter(record => record.timestamp > windowStart);
      
      if (recentRecords.length === 0) {
        requestRecords.delete(ip);
      } else {
        requestRecords.set(ip, recentRecords);
      }
    }
  }
} 
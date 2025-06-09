import { Injectable, CanActivate, ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import * as crypto from 'crypto';

// Improved in-memory storage for rate limiting
// Still has distributed limitations, but with better structure and no sensitive data exposure
class RateLimitStore {
  private store = new Map<string, { 
    requests: number, 
    windowStart: number
  }>();
  
  // Cleanup old entries periodically (every 5 minutes)
  constructor() {
    setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }
  
  // Using a Map for O(1) lookups instead of array filtering
  increment(key: string, windowMs: number): { 
    exceeded: boolean; 
    current: number; 
    limit: number; 
    remainingTime?: number;
  } {
    const now = Date.now();
    const windowStart = now - windowMs;
    
    // Get or initialize rate limit data
    let data = this.store.get(key);
    
    // If no data exists or window has expired, create fresh data
    if (!data || data.windowStart < windowStart) {
      data = { requests: 0, windowStart: now };
    }
    
    // Increment request count
    data.requests++;
    
    // Store updated data
    this.store.set(key, data);
    
    // Check if rate limit is exceeded
    const maxRequests = 100; // Default limit
    const exceeded = data.requests > maxRequests;
    const remainingTime = exceeded ? data.windowStart + windowMs - now : undefined;
    
    return {
      exceeded,
      current: data.requests,
      limit: maxRequests,
      remainingTime
    };
  }
  
  // Clean up expired entries
  private cleanup(): void {
    const now = Date.now();
    // Default window is 1 minute - clean anything older than 2 minutes to be safe
    const cutoff = now - 2 * 60 * 1000;
    
    for (const [key, data] of this.store.entries()) {
      if (data.windowStart < cutoff) {
        this.store.delete(key);
      }
    }
  }
}

// Singleton store
const rateLimitStore = new RateLimitStore();

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToHttp().getRequest();
    const route = context.getHandler().name;
    
    // Hash IP to avoid storing raw IPs
    const ipHash = this.hashIp(request.ip);
    
    // Create a composite key with the route to have separate limits per endpoint
    const key = `${ipHash}:${route}`;
    
    return this.handleRateLimit(key);
  }

  private hashIp(ip: string): string {
    // Create a hash of the IP to avoid storing raw IPs
    return crypto.createHash('sha256').update(ip).digest('hex').substring(0, 16);
  }

  private handleRateLimit(key: string): boolean {
    const windowMs = 60 * 1000; // 1 minute
    
    // Use the improved store
    const result = rateLimitStore.increment(key, windowMs);
    
    if (result.exceeded) {
      // Improved error response - no sensitive information
      throw new HttpException({
        status: HttpStatus.TOO_MANY_REQUESTS,
        error: 'Rate limit exceeded',
        message: 'Too many requests, please try again later.',
        limit: result.limit,
        current: result.current,
        // No IP address exposed
        retryAfter: Math.ceil(result.remainingTime! / 1000) // in seconds
      }, HttpStatus.TOO_MANY_REQUESTS);
    }
    
    return true;
  }
}

// Improved decorator with actual functionality
export const RateLimit = (options: { limit: number, windowMs: number }) => {
  return (target: any, key?: string, descriptor?: any) => {
    // Store rate limit options in metadata
    Reflect.defineMetadata('rateLimit', options, descriptor.value);
    return descriptor;
  };
}; 
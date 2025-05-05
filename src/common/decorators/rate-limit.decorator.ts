import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_KEY = 'rate_limit';

/**
 * Interface defining rate limit configuration options
 * These values are used to configure the rate limiter,
 * not as direct properties of the RateLimiterAbstract
 */
export interface RateLimitOptions {
  points: number; // Maximum number of requests allowed
  duration: number; // Time window in seconds
}

/**
 * Decorator that sets rate limiting metadata for a route
 * @param options Rate limit configuration
 */
export const RateLimit = (options: RateLimitOptions) => {
  return SetMetadata(RATE_LIMIT_KEY, options);
};

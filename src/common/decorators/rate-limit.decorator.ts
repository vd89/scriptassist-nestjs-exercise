import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_KEY = 'rate_limit';

/**
 * Rate limit options for configuring the rate limiting behavior
 */
export interface RateLimitOptions {
  /**
   * Maximum number of requests allowed within the time window
   */
  limit: number;

  /**
   * Time window in milliseconds
   */
  windowMs: number;
}

/**
 * Decorator for applying rate limiting to controllers or routes
 * @param options Rate limit configuration options
 * @returns Decorator function
 */
export const RateLimit = (options: RateLimitOptions) => {
  return SetMetadata(RATE_LIMIT_KEY, options);
};

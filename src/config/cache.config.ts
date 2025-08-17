import { registerAs } from '@nestjs/config';

/**
 * Cache configuration with sensible defaults
 */
export default registerAs('cache', () => ({
  // Redis connection
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    tls: process.env.REDIS_TLS === 'true',
  },

  // Cache settings
  namespace: process.env.CACHE_NAMESPACE || 'app:cache:',
  defaultTtl: parseInt(process.env.CACHE_DEFAULT_TTL || '300', 10), // 5 minutes

  // Enable/disable caching
  enabled: process.env.CACHE_ENABLED !== 'false',
}));

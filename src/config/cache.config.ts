import { registerAs } from '@nestjs/config';

export default registerAs('cache', () => ({
  // Redis connection settings
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
  },
  // Default TTL in seconds
  defaultTTL: parseInt(process.env.CACHE_DEFAULT_TTL || '300', 10),
  // Namespace prefix for keys
  namespace: process.env.CACHE_NAMESPACE || 'app',
  // Enable/disable cache
  enabled: process.env.CACHE_ENABLED !== 'false',
})); 
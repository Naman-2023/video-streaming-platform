import Redis from 'ioredis';
import { config } from '../config';
import { logger } from '@video-platform/shared';

interface CacheItem {
  value: string;
  expiry?: number;
}

export class CacheService {
  private redis: Redis | null = null;
  private memoryCache: Map<string, CacheItem> = new Map();
  private useRedis: boolean = false;

  async connect(): Promise<void> {
    try {
      this.redis = new Redis(config.redis.url);
      
      this.redis.on('error', (error) => {
        logger.error('Redis connection error', error);
        this.useRedis = false;
      });

      this.redis.on('connect', () => {
        logger.info('Connected to Redis');
        this.useRedis = true;
      });

      // Test connection
      await this.redis.ping();
      this.useRedis = true;
    } catch (error) {
      logger.error('Failed to connect to Redis, falling back to memory cache', error);
      this.useRedis = false;
      // Don't throw error, just use memory cache
    }
  }

  async disconnect(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
      this.redis = null;
    }
  }

  async get(key: string): Promise<string | null> {
    if (this.useRedis && this.redis) {
      return await this.redis.get(key);
    }
    
    // Use memory cache
    const item = this.memoryCache.get(key);
    if (!item) return null;
    
    if (item.expiry && Date.now() > item.expiry) {
      this.memoryCache.delete(key);
      return null;
    }
    
    return item.value;
  }

  async set(key: string, value: string, ttl?: number): Promise<void> {
    if (this.useRedis && this.redis) {
      if (ttl) {
        await this.redis.setex(key, ttl, value);
      } else {
        await this.redis.set(key, value);
      }
      return;
    }
    
    // Use memory cache
    const item: CacheItem = {
      value,
      expiry: ttl ? Date.now() + (ttl * 1000) : undefined
    };
    this.memoryCache.set(key, item);
  }

  async del(key: string): Promise<void> {
    if (this.useRedis && this.redis) {
      await this.redis.del(key);
      return;
    }
    
    // Use memory cache
    this.memoryCache.delete(key);
  }

  async exists(key: string): Promise<boolean> {
    if (this.useRedis && this.redis) {
      const result = await this.redis.exists(key);
      return result === 1;
    }
    
    // Use memory cache
    const item = this.memoryCache.get(key);
    if (!item) return false;
    
    if (item.expiry && Date.now() > item.expiry) {
      this.memoryCache.delete(key);
      return false;
    }
    
    return true;
  }

  async healthCheck(): Promise<boolean> {
    try {
      if (this.useRedis && this.redis) {
        const result = await this.redis.ping();
        return result === 'PONG';
      }
      // Memory cache is always healthy
      return true;
    } catch (error) {
      logger.error('Redis health check failed', error);
      return !this.useRedis; // Return true if using memory cache
    }
  }

  async invalidatePattern(pattern: string): Promise<void> {
    if (this.useRedis && this.redis) {
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
      return;
    }
    
    // Use memory cache - simple pattern matching
    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
    for (const key of this.memoryCache.keys()) {
      if (regex.test(key)) {
        this.memoryCache.delete(key);
      }
    }
  }
}

export const cacheService = new CacheService();
import { Request, Response, NextFunction } from 'express';
import { cacheService } from '../services/cache.service';
import { config } from '../config';
import { cacheHitMiddleware } from './analytics.middleware';
import winston from 'winston';
import zlib from 'zlib';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

interface CacheOptions {
  ttl?: number;
  compress?: boolean;
  keyGenerator?: (req: Request) => string;
}

export const cacheMiddleware = (options: CacheOptions = {}) => {
  const {
    ttl = config.cache.playlistTtl,
    compress = true,
    keyGenerator = (req) => `cache:${req.method}:${req.originalUrl}`
  } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    // Only cache GET requests
    if (req.method !== 'GET') {
      return next();
    }

    const cacheKey = keyGenerator(req);
    
    try {
      // Try to get from cache
      const cachedData = await cacheService.get(cacheKey);
      
      if (cachedData) {
        logger.debug('Cache hit', { cacheKey, url: req.originalUrl });
        
        let responseData = cachedData;
        let headers: Record<string, string> = {};
        
        // Parse cached data (includes headers and body)
        try {
          const parsed = JSON.parse(cachedData);
          responseData = parsed.body;
          headers = parsed.headers || {};
        } catch {
          // If parsing fails, treat as raw data
          responseData = cachedData;
        }

        // Decompress if needed
        if (headers['content-encoding'] === 'gzip' && compress) {
          try {
            responseData = zlib.gunzipSync(Buffer.from(responseData, 'base64')).toString();
          } catch (error) {
            logger.error('Failed to decompress cached data', { cacheKey, error });
            return next();
          }
        }

        // Set headers
        Object.entries(headers).forEach(([key, value]) => {
          res.set(key, value);
        });

        // Add cache headers
        res.set({
          'X-Cache': 'HIT',
          'X-Cache-Key': cacheKey,
        });

        // Apply cache hit middleware for analytics
        cacheHitMiddleware(req, res, () => {});
        
        return res.send(responseData);
      }

      // Cache miss - continue to next middleware
      logger.debug('Cache miss', { cacheKey, url: req.originalUrl });
      
      // Cache miss - no need to call cache hit middleware

      // Override res.send to cache the response
      const originalSend = res.send;
      
      res.send = function(body: any) {
        // Cache the response asynchronously
        setImmediate(async () => {
          try {
            let dataToCache = body;
            const headers: Record<string, string> = {};
            
            // Copy relevant headers
            const headersToCache = [
              'content-type',
              'cache-control',
              'access-control-allow-origin',
              'access-control-allow-methods',
              'access-control-allow-headers',
              'access-control-expose-headers'
            ];
            
            headersToCache.forEach(header => {
              const value = res.get(header);
              if (value) {
                headers[header] = value;
              }
            });

            // Compress if enabled and content is text-based
            if (compress && typeof body === 'string' && body.length > 1024) {
              try {
                const compressed = zlib.gzipSync(body);
                dataToCache = compressed.toString('base64');
                headers['content-encoding'] = 'gzip';
                logger.debug('Compressed response for cache', { 
                  originalSize: body.length, 
                  compressedSize: compressed.length,
                  ratio: (compressed.length / body.length * 100).toFixed(2) + '%'
                });
              } catch (error) {
                logger.error('Failed to compress response', { cacheKey, error });
              }
            }

            // Create cache entry
            const cacheEntry = {
              body: dataToCache,
              headers,
              timestamp: new Date().toISOString()
            };

            await cacheService.set(cacheKey, JSON.stringify(cacheEntry), ttl);
            logger.debug('Response cached', { cacheKey, ttl });
            
          } catch (error) {
            logger.error('Failed to cache response', { cacheKey, error });
          }
        });

        // Add cache headers
        res.set({
          'X-Cache': 'MISS',
          'X-Cache-Key': cacheKey,
        });

        return originalSend.call(this, body);
      };

      next();
      
    } catch (error) {
      logger.error('Cache middleware error', { cacheKey, error });
      next();
    }
  };
};

// Specialized cache middleware for playlists
export const playlistCacheMiddleware = cacheMiddleware({
  ttl: config.cache.playlistTtl,
  compress: true,
  keyGenerator: (req) => {
    const { jobId, quality } = req.params;
    if (req.path.includes('master.m3u8')) {
      return `playlist:master:${jobId}`;
    } else if (req.path.includes('playlist.m3u8')) {
      return `playlist:quality:${jobId}:${quality}`;
    }
    return `playlist:${req.originalUrl}`;
  }
});

// Specialized cache middleware for segments (shorter TTL, no compression)
export const segmentCacheMiddleware = cacheMiddleware({
  ttl: config.cache.segmentTtl,
  compress: false, // Don't compress video segments
  keyGenerator: (req) => {
    const { jobId, quality, segment } = req.params;
    return `segment:${jobId}:${quality}:${segment}`;
  }
});

// Cache invalidation middleware
export const cacheInvalidationMiddleware = (pattern: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // This is a simplified implementation
      // In a real system, you'd use Redis pattern matching or maintain key lists
      const { jobId, quality } = req.params;
      
      if (pattern === 'job' && jobId) {
        // Invalidate all cache entries for a job
        const keysToInvalidate = [
          `playlist:master:${jobId}`,
          `playlist:quality:${jobId}:360p`,
          `playlist:quality:${jobId}:720p`,
          `playlist:quality:${jobId}:1080p`
        ];
        
        for (const key of keysToInvalidate) {
          await cacheService.del(key);
        }
        
        logger.info('Cache invalidated for job', { jobId });
      } else if (pattern === 'quality' && jobId && quality) {
        // Invalidate cache for specific quality
        await cacheService.del(`playlist:quality:${jobId}:${quality}`);
        logger.info('Cache invalidated for quality', { jobId, quality });
      }
      
      next();
    } catch (error) {
      logger.error('Cache invalidation error', error);
      next();
    }
  };
};
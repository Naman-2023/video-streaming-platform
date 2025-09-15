import { logger } from '@video-platform/shared';
import { cacheService } from './cache.service';

interface StreamingMetrics {
  totalRequests: number;
  segmentRequests: number;
  playlistRequests: number;
  errorCount: number;
  bandwidthUsage: number;
  uniqueViewers: Set<string>;
}

export class AnalyticsService {
  private metrics: StreamingMetrics = {
    totalRequests: 0,
    segmentRequests: 0,
    playlistRequests: 0,
    errorCount: 0,
    bandwidthUsage: 0,
    uniqueViewers: new Set()
  };

  async loadPersistedMetrics(): Promise<void> {
    try {
      const cachedMetrics = await cacheService.get('streaming:metrics');
      if (cachedMetrics) {
        const parsed = JSON.parse(cachedMetrics);
        this.metrics = {
          ...parsed,
          uniqueViewers: new Set(parsed.uniqueViewers || [])
        };
      }
      logger.info('Loaded persisted analytics metrics');
    } catch (error) {
      logger.error('Failed to load persisted metrics', error);
    }
  }

  async persistMetrics(): Promise<void> {
    try {
      const metricsToSave = {
        ...this.metrics,
        uniqueViewers: Array.from(this.metrics.uniqueViewers)
      };
      await cacheService.set('streaming:metrics', JSON.stringify(metricsToSave), 3600);
    } catch (error) {
      logger.error('Failed to persist metrics', error);
    }
  }

  recordRequest(type: 'segment' | 'playlist' | 'other', ip: string, bytes?: number): void {
    this.metrics.totalRequests++;
    this.metrics.uniqueViewers.add(ip);
    
    if (type === 'segment') {
      this.metrics.segmentRequests++;
    } else if (type === 'playlist') {
      this.metrics.playlistRequests++;
    }
    
    if (bytes) {
      this.metrics.bandwidthUsage += bytes;
    }
  }

  recordError(): void {
    this.metrics.errorCount++;
  }

  recordCacheHit(path: string, ip: string): void {
    logger.debug('Cache hit recorded', { path, ip });
    // You could extend metrics to track cache hits if needed
  }

  getMetrics(): {
    totalRequests: number;
    segmentRequests: number;
    playlistRequests: number;
    errorCount: number;
    bandwidthUsage: number;
    uniqueViewers: number;
  } {
    return {
      ...this.metrics,
      uniqueViewers: this.metrics.uniqueViewers.size
    };
  }

  resetMetrics(): void {
    this.metrics = {
      totalRequests: 0,
      segmentRequests: 0,
      playlistRequests: 0,
      errorCount: 0,
      bandwidthUsage: 0,
      uniqueViewers: new Set()
    };
  }
}

export const analyticsService = new AnalyticsService();
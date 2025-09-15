import { AnalyticsService } from '../../services/analytics.service';
import { cacheService } from '../../services/cache.service';

// Mock the cache service
jest.mock('../../services/cache.service');

const mockCacheService = cacheService as jest.Mocked<typeof cacheService>;

describe('AnalyticsService', () => {
  let analyticsService: AnalyticsService;

  beforeEach(() => {
    analyticsService = new AnalyticsService();
    jest.clearAllMocks();
  });

  describe('recordRequest', () => {
    it('should record a new request metric', async () => {
      await analyticsService.recordRequest('job-1', '720p', 100, 1024, '192.168.1.1');

      const metrics = await analyticsService.getStreamingMetrics('job-1', '720p');
      
      expect(metrics).toHaveLength(1);
      expect(metrics[0]).toMatchObject({
        jobId: 'job-1',
        quality: '720p',
        requestCount: 1,
        totalBytes: 1024,
        averageResponseTime: 100,
        errorCount: 0
      });
      expect(metrics[0].uniqueIPs.has('192.168.1.1')).toBe(true);
    });

    it('should update existing request metrics', async () => {
      // First request
      await analyticsService.recordRequest('job-1', '720p', 100, 1024, '192.168.1.1');
      
      // Second request
      await analyticsService.recordRequest('job-1', '720p', 200, 2048, '192.168.1.2');

      const metrics = await analyticsService.getStreamingMetrics('job-1', '720p');
      
      expect(metrics).toHaveLength(1);
      expect(metrics[0]).toMatchObject({
        jobId: 'job-1',
        quality: '720p',
        requestCount: 2,
        totalBytes: 3072,
        averageResponseTime: 150, // (100 + 200) / 2
        errorCount: 0
      });
      expect(metrics[0].uniqueIPs.size).toBe(2);
    });

    it('should record error requests', async () => {
      await analyticsService.recordRequest('job-1', '720p', 500, 0, '192.168.1.1', true);

      const metrics = await analyticsService.getStreamingMetrics('job-1', '720p');
      
      expect(metrics[0].errorCount).toBe(1);
    });
  });

  describe('recordCacheHit', () => {
    it('should update cache hit rate', async () => {
      // Record some requests first
      await analyticsService.recordRequest('job-1', '720p', 100, 1024, '192.168.1.1');
      await analyticsService.recordRequest('job-1', '720p', 100, 1024, '192.168.1.1');

      // Record cache hits
      await analyticsService.recordCacheHit(true);
      await analyticsService.recordCacheHit(false);

      const performanceMetrics = await analyticsService.getPerformanceMetrics();
      expect(performanceMetrics.cacheHitRate).toBe(0.5); // 1 hit out of 2 requests
    });
  });

  describe('getStreamingMetrics', () => {
    beforeEach(async () => {
      await analyticsService.recordRequest('job-1', '720p', 100, 1024, '192.168.1.1');
      await analyticsService.recordRequest('job-1', '1080p', 200, 2048, '192.168.1.2');
      await analyticsService.recordRequest('job-2', '720p', 150, 1536, '192.168.1.3');
    });

    it('should return metrics for specific job and quality', async () => {
      const metrics = await analyticsService.getStreamingMetrics('job-1', '720p');
      
      expect(metrics).toHaveLength(1);
      expect(metrics[0].jobId).toBe('job-1');
      expect(metrics[0].quality).toBe('720p');
    });

    it('should return all metrics for a job when quality not specified', async () => {
      const metrics = await analyticsService.getStreamingMetrics('job-1');
      
      expect(metrics).toHaveLength(2);
      expect(metrics.every(m => m.jobId === 'job-1')).toBe(true);
    });

    it('should return empty array for non-existent job', async () => {
      const metrics = await analyticsService.getStreamingMetrics('non-existent');
      
      expect(metrics).toHaveLength(0);
    });
  });

  describe('getTopStreams', () => {
    beforeEach(async () => {
      // Create metrics with different request counts
      await analyticsService.recordRequest('job-1', '720p', 100, 1024, '192.168.1.1');
      await analyticsService.recordRequest('job-1', '720p', 100, 1024, '192.168.1.1');
      await analyticsService.recordRequest('job-1', '720p', 100, 1024, '192.168.1.1'); // 3 requests

      await analyticsService.recordRequest('job-2', '1080p', 100, 1024, '192.168.1.1');
      await analyticsService.recordRequest('job-2', '1080p', 100, 1024, '192.168.1.1'); // 2 requests

      await analyticsService.recordRequest('job-3', '360p', 100, 1024, '192.168.1.1'); // 1 request
    });

    it('should return top streams sorted by request count', async () => {
      const topStreams = await analyticsService.getTopStreams(3);
      
      expect(topStreams).toHaveLength(3);
      expect(topStreams[0].requestCount).toBe(3); // job-1:720p
      expect(topStreams[1].requestCount).toBe(2); // job-2:1080p
      expect(topStreams[2].requestCount).toBe(1); // job-3:360p
    });

    it('should limit results to specified count', async () => {
      const topStreams = await analyticsService.getTopStreams(2);
      
      expect(topStreams).toHaveLength(2);
    });
  });

  describe('getBandwidthUsage', () => {
    it('should calculate bandwidth usage within time window', async () => {
      // Record some requests
      await analyticsService.recordRequest('job-1', '720p', 100, 1024, '192.168.1.1');
      await analyticsService.recordRequest('job-2', '1080p', 100, 2048, '192.168.1.2');

      const bandwidthUsage = await analyticsService.getBandwidthUsage(3600);
      
      expect(bandwidthUsage).toBe(3072); // 1024 + 2048
    });
  });

  describe('getErrorRate', () => {
    it('should calculate error rate correctly', async () => {
      await analyticsService.recordRequest('job-1', '720p', 100, 1024, '192.168.1.1', false);
      await analyticsService.recordRequest('job-1', '720p', 100, 1024, '192.168.1.1', true);
      await analyticsService.recordRequest('job-1', '720p', 100, 1024, '192.168.1.1', false);
      await analyticsService.recordRequest('job-1', '720p', 100, 1024, '192.168.1.1', true);

      const errorRate = await analyticsService.getErrorRate();
      
      expect(errorRate).toBe(0.5); // 2 errors out of 4 requests
    });

    it('should return 0 when no requests recorded', async () => {
      const errorRate = await analyticsService.getErrorRate();
      
      expect(errorRate).toBe(0);
    });
  });

  describe('cleanupOldMetrics', () => {
    it('should remove old metrics', async () => {
      mockCacheService.del.mockResolvedValue();

      // Record a metric
      await analyticsService.recordRequest('job-1', '720p', 100, 1024, '192.168.1.1');

      // Clean up with very short max age (should remove the metric)
      await analyticsService.cleanupOldMetrics(0);

      const metrics = await analyticsService.getStreamingMetrics('job-1');
      expect(metrics).toHaveLength(0);
    });
  });

  describe('generateReport', () => {
    beforeEach(async () => {
      await analyticsService.recordRequest('job-1', '720p', 100, 1024, '192.168.1.1');
      await analyticsService.recordRequest('job-2', '1080p', 200, 2048, '192.168.1.2', true);
    });

    it('should generate comprehensive analytics report', async () => {
      const report = await analyticsService.generateReport();
      
      expect(report).toHaveProperty('performance');
      expect(report).toHaveProperty('topStreams');
      expect(report).toHaveProperty('errorRate');
      expect(report).toHaveProperty('bandwidthUsage');
      
      expect(report.performance.totalRequests).toBe(2);
      expect(report.performance.totalErrors).toBe(1);
      expect(report.topStreams).toHaveLength(2);
      expect(report.errorRate).toBe(0.5);
      expect(report.bandwidthUsage).toBe(3072);
    });
  });
});
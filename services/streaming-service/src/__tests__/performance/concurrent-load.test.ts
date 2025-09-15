import request from 'supertest';
import app from '../../index';
import { hlsService } from '../../services/hls.service';
import { analyticsService } from '../../services/analytics.service';

// Mock the services
jest.mock('../../services/hls.service');
jest.mock('../../services/analytics.service');

const mockHlsService = hlsService as jest.Mocked<typeof hlsService>;
const mockAnalyticsService = analyticsService as jest.Mocked<typeof analyticsService>;

describe('Concurrent Streaming Load Tests', () => {
  const testJobId = 'load-test-job';
  const testQuality = '720p';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Concurrent Master Playlist Requests', () => {
    it('should handle 50 concurrent master playlist requests', async () => {
      const mockPlaylist = '#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1280x720\n/api/v1/stream/load-test-job/720p/playlist.m3u8\n';
      
      mockHlsService.getMasterPlaylist.mockResolvedValue(mockPlaylist);

      const concurrentRequests = 50;
      const requests = Array(concurrentRequests).fill(null).map(() =>
        request(app)
          .get(`/api/v1/stream/${testJobId}/master.m3u8`)
          .expect(200)
      );

      const startTime = Date.now();
      const responses = await Promise.all(requests);
      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // Verify all requests succeeded
      expect(responses).toHaveLength(concurrentRequests);
      responses.forEach(response => {
        expect(response.text).toBe(mockPlaylist);
        expect(response.headers['content-type']).toBe('application/vnd.apple.mpegurl; charset=utf-8');
      });

      // Performance assertions
      expect(totalTime).toBeLessThan(5000); // Should complete within 5 seconds
      const avgResponseTime = totalTime / concurrentRequests;
      expect(avgResponseTime).toBeLessThan(100); // Average response time should be under 100ms

      console.log(`Concurrent master playlist test: ${concurrentRequests} requests in ${totalTime}ms (avg: ${avgResponseTime.toFixed(2)}ms)`);
    });
  });

  describe('Concurrent Quality Playlist Requests', () => {
    it('should handle 30 concurrent quality playlist requests', async () => {
      const mockPlaylist = '#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:10\n#EXTINF:10.0,\n/api/v1/stream/load-test-job/720p/segment_001.ts\n#EXT-X-ENDLIST\n';
      
      mockHlsService.getQualityPlaylist.mockResolvedValue(mockPlaylist);

      const concurrentRequests = 30;
      const requests = Array(concurrentRequests).fill(null).map(() =>
        request(app)
          .get(`/api/v1/stream/${testJobId}/${testQuality}/playlist.m3u8`)
          .expect(200)
      );

      const startTime = Date.now();
      const responses = await Promise.all(requests);
      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // Verify all requests succeeded
      expect(responses).toHaveLength(concurrentRequests);
      responses.forEach(response => {
        expect(response.text).toBe(mockPlaylist);
      });

      // Performance assertions
      expect(totalTime).toBeLessThan(3000); // Should complete within 3 seconds
      const avgResponseTime = totalTime / concurrentRequests;
      expect(avgResponseTime).toBeLessThan(100);

      console.log(`Concurrent quality playlist test: ${concurrentRequests} requests in ${totalTime}ms (avg: ${avgResponseTime.toFixed(2)}ms)`);
    });
  });

  describe('Mixed Concurrent Requests', () => {
    it('should handle mixed concurrent requests (playlists and segments)', async () => {
      const mockMasterPlaylist = '#EXTM3U\n#EXT-X-VERSION:3\n';
      const mockQualityPlaylist = '#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:10\n';
      const mockSegmentStream = { pipe: jest.fn() };

      mockHlsService.getMasterPlaylist.mockResolvedValue(mockMasterPlaylist);
      mockHlsService.getQualityPlaylist.mockResolvedValue(mockQualityPlaylist);
      mockHlsService.getSegmentStream.mockResolvedValue(mockSegmentStream as any);

      const requests = [
        // 10 master playlist requests
        ...Array(10).fill(null).map(() =>
          request(app).get(`/api/v1/stream/${testJobId}/master.m3u8`)
        ),
        // 15 quality playlist requests
        ...Array(15).fill(null).map(() =>
          request(app).get(`/api/v1/stream/${testJobId}/${testQuality}/playlist.m3u8`)
        ),
        // 20 segment requests
        ...Array(20).fill(null).map((_, i) =>
          request(app).get(`/api/v1/stream/${testJobId}/${testQuality}/segment_${String(i).padStart(3, '0')}.ts`)
        )
      ];

      const startTime = Date.now();
      const responses = await Promise.allSettled(requests);
      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // Count successful responses
      const successfulResponses = responses.filter(r => r.status === 'fulfilled').length;
      const failedResponses = responses.length - successfulResponses;

      // Performance assertions
      expect(successfulResponses).toBeGreaterThan(40); // At least 90% success rate
      expect(failedResponses).toBeLessThan(5); // Less than 10% failure rate
      expect(totalTime).toBeLessThan(10000); // Should complete within 10 seconds

      console.log(`Mixed concurrent test: ${successfulResponses}/${responses.length} successful in ${totalTime}ms`);
    });
  });

  describe('Cache Performance Under Load', () => {
    it('should demonstrate cache effectiveness under load', async () => {
      const mockPlaylist = '#EXTM3U\n#EXT-X-VERSION:3\n';
      mockHlsService.getMasterPlaylist.mockResolvedValue(mockPlaylist);

      // First request (cache miss)
      const firstRequest = await request(app)
        .get(`/api/v1/stream/${testJobId}/master.m3u8`)
        .expect(200);

      expect(firstRequest.headers['x-cache']).toBe('MISS');

      // Subsequent requests should hit cache
      const cachedRequests = Array(20).fill(null).map(() =>
        request(app)
          .get(`/api/v1/stream/${testJobId}/master.m3u8`)
          .expect(200)
      );

      const startTime = Date.now();
      const responses = await Promise.all(cachedRequests);
      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // Verify cache hits
      responses.forEach(response => {
        expect(response.headers['x-cache']).toBe('HIT');
      });

      // Cache should make requests much faster
      const avgCachedResponseTime = totalTime / cachedRequests.length;
      expect(avgCachedResponseTime).toBeLessThan(50); // Should be very fast with cache

      console.log(`Cache performance test: ${cachedRequests.length} cached requests in ${totalTime}ms (avg: ${avgCachedResponseTime.toFixed(2)}ms)`);
    });
  });

  describe('Error Handling Under Load', () => {
    it('should handle errors gracefully under concurrent load', async () => {
      // Mock service to throw errors for some requests
      let callCount = 0;
      mockHlsService.getMasterPlaylist.mockImplementation(() => {
        callCount++;
        if (callCount % 3 === 0) {
          throw new Error('Simulated service error');
        }
        return Promise.resolve('#EXTM3U\n#EXT-X-VERSION:3\n');
      });

      const concurrentRequests = 30;
      const requests = Array(concurrentRequests).fill(null).map(() =>
        request(app).get(`/api/v1/stream/${testJobId}/master.m3u8`)
      );

      const responses = await Promise.allSettled(requests);
      
      const successfulResponses = responses.filter(r => 
        r.status === 'fulfilled' && (r.value as any).status === 200
      ).length;
      
      const errorResponses = responses.filter(r => 
        r.status === 'fulfilled' && (r.value as any).status >= 400
      ).length;

      // Should handle errors gracefully
      expect(successfulResponses).toBeGreaterThan(15); // At least half should succeed
      expect(errorResponses).toBeGreaterThan(5); // Some should fail as expected
      expect(successfulResponses + errorResponses).toBe(concurrentRequests);

      console.log(`Error handling test: ${successfulResponses} successful, ${errorResponses} errors out of ${concurrentRequests} requests`);
    });
  });

  describe('Memory Usage Under Load', () => {
    it('should maintain reasonable memory usage under load', async () => {
      const mockPlaylist = '#EXTM3U\n#EXT-X-VERSION:3\n'.repeat(100); // Larger response
      mockHlsService.getMasterPlaylist.mockResolvedValue(mockPlaylist);

      const initialMemory = process.memoryUsage();

      // Make many requests to test memory usage
      const batchSize = 50;
      const batches = 5;

      for (let batch = 0; batch < batches; batch++) {
        const requests = Array(batchSize).fill(null).map(() =>
          request(app).get(`/api/v1/stream/${testJobId}-${batch}/master.m3u8`)
        );

        await Promise.all(requests);
        
        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }
      }

      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      const memoryIncreasePercent = (memoryIncrease / initialMemory.heapUsed) * 100;

      // Memory increase should be reasonable
      expect(memoryIncreasePercent).toBeLessThan(50); // Less than 50% increase

      console.log(`Memory usage test: ${memoryIncreasePercent.toFixed(2)}% increase (${Math.round(memoryIncrease / 1024 / 1024)}MB)`);
    });
  });
});
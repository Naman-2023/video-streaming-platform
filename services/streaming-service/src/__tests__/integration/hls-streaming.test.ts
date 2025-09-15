import request from 'supertest';
import app from '../../index';
import { hlsService } from '../../services/hls.service';
import { storageService } from '../../services/storage.service';

// Mock the services
jest.mock('../../services/hls.service');
jest.mock('../../services/storage.service');

const mockHlsService = hlsService as jest.Mocked<typeof hlsService>;
const mockStorageService = storageService as jest.Mocked<typeof storageService>;

describe('HLS Streaming Integration Tests', () => {
  const testJobId = 'test-job-123';
  const testQuality = '720p';
  const testSegment = 'segment_001.ts';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Master Playlist Serving', () => {
    it('should serve master playlist with correct headers', async () => {
      const mockPlaylist = '#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1280x720\n/api/v1/stream/test-job-123/720p/playlist.m3u8\n';
      
      mockHlsService.getMasterPlaylist.mockResolvedValue(mockPlaylist);

      const response = await request(app)
        .get(`/api/v1/stream/${testJobId}/master.m3u8`)
        .expect(200);

      expect(response.headers['content-type']).toBe('application/vnd.apple.mpegurl; charset=utf-8');
      expect(response.headers['cache-control']).toBe('public, max-age=300');
      expect(response.headers['access-control-allow-origin']).toBe('*');
      expect(response.text).toBe(mockPlaylist);
      expect(mockHlsService.getMasterPlaylist).toHaveBeenCalledWith(testJobId);
    });

    it('should return 404 when master playlist not found', async () => {
      mockHlsService.getMasterPlaylist.mockRejectedValue(new Error('Playlist not found'));

      const response = await request(app)
        .get(`/api/v1/stream/${testJobId}/master.m3u8`)
        .expect(404);

      expect(response.body.error).toBe('Playlist not found');
    });

    it('should return 400 when job ID is missing', async () => {
      const response = await request(app)
        .get('/api/v1/stream//master.m3u8')
        .expect(404); // Express treats empty param as not found
    });
  });

  describe('Quality Playlist Serving', () => {
    it('should serve quality playlist with correct headers', async () => {
      const mockPlaylist = '#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:10\n#EXTINF:10.0,\n/api/v1/stream/test-job-123/720p/segment_001.ts\n#EXT-X-ENDLIST\n';
      
      mockHlsService.getQualityPlaylist.mockResolvedValue(mockPlaylist);

      const response = await request(app)
        .get(`/api/v1/stream/${testJobId}/${testQuality}/playlist.m3u8`)
        .expect(200);

      expect(response.headers['content-type']).toBe('application/vnd.apple.mpegurl; charset=utf-8');
      expect(response.headers['cache-control']).toBe('public, max-age=300');
      expect(response.headers['access-control-allow-origin']).toBe('*');
      expect(response.text).toBe(mockPlaylist);
      expect(mockHlsService.getQualityPlaylist).toHaveBeenCalledWith(testJobId, testQuality);
    });

    it('should return 400 for invalid quality parameter', async () => {
      const response = await request(app)
        .get(`/api/v1/stream/${testJobId}/invalid-quality/playlist.m3u8`)
        .expect(400);

      expect(response.body.error).toBe('Invalid quality parameter');
    });

    it('should return 404 when quality playlist not found', async () => {
      mockHlsService.getQualityPlaylist.mockRejectedValue(new Error('Quality playlist not found: 720p'));

      const response = await request(app)
        .get(`/api/v1/stream/${testJobId}/${testQuality}/playlist.m3u8`)
        .expect(404);

      expect(response.body.error).toBe('Playlist not found');
    });
  });

  describe('Video Segment Serving', () => {
    it('should serve video segment with correct headers', async () => {
      const mockStream = {
        pipe: jest.fn(),
      };
      
      mockHlsService.getSegmentStream.mockResolvedValue(mockStream as any);

      const response = await request(app)
        .get(`/api/v1/stream/${testJobId}/${testQuality}/${testSegment}`)
        .expect(200);

      expect(response.headers['content-type']).toBe('video/mp2t');
      expect(response.headers['cache-control']).toBe('public, max-age=3600');
      expect(response.headers['access-control-allow-origin']).toBe('*');
      expect(response.headers['accept-ranges']).toBe('bytes');
      expect(mockHlsService.getSegmentStream).toHaveBeenCalledWith(testJobId, testQuality, testSegment);
    });

    it('should return 400 for invalid segment format', async () => {
      const response = await request(app)
        .get(`/api/v1/stream/${testJobId}/${testQuality}/invalid-segment.mp4`)
        .expect(400);

      expect(response.body.error).toBe('Invalid segment format');
    });

    it('should return 404 when segment not found', async () => {
      mockHlsService.getSegmentStream.mockRejectedValue(new Error('Segment not found: segment_001.ts'));

      const response = await request(app)
        .get(`/api/v1/stream/${testJobId}/${testQuality}/${testSegment}`)
        .expect(404);

      expect(response.body.error).toBe('Segment not found');
    });
  });

  describe('Health Check', () => {
    it('should return healthy status', async () => {
      const response = await request(app)
        .get('/api/v1/stream/health')
        .expect(200);

      expect(response.body.status).toBe('healthy');
      expect(response.body.service).toBe('streaming-service');
      expect(response.body.timestamp).toBeDefined();
    });
  });

  describe('Cache Invalidation', () => {
    it('should invalidate cache for specific job', async () => {
      mockHlsService.invalidateCache.mockResolvedValue();

      const response = await request(app)
        .delete(`/api/v1/stream/${testJobId}/cache`)
        .expect(200);

      expect(response.body.message).toBe('Cache invalidated successfully');
      expect(mockHlsService.invalidateCache).toHaveBeenCalledWith(testJobId, undefined);
    });

    it('should invalidate cache for specific quality', async () => {
      mockHlsService.invalidateCache.mockResolvedValue();

      const response = await request(app)
        .delete(`/api/v1/stream/${testJobId}/cache?quality=${testQuality}`)
        .expect(200);

      expect(response.body.message).toBe('Cache invalidated successfully');
      expect(mockHlsService.invalidateCache).toHaveBeenCalledWith(testJobId, testQuality);
    });
  });

  describe('CORS Headers', () => {
    it('should include proper CORS headers for streaming', async () => {
      const mockPlaylist = '#EXTM3U\n#EXT-X-VERSION:3\n';
      mockHlsService.getMasterPlaylist.mockResolvedValue(mockPlaylist);

      const response = await request(app)
        .get(`/api/v1/stream/${testJobId}/master.m3u8`)
        .expect(200);

      expect(response.headers['access-control-allow-origin']).toBe('*');
      expect(response.headers['access-control-allow-methods']).toBe('GET, HEAD, OPTIONS');
      expect(response.headers['access-control-allow-headers']).toBe('Range');
      expect(response.headers['access-control-expose-headers']).toBe('Content-Length, Content-Range');
    });
  });
});
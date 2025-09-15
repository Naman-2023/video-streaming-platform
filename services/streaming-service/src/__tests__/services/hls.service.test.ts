import { HLSService } from '../../services/hls.service';
import { storageService } from '../../services/storage.service';
import { cacheService } from '../../services/cache.service';

// Mock the dependencies
jest.mock('../../services/storage.service');
jest.mock('../../services/cache.service');

const mockStorageService = storageService as jest.Mocked<typeof storageService>;
const mockCacheService = cacheService as jest.Mocked<typeof cacheService>;

describe('HLSService', () => {
  let hlsService: HLSService;
  const testJobId = 'test-job-123';

  beforeEach(() => {
    hlsService = new HLSService();
    jest.clearAllMocks();
  });

  describe('getMasterPlaylist', () => {
    it('should return cached master playlist if available', async () => {
      const cachedPlaylist = '#EXTM3U\n#EXT-X-VERSION:3\n';
      mockCacheService.get.mockResolvedValue(cachedPlaylist);

      const result = await hlsService.getMasterPlaylist(testJobId);

      expect(result).toBe(cachedPlaylist);
      expect(mockCacheService.get).toHaveBeenCalledWith(`master_playlist:${testJobId}`);
      expect(mockStorageService.objectExists).not.toHaveBeenCalled();
    });

    it('should generate and cache master playlist when not cached', async () => {
      mockCacheService.get.mockResolvedValue(null);
      mockStorageService.objectExists
        .mockResolvedValueOnce(true)  // 360p exists
        .mockResolvedValueOnce(true)  // 720p exists
        .mockResolvedValueOnce(false); // 1080p doesn't exist

      const result = await hlsService.getMasterPlaylist(testJobId);

      expect(result).toContain('#EXTM3U');
      expect(result).toContain('#EXT-X-VERSION:3');
      expect(result).toContain('BANDWIDTH=1000000,RESOLUTION=640x360');
      expect(result).toContain('BANDWIDTH=3000000,RESOLUTION=1280x720');
      expect(result).not.toContain('1920x1080');
      
      expect(mockCacheService.set).toHaveBeenCalledWith(
        `master_playlist:${testJobId}`,
        result,
        300
      );
    });

    it('should handle case when no qualities are available', async () => {
      mockCacheService.get.mockResolvedValue(null);
      mockStorageService.objectExists.mockResolvedValue(false);

      const result = await hlsService.getMasterPlaylist(testJobId);

      expect(result).toBe('#EXTM3U\n#EXT-X-VERSION:3\n\n');
    });
  });

  describe('getQualityPlaylist', () => {
    const testQuality = '720p';

    it('should return cached quality playlist if available', async () => {
      const cachedPlaylist = '#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:10\n';
      mockCacheService.get.mockResolvedValue(cachedPlaylist);

      const result = await hlsService.getQualityPlaylist(testJobId, testQuality);

      expect(result).toBe(cachedPlaylist);
      expect(mockCacheService.get).toHaveBeenCalledWith(`quality_playlist:${testJobId}:${testQuality}`);
    });

    it('should fetch, update, and cache quality playlist when not cached', async () => {
      const originalPlaylist = '#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:10\n#EXTINF:10.0,\nsegment_001.ts\n#EXT-X-ENDLIST\n';
      const playlistBuffer = Buffer.from(originalPlaylist);

      mockCacheService.get.mockResolvedValue(null);
      mockStorageService.objectExists.mockResolvedValue(true);
      mockStorageService.getObject.mockResolvedValue(playlistBuffer);

      const result = await hlsService.getQualityPlaylist(testJobId, testQuality);

      expect(result).toContain('#EXTM3U');
      expect(result).toContain(`/api/v1/stream/${testJobId}/${testQuality}/segment_001.ts`);
      expect(mockCacheService.set).toHaveBeenCalledWith(
        `quality_playlist:${testJobId}:${testQuality}`,
        result,
        300
      );
    });

    it('should throw error when quality playlist not found', async () => {
      mockCacheService.get.mockResolvedValue(null);
      mockStorageService.objectExists.mockResolvedValue(false);

      await expect(hlsService.getQualityPlaylist(testJobId, testQuality))
        .rejects.toThrow('Quality playlist not found: 720p');
    });
  });

  describe('getSegment', () => {
    const testQuality = '720p';
    const testSegment = 'segment_001.ts';

    it('should return segment buffer when segment exists', async () => {
      const segmentBuffer = Buffer.from('fake video data');
      mockStorageService.objectExists.mockResolvedValue(true);
      mockStorageService.getObject.mockResolvedValue(segmentBuffer);

      const result = await hlsService.getSegment(testJobId, testQuality, testSegment);

      expect(result).toBe(segmentBuffer);
      expect(mockStorageService.objectExists).toHaveBeenCalledWith(
        `jobs/${testJobId}/hls/${testQuality}/${testSegment}`
      );
    });

    it('should throw error when segment not found', async () => {
      mockStorageService.objectExists.mockResolvedValue(false);

      await expect(hlsService.getSegment(testJobId, testQuality, testSegment))
        .rejects.toThrow('Segment not found: segment_001.ts');
    });
  });

  describe('getSegmentStream', () => {
    const testQuality = '720p';
    const testSegment = 'segment_001.ts';

    it('should return segment stream when segment exists', async () => {
      const mockStream = { pipe: jest.fn() };
      mockStorageService.objectExists.mockResolvedValue(true);
      mockStorageService.getObjectStream.mockResolvedValue(mockStream as any);

      const result = await hlsService.getSegmentStream(testJobId, testQuality, testSegment);

      expect(result).toBe(mockStream);
      expect(mockStorageService.getObjectStream).toHaveBeenCalledWith(
        `jobs/${testJobId}/hls/${testQuality}/${testSegment}`
      );
    });

    it('should throw error when segment not found', async () => {
      mockStorageService.objectExists.mockResolvedValue(false);

      await expect(hlsService.getSegmentStream(testJobId, testQuality, testSegment))
        .rejects.toThrow('Segment not found: segment_001.ts');
    });
  });

  describe('invalidateCache', () => {
    it('should invalidate cache for specific quality', async () => {
      const testQuality = '720p';
      mockCacheService.del.mockResolvedValue();

      await hlsService.invalidateCache(testJobId, testQuality);

      expect(mockCacheService.del).toHaveBeenCalledWith(`quality_playlist:${testJobId}:${testQuality}`);
    });

    it('should invalidate all caches for job when no quality specified', async () => {
      mockCacheService.del.mockResolvedValue();

      await hlsService.invalidateCache(testJobId);

      expect(mockCacheService.del).toHaveBeenCalledWith(`master_playlist:${testJobId}`);
      expect(mockCacheService.del).toHaveBeenCalledWith(`quality_playlist:${testJobId}:360p`);
      expect(mockCacheService.del).toHaveBeenCalledWith(`quality_playlist:${testJobId}:720p`);
      expect(mockCacheService.del).toHaveBeenCalledWith(`quality_playlist:${testJobId}:1080p`);
    });
  });
});
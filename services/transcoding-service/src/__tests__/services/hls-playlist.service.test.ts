import { HLSPlaylistService, SegmentInfo } from '../../services/hls-playlist.service';
import { QualityProfile } from '@video-platform/types';
import * as fs from 'fs-extra';

// Mock fs-extra
jest.mock('fs-extra');

describe('HLSPlaylistService', () => {
  let hlsService: HLSPlaylistService;
  const mockFs = fs as jest.Mocked<typeof fs>;

  beforeEach(() => {
    hlsService = new HLSPlaylistService();
    jest.clearAllMocks();
  });

  describe('generateMasterPlaylist', () => {
    const testQualities: QualityProfile[] = [
      { name: '1080p', resolution: '1920x1080', bitrate: 5000, status: 'completed' },
      { name: '360p', resolution: '640x360', bitrate: 800, status: 'completed' },
      { name: '720p', resolution: '1280x720', bitrate: 2500, status: 'completed' }
    ];

    beforeEach(() => {
      mockFs.writeFile.mockResolvedValue();
    });

    it('should generate master playlist with sorted qualities', async () => {
      const outputPath = '/test/output';
      
      await hlsService.generateMasterPlaylist(outputPath, testQualities);

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        '/test/output/master.m3u8',
        expect.stringContaining('#EXTM3U')
      );

      const writtenContent = (mockFs.writeFile as jest.Mock).mock.calls[0][1];
      
      // Should be sorted by bitrate (360p first, then 720p, then 1080p)
      const lines = writtenContent.split('\n');
      const playlistUrls = lines.filter((line: string) => line.endsWith('/playlist.m3u8'));
      
      expect(playlistUrls[0]).toBe('360p/playlist.m3u8');
      expect(playlistUrls[1]).toBe('720p/playlist.m3u8');
      expect(playlistUrls[2]).toBe('1080p/playlist.m3u8');
    });

    it('should include comprehensive stream metadata', async () => {
      const outputPath = '/test/output';
      
      await hlsService.generateMasterPlaylist(outputPath, testQualities);

      const writtenContent = (mockFs.writeFile as jest.Mock).mock.calls[0][1];
      
      // Should include bandwidth
      expect(writtenContent).toContain('BANDWIDTH=800000');
      expect(writtenContent).toContain('BANDWIDTH=2500000');
      expect(writtenContent).toContain('BANDWIDTH=5000000');

      // Should include average bandwidth
      expect(writtenContent).toContain('AVERAGE-BANDWIDTH=680000');
      expect(writtenContent).toContain('AVERAGE-BANDWIDTH=2125000');
      expect(writtenContent).toContain('AVERAGE-BANDWIDTH=4250000');

      // Should include resolution
      expect(writtenContent).toContain('RESOLUTION=640x360');
      expect(writtenContent).toContain('RESOLUTION=1280x720');
      expect(writtenContent).toContain('RESOLUTION=1920x1080');

      // Should include codecs
      expect(writtenContent).toContain('CODECS="avc1.640028,mp4a.40.2"');

      // Should include frame rate
      expect(writtenContent).toContain('FRAME-RATE=30.000');

      // Should include independent segments flag
      expect(writtenContent).toContain('#EXT-X-INDEPENDENT-SEGMENTS');
    });

    it('should filter out incomplete qualities', async () => {
      const qualitiesWithIncomplete: QualityProfile[] = [
        { name: '360p', resolution: '640x360', bitrate: 800, status: 'completed' },
        { name: '720p', resolution: '1280x720', bitrate: 2500, status: 'failed' },
        { name: '1080p', resolution: '1920x1080', bitrate: 5000, status: 'processing' }
      ];

      const outputPath = '/test/output';
      
      await hlsService.generateMasterPlaylist(outputPath, qualitiesWithIncomplete);

      const writtenContent = (mockFs.writeFile as jest.Mock).mock.calls[0][1];
      
      // Should only include completed quality
      expect(writtenContent).toContain('360p/playlist.m3u8');
      expect(writtenContent).not.toContain('720p/playlist.m3u8');
      expect(writtenContent).not.toContain('1080p/playlist.m3u8');
    });

    it('should throw error when no completed qualities available', async () => {
      const incompleteQualities: QualityProfile[] = [
        { name: '720p', resolution: '1280x720', bitrate: 2500, status: 'failed' }
      ];

      await expect(
        hlsService.generateMasterPlaylist('/test/output', incompleteQualities)
      ).rejects.toThrow('No completed qualities available for master playlist');
    });
  });

  describe('generateQualityPlaylist', () => {
    const testSegments: SegmentInfo[] = [
      { filename: 'segment_001.ts', duration: 10.0, size: 1024000 },
      { filename: 'segment_002.ts', duration: 10.0, size: 1024000 },
      { filename: 'segment_003.ts', duration: 8.5, size: 870400 }
    ];

    beforeEach(() => {
      mockFs.writeFile.mockResolvedValue();
    });

    it('should generate quality playlist with correct format', async () => {
      const qualityPath = '/test/output/720p';
      
      await hlsService.generateQualityPlaylist(qualityPath, testSegments);

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        '/test/output/720p/playlist.m3u8',
        expect.stringContaining('#EXTM3U')
      );

      const writtenContent = (mockFs.writeFile as jest.Mock).mock.calls[0][1];
      
      // Should include version
      expect(writtenContent).toContain('#EXT-X-VERSION:6');
      
      // Should include target duration (max segment duration rounded up)
      expect(writtenContent).toContain('#EXT-X-TARGETDURATION:11');
      
      // Should include playlist type
      expect(writtenContent).toContain('#EXT-X-PLAYLIST-TYPE:VOD');
      
      // Should include end list for VOD
      expect(writtenContent).toContain('#EXT-X-ENDLIST');
      
      // Should include all segments
      expect(writtenContent).toContain('segment_001.ts');
      expect(writtenContent).toContain('segment_002.ts');
      expect(writtenContent).toContain('segment_003.ts');
      
      // Should include segment durations
      expect(writtenContent).toContain('#EXTINF:10.000000,');
      expect(writtenContent).toContain('#EXTINF:8.500000,');
    });

    it('should include byte range information when segment size is provided', async () => {
      const qualityPath = '/test/output/720p';
      
      await hlsService.generateQualityPlaylist(qualityPath, testSegments);

      const writtenContent = (mockFs.writeFile as jest.Mock).mock.calls[0][1];
      
      // Should include byte range for segments with size
      expect(writtenContent).toContain('#EXT-X-BYTERANGE:1024000');
      expect(writtenContent).toContain('#EXT-X-BYTERANGE:870400');
    });

    it('should handle discontinuity markers', async () => {
      const segmentsWithDiscontinuity: SegmentInfo[] = [
        { filename: 'segment_001.ts', duration: 10.0 },
        { filename: 'segment_002.ts', duration: 10.0, discontinuity: true },
        { filename: 'segment_003.ts', duration: 10.0 }
      ];

      const qualityPath = '/test/output/720p';
      
      await hlsService.generateQualityPlaylist(qualityPath, segmentsWithDiscontinuity);

      const writtenContent = (mockFs.writeFile as jest.Mock).mock.calls[0][1];
      
      // Should include discontinuity tag before second segment
      expect(writtenContent).toContain('#EXT-X-DISCONTINUITY');
    });

    it('should throw error when no segments provided', async () => {
      await expect(
        hlsService.generateQualityPlaylist('/test/output/720p', [])
      ).rejects.toThrow('No segments provided for quality playlist');
    });

    it('should support live playlist type', async () => {
      const qualityPath = '/test/output/720p';
      
      await hlsService.generateQualityPlaylist(qualityPath, testSegments, {
        playlistType: 'live',
        mediaSequence: 100
      });

      const writtenContent = (mockFs.writeFile as jest.Mock).mock.calls[0][1];
      
      // Should include media sequence for live
      expect(writtenContent).toContain('#EXT-X-MEDIA-SEQUENCE:100');
      
      // Should include live playlist type
      expect(writtenContent).toContain('#EXT-X-PLAYLIST-TYPE:LIVE');
      
      // Should not include end list for live
      expect(writtenContent).not.toContain('#EXT-X-ENDLIST');
    });
  });

  describe('generatePlaylistsFromSegments', () => {
    const testQualities: QualityProfile[] = [
      { name: '360p', resolution: '640x360', bitrate: 800, status: 'pending' },
      { name: '720p', resolution: '1280x720', bitrate: 2500, status: 'pending' }
    ];

    beforeEach(() => {
      mockFs.pathExists.mockResolvedValue(true);
      mockFs.readdir.mockResolvedValue(['segment_001.ts', 'segment_002.ts', 'segment_003.ts'] as any);
      mockFs.stat.mockResolvedValue({ size: 1024000 } as any);
      mockFs.writeFile.mockResolvedValue();
    });

    it('should generate playlists for all qualities', async () => {
      const outputPath = '/test/output';
      
      const result = await hlsService.generatePlaylistsFromSegments(outputPath, testQualities);

      // Should generate quality playlists
      expect(result.qualityPlaylists['360p']).toBe('/test/output/360p/playlist.m3u8');
      expect(result.qualityPlaylists['720p']).toBe('/test/output/720p/playlist.m3u8');

      // Should generate master playlist
      expect(result.masterPlaylist).toBe('/test/output/master.m3u8');

      // Should update quality profiles
      expect(testQualities[0].segmentCount).toBe(3);
      expect(testQualities[0].playlistUrl).toBe('360p/playlist.m3u8');
      expect(testQualities[1].segmentCount).toBe(3);
      expect(testQualities[1].playlistUrl).toBe('720p/playlist.m3u8');
    });

    it('should skip qualities with missing directories', async () => {
      mockFs.pathExists.mockImplementation((path: string) => {
        return Promise.resolve(!path.includes('720p'));
      });

      const outputPath = '/test/output';
      
      const result = await hlsService.generatePlaylistsFromSegments(outputPath, testQualities);

      // Should only include 360p
      expect(result.qualityPlaylists['360p']).toBeDefined();
      expect(result.qualityPlaylists['720p']).toBeUndefined();
    });

    it('should skip qualities with no segments', async () => {
      mockFs.readdir.mockImplementation((path: string) => {
        if (path.includes('720p')) {
          return Promise.resolve([]);
        }
        return Promise.resolve(['segment_001.ts'] as any);
      });

      const outputPath = '/test/output';
      
      const result = await hlsService.generatePlaylistsFromSegments(outputPath, testQualities);

      // Should only include 360p
      expect(result.qualityPlaylists['360p']).toBeDefined();
      expect(result.qualityPlaylists['720p']).toBeUndefined();
    });
  });

  describe('validatePlaylist', () => {
    it('should validate correct VOD playlist', async () => {
      const validPlaylistContent = `#EXTM3U
#EXT-X-VERSION:6
#EXT-X-TARGETDURATION:11
#EXT-X-PLAYLIST-TYPE:VOD
#EXTINF:10.000000,
segment_001.ts
#EXTINF:10.000000,
segment_002.ts
#EXT-X-ENDLIST`;

      mockFs.pathExists.mockResolvedValue(true);
      mockFs.readFile.mockResolvedValue(validPlaylistContent);

      const result = await hlsService.validatePlaylist('/test/playlist.m3u8');

      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
      expect(result.metadata.version).toBe(6);
      expect(result.metadata.targetDuration).toBe(11);
      expect(result.metadata.segmentCount).toBe(2);
      expect(result.metadata.totalDuration).toBe(20);
      expect(result.metadata.playlistType).toBe('VOD');
    });

    it('should detect missing file', async () => {
      mockFs.pathExists.mockResolvedValue(false);

      const result = await hlsService.validatePlaylist('/test/playlist.m3u8');

      expect(result.valid).toBe(false);
      expect(result.issues).toContain('Playlist file does not exist');
    });

    it('should detect invalid header', async () => {
      const invalidPlaylistContent = `#INVALID
#EXT-X-VERSION:6`;

      mockFs.pathExists.mockResolvedValue(true);
      mockFs.readFile.mockResolvedValue(invalidPlaylistContent);

      const result = await hlsService.validatePlaylist('/test/playlist.m3u8');

      expect(result.valid).toBe(false);
      expect(result.issues).toContain('Missing or invalid #EXTM3U header');
    });

    it('should detect missing version', async () => {
      const playlistContent = `#EXTM3U
#EXT-X-TARGETDURATION:11`;

      mockFs.pathExists.mockResolvedValue(true);
      mockFs.readFile.mockResolvedValue(playlistContent);

      const result = await hlsService.validatePlaylist('/test/playlist.m3u8');

      expect(result.valid).toBe(false);
      expect(result.issues).toContain('Invalid or missing version (should be >= 3)');
    });

    it('should detect missing endlist for VOD', async () => {
      const playlistContent = `#EXTM3U
#EXT-X-VERSION:6
#EXT-X-TARGETDURATION:11
#EXT-X-PLAYLIST-TYPE:VOD
#EXTINF:10.000000,
segment_001.ts`;

      mockFs.pathExists.mockResolvedValue(true);
      mockFs.readFile.mockResolvedValue(playlistContent);

      const result = await hlsService.validatePlaylist('/test/playlist.m3u8');

      expect(result.valid).toBe(false);
      expect(result.issues).toContain('VOD playlist missing #EXT-X-ENDLIST tag');
    });
  });

  describe('getPlaylistInfo', () => {
    it('should identify master playlist', async () => {
      const masterPlaylistContent = `#EXTM3U
#EXT-X-VERSION:6
#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360
360p/playlist.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2500000,RESOLUTION=1280x720
720p/playlist.m3u8`;

      mockFs.readFile.mockResolvedValue(masterPlaylistContent);

      const info = await hlsService.getPlaylistInfo('/test/master.m3u8');

      expect(info.type).toBe('master');
      expect(info.qualities).toEqual(['360p', '720p']);
      expect(info.bandwidth).toEqual([800000, 2500000]);
    });

    it('should identify media playlist', async () => {
      const mediaPlaylistContent = `#EXTM3U
#EXT-X-VERSION:6
#EXT-X-TARGETDURATION:11
#EXTINF:10.000000,
segment_001.ts
#EXTINF:10.000000,
segment_002.ts
#EXT-X-ENDLIST`;

      mockFs.readFile.mockResolvedValue(mediaPlaylistContent);

      const info = await hlsService.getPlaylistInfo('/test/playlist.m3u8');

      expect(info.type).toBe('media');
      expect(info.segmentCount).toBe(2);
      expect(info.duration).toBe(20);
    });
  });
});
import { FFmpegService } from '../../services/ffmpeg.service';
import { QualityProfile } from '@video-platform/types';
import * as fs from 'fs-extra';
import * as path from 'path';

// Mock fs-extra for integration tests
jest.mock('fs-extra');

describe('Transcoding Output Integration Tests', () => {
  let ffmpegService: FFmpegService;
  const mockFs = fs as jest.Mocked<typeof fs>;
  const testOutputPath = '/test/output';
  const testQualities: QualityProfile[] = [
    { name: '360p', resolution: '640x360', bitrate: 800, status: 'pending' },
    { name: '720p', resolution: '1280x720', bitrate: 2500, status: 'pending' },
    { name: '1080p', resolution: '1920x1080', bitrate: 5000, status: 'pending' }
  ];

  beforeEach(() => {
    ffmpegService = new FFmpegService();
    jest.clearAllMocks();
  });

  describe('transcodeMultiQuality', () => {
    beforeEach(() => {
      // Mock video info
      const mockFfmpeg = require('fluent-ffmpeg');
      mockFfmpeg.ffprobe.mockImplementation((path: string, callback: Function) => {
        callback(null, {
          format: {
            duration: 120,
            format_name: 'mp4'
          },
          streams: [{
            codec_type: 'video',
            width: 1920,
            height: 1080
          }]
        });
      });

      mockFs.statSync.mockReturnValue({ size: 1024000 } as any);
      mockFs.ensureDir.mockResolvedValue();
      mockFs.pathExists.mockResolvedValue(true);
      mockFs.readdir.mockResolvedValue(['segment_001.ts', 'segment_002.ts', 'segment_003.ts'] as any);
      mockFs.writeFile.mockResolvedValue();
    });

    it('should process all qualities for high resolution input', async () => {
      const onProgress = jest.fn();
      
      await ffmpegService.transcodeMultiQuality(
        '/input/video.mp4',
        testOutputPath,
        testQualities,
        onProgress
      );

      // Should process all qualities
      expect(mockFs.ensureDir).toHaveBeenCalledTimes(3);
      expect(mockFs.ensureDir).toHaveBeenCalledWith(path.join(testOutputPath, '360p'));
      expect(mockFs.ensureDir).toHaveBeenCalledWith(path.join(testOutputPath, '720p'));
      expect(mockFs.ensureDir).toHaveBeenCalledWith(path.join(testOutputPath, '1080p'));

      // Should generate master playlist
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        path.join(testOutputPath, 'master.m3u8'),
        expect.stringContaining('#EXTM3U')
      );

      // Should call progress callback
      expect(onProgress).toHaveBeenCalled();
    });

    it('should filter out qualities higher than input resolution', async () => {
      // Mock lower resolution input
      const mockFfmpeg = require('fluent-ffmpeg');
      mockFfmpeg.ffprobe.mockImplementation((path: string, callback: Function) => {
        callback(null, {
          format: {
            duration: 120,
            format_name: 'mp4'
          },
          streams: [{
            codec_type: 'video',
            width: 854,  // Lower than 1080p
            height: 480
          }]
        });
      });

      await ffmpegService.transcodeMultiQuality(
        '/input/video.mp4',
        testOutputPath,
        testQualities
      );

      // Should only process 360p (720p and 1080p should be filtered out due to low tolerance)
      expect(mockFs.ensureDir).toHaveBeenCalledWith(path.join(testOutputPath, '360p'));
    });

    it('should handle transcoding errors gracefully', async () => {
      // Mock FFmpeg to fail
      const mockFfmpeg = require('fluent-ffmpeg');
      mockFfmpeg.mockImplementation(() => ({
        outputOptions: jest.fn().mockReturnThis(),
        output: jest.fn().mockReturnThis(),
        inputOptions: jest.fn().mockReturnThis(),
        on: jest.fn().mockImplementation((event, callback) => {
          if (event === 'error') {
            setTimeout(() => callback(new Error('Transcoding failed')), 10);
          }
          return mockFfmpeg();
        }),
        run: jest.fn()
      }));

      await expect(
        ffmpegService.transcodeMultiQuality(
          '/input/video.mp4',
          testOutputPath,
          testQualities
        )
      ).rejects.toThrow('Transcoding failed');
    });

    it('should report progress correctly across multiple qualities', async () => {
      const progressUpdates: Array<{ progress: number; quality: string }> = [];
      
      const onProgress = (progress: number, quality: string) => {
        progressUpdates.push({ progress, quality });
      };

      await ffmpegService.transcodeMultiQuality(
        '/input/video.mp4',
        testOutputPath,
        testQualities,
        onProgress
      );

      // Should have progress updates for each quality
      const qualityUpdates = progressUpdates.reduce((acc, update) => {
        if (!acc[update.quality]) acc[update.quality] = [];
        acc[update.quality].push(update.progress);
        return acc;
      }, {} as Record<string, number[]>);

      expect(Object.keys(qualityUpdates)).toContain('360p');
      expect(Object.keys(qualityUpdates)).toContain('720p');
      expect(Object.keys(qualityUpdates)).toContain('1080p');

      // Progress should increase over time
      for (const quality of Object.keys(qualityUpdates)) {
        const progresses = qualityUpdates[quality];
        expect(progresses.length).toBeGreaterThan(0);
      }
    });
  });

  describe('validateTranscodingOutput', () => {
    it('should validate successful transcoding output', async () => {
      // Mock successful output
      mockFs.pathExists.mockImplementation((path: string) => {
        return Promise.resolve(true);
      });

      mockFs.readFile.mockImplementation((path: string) => {
        if (path.includes('master.m3u8')) {
          return Promise.resolve('#EXTM3U\n#EXT-X-VERSION:6\n');
        }
        return Promise.resolve('#EXTM3U\n#EXT-X-ENDLIST\n');
      });

      mockFs.readdir.mockResolvedValue(['segment_001.ts', 'segment_002.ts'] as any);

      const result = await ffmpegService.validateTranscodingOutput(testOutputPath, testQualities);

      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
      expect(result.segmentCounts['360p']).toBe(2);
      expect(result.segmentCounts['720p']).toBe(2);
      expect(result.segmentCounts['1080p']).toBe(2);
    });

    it('should detect missing master playlist', async () => {
      mockFs.pathExists.mockImplementation((path: string) => {
        return Promise.resolve(!path.includes('master.m3u8'));
      });

      const result = await ffmpegService.validateTranscodingOutput(testOutputPath, testQualities);

      expect(result.valid).toBe(false);
      expect(result.issues).toContain('Master playlist (master.m3u8) not found');
    });

    it('should detect missing quality playlists', async () => {
      mockFs.pathExists.mockImplementation((path: string) => {
        // Master exists, but 720p playlist is missing
        if (path.includes('master.m3u8')) return Promise.resolve(true);
        if (path.includes('720p/playlist.m3u8')) return Promise.resolve(false);
        return Promise.resolve(true);
      });

      mockFs.readFile.mockResolvedValue('#EXTM3U\n#EXT-X-VERSION:6\n');
      mockFs.readdir.mockResolvedValue(['segment_001.ts'] as any);

      const result = await ffmpegService.validateTranscodingOutput(testOutputPath, testQualities);

      expect(result.valid).toBe(false);
      expect(result.issues).toContain('Playlist for 720p not found');
    });

    it('should detect missing segments', async () => {
      mockFs.pathExists.mockResolvedValue(true);
      mockFs.readFile.mockResolvedValue('#EXTM3U\n#EXT-X-ENDLIST\n');
      
      // Mock no segments for 1080p
      mockFs.readdir.mockImplementation((path: string) => {
        if (path.includes('1080p')) {
          return Promise.resolve([]);
        }
        return Promise.resolve(['segment_001.ts'] as any);
      });

      const result = await ffmpegService.validateTranscodingOutput(testOutputPath, testQualities);

      expect(result.valid).toBe(false);
      expect(result.issues).toContain('No segments found for 1080p');
      expect(result.segmentCounts['1080p']).toBe(0);
    });

    it('should detect invalid playlist format', async () => {
      mockFs.pathExists.mockResolvedValue(true);
      mockFs.readdir.mockResolvedValue(['segment_001.ts'] as any);
      
      mockFs.readFile.mockImplementation((path: string) => {
        if (path.includes('360p/playlist.m3u8')) {
          return Promise.resolve('invalid playlist content');
        }
        return Promise.resolve('#EXTM3U\n#EXT-X-ENDLIST\n');
      });

      const result = await ffmpegService.validateTranscodingOutput(testOutputPath, testQualities);

      expect(result.valid).toBe(false);
      expect(result.issues).toContain('Invalid playlist format for 360p');
    });

    it('should handle validation errors gracefully', async () => {
      mockFs.pathExists.mockRejectedValue(new Error('File system error'));

      const result = await ffmpegService.validateTranscodingOutput(testOutputPath, testQualities);

      expect(result.valid).toBe(false);
      expect(result.issues[0]).toContain('Validation failed: File system error');
    });
  });

  describe('generateMasterPlaylist', () => {
    it('should generate master playlist with sorted qualities', async () => {
      mockFs.writeFile.mockResolvedValue();

      // Unsorted qualities
      const unsortedQualities = [
        { name: '1080p', resolution: '1920x1080', bitrate: 5000, status: 'completed' as const },
        { name: '360p', resolution: '640x360', bitrate: 800, status: 'completed' as const },
        { name: '720p', resolution: '1280x720', bitrate: 2500, status: 'completed' as const }
      ];

      await ffmpegService.generateMasterPlaylist(testOutputPath, unsortedQualities);

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        path.join(testOutputPath, 'master.m3u8'),
        expect.stringContaining('#EXTM3U')
      );

      const writtenContent = (mockFs.writeFile as jest.Mock).mock.calls[0][1];
      
      // Should include all qualities
      expect(writtenContent).toContain('360p/playlist.m3u8');
      expect(writtenContent).toContain('720p/playlist.m3u8');
      expect(writtenContent).toContain('1080p/playlist.m3u8');

      // Should include bandwidth information
      expect(writtenContent).toContain('BANDWIDTH=800000');
      expect(writtenContent).toContain('BANDWIDTH=2500000');
      expect(writtenContent).toContain('BANDWIDTH=5000000');

      // Should include resolution information
      expect(writtenContent).toContain('RESOLUTION=640x360');
      expect(writtenContent).toContain('RESOLUTION=1280x720');
      expect(writtenContent).toContain('RESOLUTION=1920x1080');

      // Should include codec information
      expect(writtenContent).toContain('CODECS="avc1.640028,mp4a.40.2"');
    });
  });
});
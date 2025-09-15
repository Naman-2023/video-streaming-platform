import { FFmpegService } from '../../services/ffmpeg.service';
import { QualityProfile } from '@video-platform/types';
import * as fs from 'fs-extra';

// Mock fs-extra
jest.mock('fs-extra');

describe('FFmpegService', () => {
  let ffmpegService: FFmpegService;
  const mockFs = fs as jest.Mocked<typeof fs>;

  beforeEach(() => {
    ffmpegService = new FFmpegService();
    jest.clearAllMocks();
  });

  describe('transcodeQuality', () => {
    const mockQuality: QualityProfile = {
      name: '720p',
      resolution: '1280x720',
      bitrate: 2500,
      status: 'pending'
    };

    beforeEach(() => {
      mockFs.ensureDirSync.mockImplementation(() => {});
    });

    it('should transcode video quality successfully', async () => {
      const inputPath = '/input/video.mp4';
      const outputPath = '/output';
      const onProgress = jest.fn();

      await ffmpegService.transcodeQuality(inputPath, outputPath, mockQuality, onProgress);

      expect(mockFs.ensureDirSync).toHaveBeenCalledWith('/output/720p');
      expect(onProgress).toHaveBeenCalledWith(50);
      expect(onProgress).toHaveBeenCalledWith(100);
    });

    it('should handle transcoding errors', async () => {
      // Mock FFmpeg to throw error
      const mockFfmpeg = require('fluent-ffmpeg');
      mockFfmpeg.mockImplementation(() => ({
        outputOptions: jest.fn().mockReturnThis(),
        output: jest.fn().mockReturnThis(),
        on: jest.fn().mockImplementation((event, callback) => {
          if (event === 'error') {
            setTimeout(() => callback(new Error('FFmpeg error')), 10);
          }
          return mockFfmpeg();
        }),
        run: jest.fn()
      }));

      const inputPath = '/input/video.mp4';
      const outputPath = '/output';

      await expect(
        ffmpegService.transcodeQuality(inputPath, outputPath, mockQuality)
      ).rejects.toThrow('FFmpeg error');
    });

    it('should call progress callback during transcoding', async () => {
      const onProgress = jest.fn();
      
      await ffmpegService.transcodeQuality(
        '/input/video.mp4',
        '/output',
        mockQuality,
        onProgress
      );

      expect(onProgress).toHaveBeenCalledWith(50);
      expect(onProgress).toHaveBeenCalledWith(100);
    });
  });

  describe('generateMasterPlaylist', () => {
    const mockQualities: QualityProfile[] = [
      { name: '360p', resolution: '640x360', bitrate: 800, status: 'completed' },
      { name: '720p', resolution: '1280x720', bitrate: 2500, status: 'completed' },
      { name: '1080p', resolution: '1920x1080', bitrate: 5000, status: 'completed' }
    ];

    beforeEach(() => {
      mockFs.writeFile.mockResolvedValue();
    });

    it('should generate master playlist with all qualities', async () => {
      const outputPath = '/output';

      await ffmpegService.generateMasterPlaylist(outputPath, mockQualities);

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        '/output/master.m3u8',
        expect.stringContaining('#EXTM3U')
      );

      const writtenContent = (mockFs.writeFile as jest.Mock).mock.calls[0][1];
      expect(writtenContent).toContain('360p/playlist.m3u8');
      expect(writtenContent).toContain('720p/playlist.m3u8');
      expect(writtenContent).toContain('1080p/playlist.m3u8');
      expect(writtenContent).toContain('BANDWIDTH=800000');
      expect(writtenContent).toContain('BANDWIDTH=2500000');
      expect(writtenContent).toContain('BANDWIDTH=5000000');
    });

    it('should include resolution information in playlist', async () => {
      const outputPath = '/output';

      await ffmpegService.generateMasterPlaylist(outputPath, mockQualities);

      const writtenContent = (mockFs.writeFile as jest.Mock).mock.calls[0][1];
      expect(writtenContent).toContain('RESOLUTION=640x360');
      expect(writtenContent).toContain('RESOLUTION=1280x720');
      expect(writtenContent).toContain('RESOLUTION=1920x1080');
    });
  });

  describe('getVideoInfo', () => {
    beforeEach(() => {
      mockFs.statSync.mockReturnValue({ size: 1024000 } as any);
    });

    it('should extract video information', async () => {
      const inputPath = '/input/video.mp4';

      const info = await ffmpegService.getVideoInfo(inputPath);

      expect(info).toEqual({
        duration: 120,
        resolution: '1920x1080',
        format: 'mp4',
        size: 1024000
      });
    });

    it('should handle ffprobe errors', async () => {
      const mockFfmpeg = require('fluent-ffmpeg');
      mockFfmpeg.ffprobe.mockImplementation((path: string, callback: Function) => {
        callback(new Error('FFprobe error'));
      });

      await expect(
        ffmpegService.getVideoInfo('/input/video.mp4')
      ).rejects.toThrow('FFprobe error');
    });

    it('should handle missing video stream', async () => {
      const mockFfmpeg = require('fluent-ffmpeg');
      mockFfmpeg.ffprobe.mockImplementation((path: string, callback: Function) => {
        callback(null, {
          format: { duration: 120, format_name: 'mp4' },
          streams: [{ codec_type: 'audio' }] // No video stream
        });
      });

      await expect(
        ffmpegService.getVideoInfo('/input/video.mp4')
      ).rejects.toThrow('No video stream found');
    });
  });

  describe('isAvailable', () => {
    it('should return true when FFmpeg is available', () => {
      const result = ffmpegService.isAvailable();
      expect(result).toBe(true);
    });
  });

  describe('cleanup', () => {
    it('should remove output directory', async () => {
      mockFs.pathExists.mockResolvedValue(true);
      mockFs.remove.mockResolvedValue();

      const outputPath = '/output/test';
      await ffmpegService.cleanup(outputPath);

      expect(mockFs.pathExists).toHaveBeenCalledWith(outputPath);
      expect(mockFs.remove).toHaveBeenCalledWith(outputPath);
    });

    it('should handle cleanup errors gracefully', async () => {
      mockFs.pathExists.mockResolvedValue(true);
      mockFs.remove.mockRejectedValue(new Error('Cleanup failed'));

      const outputPath = '/output/test';
      
      // Should not throw
      await expect(ffmpegService.cleanup(outputPath)).resolves.toBeUndefined();
    });

    it('should skip cleanup if path does not exist', async () => {
      mockFs.pathExists.mockResolvedValue(false);

      const outputPath = '/output/test';
      await ffmpegService.cleanup(outputPath);

      expect(mockFs.pathExists).toHaveBeenCalledWith(outputPath);
      expect(mockFs.remove).not.toHaveBeenCalled();
    });
  });
});
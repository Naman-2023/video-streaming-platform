import { logger } from '../utils/logger';

// Suppress logs during testing
logger.silent = true;

// Set test environment
process.env.NODE_ENV = 'test';
process.env.REDIS_URL = 'redis://localhost:6379/1'; // Use different DB for tests
process.env.DATABASE_URL = 'postgresql://user:password@localhost:5432/video_platform_test';

// Mock FFmpeg for tests
jest.mock('fluent-ffmpeg', () => {
  const mockFfmpeg = jest.fn(() => ({
    outputOptions: jest.fn().mockReturnThis(),
    output: jest.fn().mockReturnThis(),
    on: jest.fn().mockImplementation((event, callback) => {
      if (event === 'end') {
        setTimeout(callback, 100); // Simulate async completion
      }
      if (event === 'progress') {
        setTimeout(() => callback({ percent: 50 }), 50);
        setTimeout(() => callback({ percent: 100 }), 100);
      }
      return mockFfmpeg();
    }),
    run: jest.fn()
  }));

  mockFfmpeg.ffprobe = jest.fn((path, callback) => {
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

  mockFfmpeg.setFfmpegPath = jest.fn();
  mockFfmpeg.setFfprobePath = jest.fn();

  return mockFfmpeg;
});

// Global test timeout
jest.setTimeout(30000);
import { TranscodingWorker } from '../../worker/transcoding-worker';
import { TranscodingQueue } from '../../queue/transcoding-queue';
import { FFmpegService } from '../../services/ffmpeg.service';
import { JobStatusService } from '../../services/job-status.service';

// Mock dependencies
jest.mock('../../queue/transcoding-queue');
jest.mock('../../services/ffmpeg.service');
jest.mock('../../services/job-status.service');

describe('TranscodingWorker', () => {
  let worker: TranscodingWorker;
  let mockQueue: jest.Mocked<TranscodingQueue>;
  let mockFFmpegService: jest.Mocked<FFmpegService>;
  let mockJobStatusService: jest.Mocked<JobStatusService>;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Create mock instances
    mockQueue = {
      getQueue: jest.fn().mockReturnValue({
        process: jest.fn(),
        client: { status: 'ready' }
      }),
      close: jest.fn()
    } as any;

    mockFFmpegService = {
      transcodeQuality: jest.fn().mockResolvedValue(undefined),
      generateMasterPlaylist: jest.fn().mockResolvedValue(undefined),
      isAvailable: jest.fn().mockReturnValue(true)
    } as any;

    mockJobStatusService = {
      updateJobStatus: jest.fn().mockResolvedValue(undefined),
      updateJobProgress: jest.fn().mockResolvedValue(undefined),
      updateQualityStatus: jest.fn().mockResolvedValue(undefined)
    } as any;

    // Mock constructors
    (TranscodingQueue as jest.Mock).mockImplementation(() => mockQueue);
    (FFmpegService as jest.Mock).mockImplementation(() => mockFFmpegService);
    (JobStatusService as jest.Mock).mockImplementation(() => mockJobStatusService);
  });

  afterEach(async () => {
    if (worker) {
      await worker.shutdown();
    }
  });

  describe('constructor', () => {
    it('should initialize worker with required services', () => {
      worker = new TranscodingWorker();

      expect(TranscodingQueue).toHaveBeenCalledTimes(1);
      expect(FFmpegService).toHaveBeenCalledTimes(1);
      expect(JobStatusService).toHaveBeenCalledTimes(1);
      expect(mockQueue.getQueue).toHaveBeenCalled();
    });

    it('should setup worker process with correct concurrency', () => {
      worker = new TranscodingWorker();

      expect(mockQueue.getQueue().process).toHaveBeenCalledWith(
        expect.any(Number),
        expect.any(Function)
      );
    });
  });

  describe('health monitoring', () => {
    beforeEach(() => {
      worker = new TranscodingWorker();
    });

    it('should return healthy status initially', () => {
      const health = worker.getHealthStatus();

      expect(health.healthy).toBe(true);
      expect(health.processedJobs).toBe(0);
      expect(health.failedJobs).toBe(0);
      expect(health.lastHeartbeat).toBeInstanceOf(Date);
      expect(health.uptime).toBeGreaterThan(0);
    });

    it('should update heartbeat periodically', (done) => {
      const initialHealth = worker.getHealthStatus();
      const initialHeartbeat = initialHealth.lastHeartbeat;

      setTimeout(() => {
        const updatedHealth = worker.getHealthStatus();
        expect(updatedHealth.lastHeartbeat.getTime()).toBeGreaterThanOrEqual(
          initialHeartbeat.getTime()
        );
        done();
      }, 100);
    });

    it('should report unhealthy when FFmpeg is not available', () => {
      mockFFmpegService.isAvailable.mockReturnValue(false);

      // Trigger health check
      setTimeout(() => {
        const health = worker.getHealthStatus();
        expect(health.healthy).toBe(false);
      }, 100);
    });

    it('should report unhealthy when queue connection is not ready', () => {
      mockQueue.getQueue.mockReturnValue({
        process: jest.fn(),
        client: { status: 'connecting' }
      } as any);

      worker = new TranscodingWorker();

      setTimeout(() => {
        const health = worker.getHealthStatus();
        expect(health.healthy).toBe(false);
      }, 100);
    });
  });

  describe('job processing', () => {
    let processJobFunction: Function;

    beforeEach(() => {
      worker = new TranscodingWorker();
      
      // Extract the process function passed to Bull queue
      const processCall = (mockQueue.getQueue().process as jest.Mock).mock.calls[0];
      processJobFunction = processCall[1];
    });

    it('should process job successfully', async () => {
      const mockJob = {
        data: {
          jobId: 'test-job-1',
          inputPath: '/input/video.mp4',
          outputPath: '/output',
          qualities: [
            { name: '720p', resolution: '1280x720', bitrate: 2500 },
            { name: '1080p', resolution: '1920x1080', bitrate: 5000 }
          ]
        },
        progress: jest.fn()
      };

      await processJobFunction(mockJob);

      // Verify job status updates
      expect(mockJobStatusService.updateJobStatus).toHaveBeenCalledWith(
        'test-job-1',
        'processing',
        0
      );
      expect(mockJobStatusService.updateJobStatus).toHaveBeenCalledWith(
        'test-job-1',
        'completed',
        100
      );

      // Verify transcoding calls
      expect(mockFFmpegService.transcodeQuality).toHaveBeenCalledTimes(2);
      expect(mockFFmpegService.generateMasterPlaylist).toHaveBeenCalledWith(
        '/output',
        mockJob.data.qualities
      );

      // Verify quality status updates
      expect(mockJobStatusService.updateQualityStatus).toHaveBeenCalledWith(
        'test-job-1',
        '720p',
        'completed'
      );
      expect(mockJobStatusService.updateQualityStatus).toHaveBeenCalledWith(
        'test-job-1',
        '1080p',
        'completed'
      );
    });

    it('should handle transcoding failures', async () => {
      const mockJob = {
        data: {
          jobId: 'test-job-2',
          inputPath: '/input/video.mp4',
          outputPath: '/output',
          qualities: [{ name: '720p', resolution: '1280x720', bitrate: 2500 }]
        },
        progress: jest.fn()
      };

      const error = new Error('Transcoding failed');
      mockFFmpegService.transcodeQuality.mockRejectedValue(error);

      await expect(processJobFunction(mockJob)).rejects.toThrow('Transcoding failed');

      expect(mockJobStatusService.updateJobStatus).toHaveBeenCalledWith(
        'test-job-2',
        'failed',
        0,
        'Transcoding failed'
      );
    });

    it('should update progress during processing', async () => {
      const mockJob = {
        data: {
          jobId: 'test-job-3',
          inputPath: '/input/video.mp4',
          outputPath: '/output',
          qualities: [
            { name: '720p', resolution: '1280x720', bitrate: 2500 },
            { name: '1080p', resolution: '1920x1080', bitrate: 5000 }
          ]
        },
        progress: jest.fn()
      };

      await processJobFunction(mockJob);

      // Verify progress updates
      expect(mockJobStatusService.updateJobProgress).toHaveBeenCalledWith(
        'test-job-3',
        50,
        '720p'
      );
      expect(mockJobStatusService.updateJobProgress).toHaveBeenCalledWith(
        'test-job-3',
        100,
        '1080p'
      );
    });
  });

  describe('shutdown', () => {
    beforeEach(() => {
      worker = new TranscodingWorker();
    });

    it('should shutdown gracefully', async () => {
      await worker.shutdown();

      expect(mockQueue.close).toHaveBeenCalled();
    });

    it('should handle shutdown errors', async () => {
      const error = new Error('Shutdown failed');
      mockQueue.close.mockRejectedValue(error);

      // Should not throw
      await expect(worker.shutdown()).resolves.toBeUndefined();
    });
  });
});
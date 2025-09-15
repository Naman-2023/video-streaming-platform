import Bull from 'bull';
import { TranscodingQueue } from '../../queue/transcoding-queue';
import { TranscodingJob } from '@video-platform/types';

// Mock Bull
jest.mock('bull');

describe('TranscodingQueue', () => {
  let queue: TranscodingQueue;
  let mockBullQueue: jest.Mocked<Bull.Queue>;

  beforeEach(() => {
    // Create mock Bull queue
    mockBullQueue = {
      add: jest.fn(),
      getJob: jest.fn(),
      getJobCounts: jest.fn(),
      getWaiting: jest.fn(),
      getActive: jest.fn(),
      getCompleted: jest.fn(),
      getFailed: jest.fn(),
      pause: jest.fn(),
      resume: jest.fn(),
      clean: jest.fn(),
      close: jest.fn(),
      on: jest.fn()
    } as any;

    (Bull as jest.Mock).mockImplementation(() => mockBullQueue);

    queue = new TranscodingQueue();
  });

  afterEach(async () => {
    await queue.close();
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create Bull queue with correct configuration', () => {
      expect(Bull).toHaveBeenCalledWith(
        'transcoding',
        expect.any(String),
        expect.objectContaining({
          defaultJobOptions: expect.objectContaining({
            removeOnComplete: 10,
            removeOnFail: 50,
            attempts: 3,
            backoff: {
              type: 'exponential',
              delay: 2000
            }
          })
        })
      );
    });

    it('should setup event handlers', () => {
      expect(mockBullQueue.on).toHaveBeenCalledWith('completed', expect.any(Function));
      expect(mockBullQueue.on).toHaveBeenCalledWith('failed', expect.any(Function));
      expect(mockBullQueue.on).toHaveBeenCalledWith('stalled', expect.any(Function));
      expect(mockBullQueue.on).toHaveBeenCalledWith('progress', expect.any(Function));
    });
  });

  describe('addJob', () => {
    it('should add job to queue with default priority', async () => {
      const jobData: TranscodingJob = {
        jobId: 'test-job-1',
        inputPath: '/input/video.mp4',
        outputPath: '/output',
        qualities: []
      };

      const mockJob = { id: 'bull-job-1' };
      mockBullQueue.add.mockResolvedValue(mockJob as any);

      const result = await queue.addJob(jobData);

      expect(mockBullQueue.add).toHaveBeenCalledWith(jobData, {
        priority: 0,
        jobId: 'test-job-1'
      });
      expect(result).toBe(mockJob);
    });

    it('should add job to queue with custom priority', async () => {
      const jobData: TranscodingJob = {
        jobId: 'test-job-2',
        inputPath: '/input/video.mp4',
        outputPath: '/output',
        qualities: []
      };

      const mockJob = { id: 'bull-job-2' };
      mockBullQueue.add.mockResolvedValue(mockJob as any);

      const result = await queue.addJob(jobData, 5);

      expect(mockBullQueue.add).toHaveBeenCalledWith(jobData, {
        priority: 5,
        jobId: 'test-job-2'
      });
      expect(result).toBe(mockJob);
    });
  });

  describe('getJob', () => {
    it('should retrieve job by ID', async () => {
      const mockJob = { id: 'bull-job-1', data: { jobId: 'test-job-1' } };
      mockBullQueue.getJob.mockResolvedValue(mockJob as any);

      const result = await queue.getJob('bull-job-1');

      expect(mockBullQueue.getJob).toHaveBeenCalledWith('bull-job-1');
      expect(result).toBe(mockJob);
    });

    it('should return null for non-existent job', async () => {
      mockBullQueue.getJob.mockResolvedValue(null);

      const result = await queue.getJob('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('queue statistics', () => {
    it('should get job counts', async () => {
      const mockCounts = { waiting: 5, active: 2, completed: 10, failed: 1 };
      mockBullQueue.getJobCounts.mockResolvedValue(mockCounts as any);

      const result = await queue.getJobCounts();

      expect(mockBullQueue.getJobCounts).toHaveBeenCalled();
      expect(result).toBe(mockCounts);
    });

    it('should get waiting jobs', async () => {
      const mockJobs = [{ id: '1' }, { id: '2' }];
      mockBullQueue.getWaiting.mockResolvedValue(mockJobs as any);

      const result = await queue.getWaiting();

      expect(mockBullQueue.getWaiting).toHaveBeenCalled();
      expect(result).toBe(mockJobs);
    });

    it('should get active jobs', async () => {
      const mockJobs = [{ id: '1' }, { id: '2' }];
      mockBullQueue.getActive.mockResolvedValue(mockJobs as any);

      const result = await queue.getActive();

      expect(mockBullQueue.getActive).toHaveBeenCalled();
      expect(result).toBe(mockJobs);
    });
  });

  describe('queue control', () => {
    it('should pause queue', async () => {
      mockBullQueue.pause.mockResolvedValue();

      await queue.pauseQueue();

      expect(mockBullQueue.pause).toHaveBeenCalled();
    });

    it('should resume queue', async () => {
      mockBullQueue.resume.mockResolvedValue();

      await queue.resumeQueue();

      expect(mockBullQueue.resume).toHaveBeenCalled();
    });

    it('should clean queue', async () => {
      mockBullQueue.clean.mockResolvedValue([]);

      await queue.cleanQueue();

      expect(mockBullQueue.clean).toHaveBeenCalledTimes(2);
      expect(mockBullQueue.clean).toHaveBeenCalledWith(24 * 60 * 60 * 1000, 'completed');
      expect(mockBullQueue.clean).toHaveBeenCalledWith(7 * 24 * 60 * 60 * 1000, 'failed');
    });

    it('should close queue', async () => {
      mockBullQueue.close.mockResolvedValue();

      await queue.close();

      expect(mockBullQueue.close).toHaveBeenCalled();
    });
  });

  describe('event handling', () => {
    it('should handle completed event', () => {
      const completedHandler = (mockBullQueue.on as jest.Mock).mock.calls
        .find(call => call[0] === 'completed')[1];

      const mockJob = { id: 'job-1', data: { jobId: 'test-job-1' } };
      
      // Should not throw
      expect(() => completedHandler(mockJob)).not.toThrow();
    });

    it('should handle failed event', () => {
      const failedHandler = (mockBullQueue.on as jest.Mock).mock.calls
        .find(call => call[0] === 'failed')[1];

      const mockJob = { id: 'job-1', data: { jobId: 'test-job-1' } };
      const mockError = new Error('Test error');
      
      // Should not throw
      expect(() => failedHandler(mockJob, mockError)).not.toThrow();
    });

    it('should handle progress event', () => {
      const progressHandler = (mockBullQueue.on as jest.Mock).mock.calls
        .find(call => call[0] === 'progress')[1];

      const mockJob = { id: 'job-1', data: { jobId: 'test-job-1' } };
      const progress = 50;
      
      // Should not throw
      expect(() => progressHandler(mockJob, progress)).not.toThrow();
    });
  });
});
import Bull from 'bull';
import { TranscodingJob, JobProgress } from '../types';
import { config } from '../config';
import { logger } from '../utils/logger';

export class TranscodingQueue {
  private queue: Bull.Queue<TranscodingJob>;

  constructor() {
    this.queue = new Bull('transcoding', config.redis.url, {
      defaultJobOptions: {
        removeOnComplete: 10,
        removeOnFail: 50,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000
        }
      }
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.queue.on('completed', (job) => {
      logger.info(`Job ${job.id} completed successfully`, { jobId: job.data.jobId });
    });

    this.queue.on('failed', (job, err) => {
      logger.error(`Job ${job.id} failed`, { 
        jobId: job.data.jobId, 
        error: err.message,
        stack: err.stack 
      });
    });

    this.queue.on('stalled', (job) => {
      logger.warn(`Job ${job.id} stalled`, { jobId: job.data.jobId });
    });

    this.queue.on('progress', (job, progress) => {
      logger.info(`Job ${job.id} progress: ${progress}%`, { 
        jobId: job.data.jobId, 
        progress 
      });
    });
  }

  async addJob(jobData: TranscodingJob, priority: number = 0): Promise<Bull.Job<TranscodingJob>> {
    logger.info('Adding transcoding job to queue', { jobId: jobData.jobId });
    
    return this.queue.add(jobData, {
      priority,
      jobId: jobData.jobId
    });
  }

  async getJob(jobId: string): Promise<Bull.Job<TranscodingJob> | null> {
    return this.queue.getJob(jobId);
  }

  async getJobCounts(): Promise<Bull.JobCounts> {
    return this.queue.getJobCounts();
  }

  async getWaiting(): Promise<Bull.Job<TranscodingJob>[]> {
    return this.queue.getWaiting();
  }

  async getActive(): Promise<Bull.Job<TranscodingJob>[]> {
    return this.queue.getActive();
  }

  async getCompleted(): Promise<Bull.Job<TranscodingJob>[]> {
    return this.queue.getCompleted();
  }

  async getFailed(): Promise<Bull.Job<TranscodingJob>[]> {
    return this.queue.getFailed();
  }

  async pauseQueue(): Promise<void> {
    await this.queue.pause();
    logger.info('Transcoding queue paused');
  }

  async resumeQueue(): Promise<void> {
    await this.queue.resume();
    logger.info('Transcoding queue resumed');
  }

  async cleanQueue(): Promise<void> {
    await this.queue.clean(24 * 60 * 60 * 1000, 'completed');
    await this.queue.clean(7 * 24 * 60 * 60 * 1000, 'failed');
    logger.info('Queue cleaned');
  }

  async close(): Promise<void> {
    await this.queue.close();
    logger.info('Transcoding queue closed');
  }

  getQueue(): Bull.Queue<TranscodingJob> {
    return this.queue;
  }

  async healthCheck(): Promise<boolean> {
    try {
      const client = this.queue.client;
      return client.status === 'ready';
    } catch (error) {
      return false;
    }
  }
}
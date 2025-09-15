import Bull from 'bull';
import { TranscodingJob } from '../types';
import { TranscodingQueue } from '../queue/transcoding-queue';
import { logger } from '../utils/logger';
import { config } from '../config';
import path from 'path';
import fs from 'fs-extra';

// Import the simple transcoder
const { transcodeVideo } = require('../../../../simple-transcoder');

export class SimpleTranscodingWorker {
  private queue: TranscodingQueue;
  private bullQueue: Bull.Queue<TranscodingJob>;

  constructor() {
    this.queue = new TranscodingQueue();
    this.bullQueue = this.queue.getQueue();
    this.setupWorker();
  }

  private setupWorker(): void {
    logger.info(`Starting simple transcoding worker with ${config.transcoding.concurrentJobs} concurrent jobs`);
    
    // Process jobs from the queue
    this.bullQueue.process(config.transcoding.concurrentJobs, async (job: Bull.Job<TranscodingJob>) => {
      return this.processJob(job);
    });

    // Log queue events
    this.bullQueue.on('completed', (job) => {
      logger.info(`Job ${job.id} completed successfully`, { jobId: job.data.jobId });
    });

    this.bullQueue.on('failed', (job, err) => {
      logger.error(`Job ${job.id} failed`, { 
        jobId: job.data.jobId, 
        error: err.message 
      });
    });

    this.bullQueue.on('progress', (job, progress) => {
      logger.info(`Job ${job.id} progress: ${progress}%`, { 
        jobId: job.data.jobId, 
        progress 
      });
    });
  }

  private async processJob(job: Bull.Job<TranscodingJob>): Promise<void> {
    const { jobId, inputPath, outputPath } = job.data;
    const startTime = Date.now();
    
    try {
      logger.info(`Starting transcoding job ${jobId}`, { 
        jobId, 
        inputPath, 
        outputPath 
      });
      
      // Validate input file exists
      if (!await fs.pathExists(inputPath)) {
        throw new Error(`Input file not found: ${inputPath}`);
      }
      
      // Ensure output directory exists
      await fs.ensureDir(path.dirname(outputPath));
      
      // Update job progress
      job.progress(0);
      
      logger.info(`Input file validated, starting transcoding for job ${jobId}`);
      
      // Use the simple transcoder that we know works
      const result = await transcodeVideo(inputPath, outputPath, jobId);
      
      if (!result || !result.success) {
        throw new Error('Transcoding failed - no result or unsuccessful');
      }
      
      // Verify output was created
      const masterPlaylistPath = path.join(outputPath, 'master.m3u8');
      if (!await fs.pathExists(masterPlaylistPath)) {
        throw new Error('Transcoding completed but master playlist not found');
      }
      
      // Update job progress to complete
      job.progress(100);
      
      const totalTime = Date.now() - startTime;
      
      logger.info(`Transcoding job ${jobId} completed successfully`, { 
        jobId,
        totalTime,
        outputPath: result.outputDir,
        masterPlaylist: masterPlaylistPath
      });
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Transcoding job ${jobId} failed`, {
        jobId,
        error: errorMessage,
        inputPath,
        outputPath,
        processingTime: Date.now() - startTime
      });
      
      // Clean up partial output on failure
      try {
        if (await fs.pathExists(outputPath)) {
          await fs.remove(outputPath);
          logger.info(`Cleaned up partial output for failed job ${jobId}`);
        }
      } catch (cleanupError) {
        logger.warn(`Failed to clean up partial output for job ${jobId}`, {
          error: cleanupError instanceof Error ? cleanupError.message : 'Unknown cleanup error'
        });
      }
      
      throw error;
    }
  }

  public async shutdown(): Promise<void> {
    logger.info('Shutting down simple transcoding worker...');
    
    try {
      await this.queue.close();
      logger.info('Simple transcoding worker shutdown complete');
    } catch (error) {
      logger.error('Error during worker shutdown', { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  }
}
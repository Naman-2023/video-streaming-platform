import Bull from 'bull';
import { TranscodingJob, JobProgress, QualityProfile } from '../types';
import { TranscodingQueue } from '../queue/transcoding-queue';
import { FFmpegService } from '../services/ffmpeg.service';
import { JobStatusService } from '../services/job-status.service';
import { MonitoringService } from '../services/monitoring.service';
import { ErrorHandlerService } from '../services/error-handler.service';
import { logger } from '../utils/logger';
import { config } from '../config';

export class TranscodingWorker {
  private queue: TranscodingQueue;
  private ffmpegService: FFmpegService;
  private jobStatusService: JobStatusService;
  private monitoringService: MonitoringService;
  private errorHandlerService: ErrorHandlerService;
  private isHealthy: boolean = true;
  private lastHeartbeat: Date = new Date();
  private processedJobs: number = 0;
  private failedJobs: number = 0;

  constructor() {
    this.queue = new TranscodingQueue();
    this.ffmpegService = new FFmpegService();
    this.jobStatusService = new JobStatusService();
    this.monitoringService = new MonitoringService();
    this.errorHandlerService = new ErrorHandlerService(this.monitoringService);
    
    this.setupWorker();
    this.setupHealthMonitoring();
  }

  private setupWorker(): void {
    const bullQueue = this.queue.getQueue();
    
    bullQueue.process(config.transcoding.concurrentJobs, async (job: Bull.Job<TranscodingJob>) => {
      return this.processJob(job);
    });

    logger.info(`Transcoding worker started with ${config.transcoding.concurrentJobs} concurrent jobs`);
  }

  private async processJob(job: Bull.Job<TranscodingJob>): Promise<void> {
    const { jobId, inputPath, outputPath, qualities } = job.data;
    const startTime = Date.now();
    
    try {
      logger.info(`Starting transcoding job ${jobId}`, { jobId, inputPath, outputPath });
      
      // Record transcoding start metrics
      const inputStats = await this.getFileStats(inputPath);
      await this.monitoringService.recordTranscodingStart(
        jobId,
        inputStats.size,
        qualities.map(q => q.name)
      );
      
      // Update job status to processing
      await this.jobStatusService.updateJobStatus(jobId, 'processing', 0);
      
      // Record performance metric for job start
      await this.monitoringService.recordPerformanceMetrics(
        jobId,
        'job_start',
        Date.now() - startTime
      );
      
      const transcodeStartTime = Date.now();
      
      // Use multi-quality transcoding for better efficiency
      await this.ffmpegService.transcodeMultiQuality(
        inputPath,
        outputPath,
        qualities,
        async (overallProgress: number, currentQuality: string) => {
          // Update job progress
          job.progress(overallProgress);
          await this.jobStatusService.updateJobProgress(jobId, overallProgress, currentQuality);
          
          // Record progress metrics
          await this.monitoringService.recordPerformanceMetrics(
            jobId,
            'transcoding_progress',
            Date.now() - transcodeStartTime,
            { progress: overallProgress, currentQuality }
          );
          
          logger.debug(`Transcoding progress for job ${jobId}`, {
            jobId,
            progress: overallProgress,
            currentQuality
          });
        }
      );

      const transcodeEndTime = Date.now();
      const transcodeTime = transcodeEndTime - transcodeStartTime;

      // Update all quality statuses to completed
      for (const quality of qualities) {
        await this.jobStatusService.updateQualityStatus(jobId, quality.name, 'completed');
      }

      // Validate transcoding output
      const validationStartTime = Date.now();
      const validation = await this.ffmpegService.validateTranscodingOutput(outputPath, qualities);
      
      await this.monitoringService.recordPerformanceMetrics(
        jobId,
        'validation',
        Date.now() - validationStartTime,
        { valid: validation.valid, issues: validation.issues.length }
      );
      
      if (!validation.valid) {
        throw new Error(`Transcoding validation failed: ${validation.issues.join(', ')}`);
      }

      logger.info(`Transcoding validation passed for job ${jobId}`, {
        jobId,
        segmentCounts: validation.segmentCounts
      });
      
      // Calculate output size and performance metrics
      const outputStats = await this.getDirectoryStats(outputPath);
      const totalTime = Date.now() - startTime;
      const compressionRatio = inputStats.size / outputStats.size;
      const throughputMbps = (inputStats.size / 1024 / 1024) / (transcodeTime / 1000);
      
      // Record completion metrics
      await this.monitoringService.recordTranscodingCompletion(jobId, outputStats.size, {
        transcodeTime,
        compressionRatio,
        throughputMbps,
        averageFps: this.calculateAverageFps(inputStats.duration, transcodeTime)
      });
      
      // Update job as completed
      await this.jobStatusService.updateJobStatus(jobId, 'completed', 100);
      
      this.processedJobs++;
      this.updateHeartbeat();
      
      logger.info(`Transcoding job ${jobId} completed successfully`, { 
        jobId,
        totalTime,
        transcodeTime,
        compressionRatio: compressionRatio.toFixed(2),
        throughputMbps: throughputMbps.toFixed(2)
      });
      
    } catch (error) {
      this.failedJobs++;
      
      // Handle error with comprehensive error handling
      const transcodingError = await this.errorHandlerService.handleError(
        error instanceof Error ? error : new Error(String(error)),
        jobId,
        'transcoding',
        {
          inputPath,
          outputPath,
          qualities: qualities.map(q => q.name),
          processingTime: Date.now() - startTime
        }
      );
      
      // Update job as failed with detailed error information
      await this.jobStatusService.updateJobStatus(
        jobId, 
        'failed', 
        0, 
        `${transcodingError.type}: ${transcodingError.message}`
      );
      
      // Check if error is retryable
      const recoveryStrategy = this.errorHandlerService.getRecoveryStrategy(transcodingError);
      
      if (transcodingError.retryable && job.attemptsMade < recoveryStrategy.maxRetries) {
        logger.warn(`Job ${jobId} will be retried`, {
          jobId,
          attempt: job.attemptsMade + 1,
          maxRetries: recoveryStrategy.maxRetries,
          errorType: transcodingError.type
        });
      }
      
      throw error;
    }
  }

  private setupHealthMonitoring(): void {
    // Health check interval
    setInterval(() => {
      this.performHealthCheck();
    }, 30000); // Every 30 seconds

    // Heartbeat update
    setInterval(() => {
      this.updateHeartbeat();
    }, 10000); // Every 10 seconds
  }

  private performHealthCheck(): void {
    try {
      // Check if worker is responsive
      const now = new Date();
      const timeSinceLastHeartbeat = now.getTime() - this.lastHeartbeat.getTime();
      
      if (timeSinceLastHeartbeat > 60000) { // 1 minute
        this.isHealthy = false;
        logger.error('Worker health check failed: No heartbeat for over 1 minute');
        return;
      }

      // Check FFmpeg availability
      if (!this.ffmpegService.isAvailable()) {
        this.isHealthy = false;
        logger.error('Worker health check failed: FFmpeg not available');
        return;
      }

      // Check queue connection
      const queueHealth = this.queue.getQueue().client.status;
      if (queueHealth !== 'ready') {
        this.isHealthy = false;
        logger.error('Worker health check failed: Queue connection not ready', { status: queueHealth });
        return;
      }

      this.isHealthy = true;
      
      logger.debug('Worker health check passed', {
        processedJobs: this.processedJobs,
        failedJobs: this.failedJobs,
        lastHeartbeat: this.lastHeartbeat
      });
      
    } catch (error) {
      this.isHealthy = false;
      logger.error('Worker health check failed with exception', { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  }

  private updateHeartbeat(): void {
    this.lastHeartbeat = new Date();
  }

  public getHealthStatus(): {
    healthy: boolean;
    lastHeartbeat: Date;
    processedJobs: number;
    failedJobs: number;
    uptime: number;
  } {
    return {
      healthy: this.isHealthy,
      lastHeartbeat: this.lastHeartbeat,
      processedJobs: this.processedJobs,
      failedJobs: this.failedJobs,
      uptime: process.uptime()
    };
  }

  private async getFileStats(filePath: string): Promise<{ size: number; duration: number }> {
    try {
      const videoInfo = await this.ffmpegService.getVideoInfo(filePath);
      return {
        size: videoInfo.size,
        duration: videoInfo.duration
      };
    } catch (error) {
      logger.warn('Failed to get file stats, using defaults', {
        filePath,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return { size: 0, duration: 0 };
    }
  }

  private async getDirectoryStats(dirPath: string): Promise<{ size: number }> {
    try {
      const fs = require('fs-extra');
      const path = require('path');
      
      let totalSize = 0;
      
      const calculateSize = async (currentPath: string): Promise<void> => {
        const stats = await fs.stat(currentPath);
        
        if (stats.isDirectory()) {
          const files = await fs.readdir(currentPath);
          for (const file of files) {
            await calculateSize(path.join(currentPath, file));
          }
        } else {
          totalSize += stats.size;
        }
      };
      
      await calculateSize(dirPath);
      return { size: totalSize };
      
    } catch (error) {
      logger.warn('Failed to get directory stats, using default', {
        dirPath,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return { size: 0 };
    }
  }

  private calculateAverageFps(duration: number, transcodeTime: number): number {
    if (duration === 0 || transcodeTime === 0) return 0;
    
    // Assuming 30fps source video
    const totalFrames = duration * 30;
    const transcodeTimeSeconds = transcodeTime / 1000;
    
    return totalFrames / transcodeTimeSeconds;
  }

  public async shutdown(): Promise<void> {
    logger.info('Shutting down transcoding worker...');
    
    try {
      // Cleanup monitoring service
      await this.monitoringService.cleanup();
      await this.monitoringService.close();
      
      // Close job status service
      await this.jobStatusService.close();
      
      // Close queue
      await this.queue.close();
      
      logger.info('Transcoding worker shutdown complete');
    } catch (error) {
      logger.error('Error during worker shutdown', { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  }
}
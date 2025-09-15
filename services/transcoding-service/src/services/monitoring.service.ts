import { logger } from '../utils/logger';

export class MonitoringService {
  async recordTranscodingStart(jobId: string, inputSize: number, qualities: string[]): Promise<void> {
    logger.info(`Transcoding started for job ${jobId}`, { inputSize, qualities });
  }

  async recordTranscodingCompletion(jobId: string, outputSize: number, metrics: any): Promise<void> {
    logger.info(`Transcoding completed for job ${jobId}`, { outputSize, metrics });
  }

  async recordPerformanceMetrics(jobId: string, metric: string, value: number, metadata?: any): Promise<void> {
    logger.debug(`Performance metric recorded for job ${jobId}`, { metric, value, metadata });
  }

  async cleanup(): Promise<void> {
    logger.info('Monitoring service cleanup completed');
  }

  async close(): Promise<void> {
    logger.info('Monitoring service closed');
  }
}
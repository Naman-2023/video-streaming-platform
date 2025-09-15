import { logger } from '../utils/logger';
import { MonitoringService } from './monitoring.service';

export interface TranscodingError {
  type: string;
  message: string;
  retryable: boolean;
  code?: string;
}

export class ErrorHandlerService {
  constructor(private monitoringService: MonitoringService) {}

  async handleError(error: Error, jobId: string, context: string, metadata?: any): Promise<TranscodingError> {
    logger.error(`Error in ${context} for job ${jobId}`, { 
      error: error.message, 
      stack: error.stack,
      metadata 
    });

    // Determine error type and if it's retryable
    let errorType = 'UNKNOWN_ERROR';
    let retryable = false;

    if (error.message.includes('ENOENT') || error.message.includes('not found')) {
      errorType = 'FILE_NOT_FOUND';
      retryable = false;
    } else if (error.message.includes('ENOSPC') || error.message.includes('disk')) {
      errorType = 'DISK_SPACE_ERROR';
      retryable = true;
    } else if (error.message.includes('ffmpeg') || error.message.includes('codec')) {
      errorType = 'TRANSCODING_ERROR';
      retryable = true;
    } else if (error.message.includes('timeout') || error.message.includes('ETIMEDOUT')) {
      errorType = 'TIMEOUT_ERROR';
      retryable = true;
    }

    const transcodingError: TranscodingError = {
      type: errorType,
      message: error.message,
      retryable,
      code: (error as any).code
    };

    // Record error metrics
    await this.monitoringService.recordPerformanceMetrics(
      jobId,
      'error',
      1,
      { errorType, retryable, context }
    );

    return transcodingError;
  }

  getRecoveryStrategy(error: TranscodingError): { maxRetries: number; backoffMs: number } {
    switch (error.type) {
      case 'DISK_SPACE_ERROR':
        return { maxRetries: 1, backoffMs: 60000 }; // 1 minute
      case 'TIMEOUT_ERROR':
        return { maxRetries: 2, backoffMs: 30000 }; // 30 seconds
      case 'TRANSCODING_ERROR':
        return { maxRetries: 3, backoffMs: 10000 }; // 10 seconds
      default:
        return { maxRetries: 1, backoffMs: 5000 }; // 5 seconds
    }
  }
}
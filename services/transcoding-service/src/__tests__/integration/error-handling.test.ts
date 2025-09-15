import { ErrorHandlerService, ErrorType, ErrorSeverity } from '../../services/error-handler.service';
import { MonitoringService } from '../../services/monitoring.service';

// Mock monitoring service
jest.mock('../../services/monitoring.service');

describe('Error Handling Integration Tests', () => {
  let errorHandler: ErrorHandlerService;
  let mockMonitoringService: jest.Mocked<MonitoringService>;

  beforeEach(() => {
    mockMonitoringService = {
      recordTranscodingFailure: jest.fn().mockResolvedValue(undefined)
    } as any;

    errorHandler = new ErrorHandlerService(mockMonitoringService);
  });

  describe('error classification', () => {
    it('should classify input file errors correctly', async () => {
      const error = new Error('No such file or directory: /input/video.mp4');
      
      const result = await errorHandler.handleError(error, 'job-1', 'input_validation');

      expect(result.type).toBe(ErrorType.INPUT_FILE_ERROR);
      expect(result.severity).toBe(ErrorSeverity.HIGH);
      expect(result.recoverable).toBe(false);
      expect(result.retryable).toBe(false);
      expect(result.jobId).toBe('job-1');
      expect(result.stage).toBe('input_validation');
    });

    it('should classify FFmpeg errors correctly', async () => {
      const error = new Error('ffmpeg encoding failed: codec not found');
      
      const result = await errorHandler.handleError(error, 'job-2', 'transcoding');

      expect(result.type).toBe(ErrorType.FFMPEG_ERROR);
      expect(result.severity).toBe(ErrorSeverity.HIGH);
      expect(result.recoverable).toBe(true);
      expect(result.retryable).toBe(true);
    });

    it('should classify storage errors correctly', async () => {
      const error = new Error('ENOSPC: no space left on device');
      
      const result = await errorHandler.handleError(error, 'job-3', 'output_writing');

      expect(result.type).toBe(ErrorType.STORAGE_ERROR);
      expect(result.severity).toBe(ErrorSeverity.MEDIUM);
      expect(result.recoverable).toBe(true);
      expect(result.retryable).toBe(true);
    });

    it('should classify validation errors correctly', async () => {
      const error = new Error('Playlist validation failed: missing segments');
      
      const result = await errorHandler.handleError(error, 'job-4', 'validation');

      expect(result.type).toBe(ErrorType.VALIDATION_ERROR);
      expect(result.severity).toBe(ErrorSeverity.LOW);
      expect(result.recoverable).toBe(false);
      expect(result.retryable).toBe(false);
    });

    it('should classify resource errors correctly', async () => {
      const error = new Error('Out of memory: cannot allocate buffer');
      
      const result = await errorHandler.handleError(error, 'job-5', 'transcoding');

      expect(result.type).toBe(ErrorType.RESOURCE_ERROR);
      expect(result.severity).toBe(ErrorSeverity.CRITICAL);
      expect(result.recoverable).toBe(true);
      expect(result.retryable).toBe(true);
    });

    it('should classify network errors correctly', async () => {
      const error = new Error('Network connection failed: timeout');
      
      const result = await errorHandler.handleError(error, 'job-6', 'download');

      expect(result.type).toBe(ErrorType.NETWORK_ERROR);
      expect(result.severity).toBe(ErrorSeverity.MEDIUM);
      expect(result.recoverable).toBe(true);
      expect(result.retryable).toBe(true);
    });

    it('should classify timeout errors correctly', async () => {
      const error = new Error('Operation timed out after 300 seconds');
      
      const result = await errorHandler.handleError(error, 'job-7', 'transcoding');

      expect(result.type).toBe(ErrorType.TIMEOUT_ERROR);
      expect(result.severity).toBe(ErrorSeverity.HIGH);
      expect(result.recoverable).toBe(true);
      expect(result.retryable).toBe(true);
    });

    it('should classify unknown errors as unknown type', async () => {
      const error = new Error('Some unexpected error occurred');
      
      const result = await errorHandler.handleError(error, 'job-8', 'unknown');

      expect(result.type).toBe(ErrorType.UNKNOWN_ERROR);
      expect(result.severity).toBe(ErrorSeverity.MEDIUM);
    });
  });

  describe('recovery strategies', () => {
    it('should provide appropriate recovery strategy for FFmpeg errors', async () => {
      const error = new Error('ffmpeg encoding failed');
      const result = await errorHandler.handleError(error, 'job-1');
      
      const strategy = errorHandler.getRecoveryStrategy(result);

      expect(strategy.maxRetries).toBe(3);
      expect(strategy.retryDelay).toBe(5000);
      expect(strategy.backoffMultiplier).toBe(2);
      expect(strategy.recoveryActions).toContain('Retry with different codec settings');
    });

    it('should provide appropriate recovery strategy for storage errors', async () => {
      const error = new Error('No space left on device');
      const result = await errorHandler.handleError(error, 'job-2');
      
      const strategy = errorHandler.getRecoveryStrategy(result);

      expect(strategy.maxRetries).toBe(2);
      expect(strategy.retryDelay).toBe(10000);
      expect(strategy.backoffMultiplier).toBe(1.5);
      expect(strategy.recoveryActions).toContain('Clean up temporary files');
    });

    it('should provide appropriate recovery strategy for resource errors', async () => {
      const error = new Error('Out of memory');
      const result = await errorHandler.handleError(error, 'job-3');
      
      const strategy = errorHandler.getRecoveryStrategy(result);

      expect(strategy.maxRetries).toBe(5);
      expect(strategy.retryDelay).toBe(30000);
      expect(strategy.backoffMultiplier).toBe(1.2);
      expect(strategy.recoveryActions).toContain('Wait for resources to become available');
    });

    it('should provide minimal recovery strategy for input file errors', async () => {
      const error = new Error('File not found');
      const result = await errorHandler.handleError(error, 'job-4');
      
      const strategy = errorHandler.getRecoveryStrategy(result);

      expect(strategy.maxRetries).toBe(1);
      expect(strategy.recoveryActions).toContain('Manual intervention required');
    });
  });

  describe('error history and statistics', () => {
    it('should track error history for jobs', async () => {
      const jobId = 'job-with-errors';
      
      await errorHandler.handleError(new Error('First error'), jobId);
      await errorHandler.handleError(new Error('Second error'), jobId);
      await errorHandler.handleError(new Error('Third error'), jobId);

      const history = errorHandler.getErrorHistory(jobId);
      
      expect(history).toHaveLength(3);
      expect(history[0].message).toBe('First error');
      expect(history[1].message).toBe('Second error');
      expect(history[2].message).toBe('Third error');
    });

    it('should provide error statistics', async () => {
      // Generate various types of errors
      await errorHandler.handleError(new Error('ffmpeg error'), 'job-1');
      await errorHandler.handleError(new Error('ffmpeg error'), 'job-2');
      await errorHandler.handleError(new Error('No space left'), 'job-3');
      await errorHandler.handleError(new Error('Out of memory'), 'job-4');

      const stats = errorHandler.getErrorStatistics(24);

      expect(stats.totalErrors).toBe(4);
      expect(stats.errorsByType[ErrorType.FFMPEG_ERROR]).toBe(2);
      expect(stats.errorsByType[ErrorType.STORAGE_ERROR]).toBe(1);
      expect(stats.errorsByType[ErrorType.RESOURCE_ERROR]).toBe(1);
      expect(stats.errorsBySeverity[ErrorSeverity.HIGH]).toBe(2);
      expect(stats.errorsBySeverity[ErrorSeverity.MEDIUM]).toBe(1);
      expect(stats.errorsBySeverity[ErrorSeverity.CRITICAL]).toBe(1);
    });

    it('should identify most common errors', async () => {
      // Generate repeated errors
      await errorHandler.handleError(new Error('Common error message'), 'job-1');
      await errorHandler.handleError(new Error('Common error message'), 'job-2');
      await errorHandler.handleError(new Error('Common error message'), 'job-3');
      await errorHandler.handleError(new Error('Less common error'), 'job-4');

      const stats = errorHandler.getErrorStatistics(24);

      expect(stats.mostCommonErrors[0].message).toBe('Common error message');
      expect(stats.mostCommonErrors[0].count).toBe(3);
      expect(stats.mostCommonErrors[1].message).toBe('Less common error');
      expect(stats.mostCommonErrors[1].count).toBe(1);
    });

    it('should clear error history', async () => {
      const jobId = 'job-to-clear';
      
      await errorHandler.handleError(new Error('Error to clear'), jobId);
      expect(errorHandler.getErrorHistory(jobId)).toHaveLength(1);

      errorHandler.clearErrorHistory(jobId);
      expect(errorHandler.getErrorHistory(jobId)).toHaveLength(0);
    });
  });

  describe('monitoring integration', () => {
    it('should record failure metrics when handling errors', async () => {
      const jobId = 'monitored-job';
      const error = new Error('Test error for monitoring');

      await errorHandler.handleError(error, jobId, 'test_stage');

      expect(mockMonitoringService.recordTranscodingFailure).toHaveBeenCalledWith(
        jobId,
        ErrorType.UNKNOWN_ERROR,
        'Test error for monitoring'
      );
    });

    it('should include additional context in error details', async () => {
      const error = new Error('Context test error');
      const additionalContext = {
        inputFile: '/test/input.mp4',
        outputDir: '/test/output',
        quality: '720p'
      };

      const result = await errorHandler.handleError(
        error,
        'context-job',
        'transcoding',
        additionalContext
      );

      expect(result.details?.context).toEqual(additionalContext);
      expect(result.details?.stage).toBe('transcoding');
    });
  });

  describe('alert triggering', () => {
    it('should handle critical errors without throwing', async () => {
      const criticalError = new Error('Out of memory: system critical');
      
      // Should not throw even though it triggers alerts
      await expect(
        errorHandler.handleError(criticalError, 'critical-job')
      ).resolves.toBeDefined();
    });

    it('should handle repeated failures for same job', async () => {
      const jobId = 'failing-job';
      
      // Generate multiple failures for the same job
      for (let i = 0; i < 5; i++) {
        await errorHandler.handleError(
          new Error(`Failure ${i + 1}`),
          jobId,
          'transcoding'
        );
      }

      // Should not throw despite triggering alerts
      const history = errorHandler.getErrorHistory(jobId);
      expect(history).toHaveLength(5);
    });
  });
});
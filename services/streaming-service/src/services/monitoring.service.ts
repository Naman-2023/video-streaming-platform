import { logger } from '@video-platform/shared';
import { cacheService } from './cache.service';

export class MonitoringService {
  private healthCheckInterval: NodeJS.Timeout | null = null;

  async startPeriodicHealthChecks(): Promise<void> {
    // Run health checks every 30 seconds
    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthChecks();
    }, 30000);

    logger.info('Started periodic health checks');
  }

  async stopPeriodicHealthChecks(): Promise<void> {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    logger.info('Stopped periodic health checks');
  }

  private async performHealthChecks(): Promise<void> {
    try {
      // Check memory usage
      const memoryUsage = process.memoryUsage();
      const memoryUsagePercent = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;
      
      if (memoryUsagePercent > 85) {
        logger.warn('High memory usage detected', {
          heapUsed: memoryUsage.heapUsed,
          heapTotal: memoryUsage.heapTotal,
          percentage: memoryUsagePercent
        });
      }

      // Check cache service
      const cacheHealthy = await cacheService.healthCheck();
      if (!cacheHealthy) {
        logger.warn('Cache service health check failed');
      }

    } catch (error) {
      logger.error('Health check error', error);
    }
  }

  async getSystemMetrics(): Promise<{
    memory: NodeJS.MemoryUsage;
    uptime: number;
    timestamp: string;
  }> {
    return {
      memory: process.memoryUsage(),
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    };
  }
}

export const monitoringService = new MonitoringService();
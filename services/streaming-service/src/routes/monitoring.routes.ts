import { Router, Request, Response } from 'express';
import { monitoringService } from '../services/monitoring.service';
import { analyticsService } from '../services/analytics.service';
import { cacheService } from '../services/cache.service';

const router = Router();

// Get system metrics
router.get('/metrics', async (req: Request, res: Response) => {
  try {
    const systemMetrics = await monitoringService.getSystemMetrics();
    const analyticsMetrics = analyticsService.getMetrics();
    
    res.json({
      success: true,
      data: {
        system: systemMetrics,
        analytics: analyticsMetrics
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'METRICS_ERROR',
        message: 'Failed to retrieve metrics',
        timestamp: new Date().toISOString()
      }
    });
  }
});

// Get analytics data
router.get('/analytics', (req: Request, res: Response) => {
  try {
    const metrics = analyticsService.getMetrics();
    res.json({
      success: true,
      data: metrics
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'ANALYTICS_ERROR',
        message: 'Failed to retrieve analytics',
        timestamp: new Date().toISOString()
      }
    });
  }
});

// Reset analytics
router.post('/analytics/reset', (req: Request, res: Response) => {
  try {
    analyticsService.resetMetrics();
    res.json({
      success: true,
      message: 'Analytics metrics reset successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'RESET_ERROR',
        message: 'Failed to reset analytics',
        timestamp: new Date().toISOString()
      }
    });
  }
});

// Cache management
router.delete('/cache/:pattern', async (req: Request, res: Response) => {
  try {
    const { pattern } = req.params;
    await cacheService.invalidatePattern(pattern);
    
    res.json({
      success: true,
      message: `Cache invalidated for pattern: ${pattern}`
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'CACHE_ERROR',
        message: 'Failed to invalidate cache',
        timestamp: new Date().toISOString()
      }
    });
  }
});

export default router;
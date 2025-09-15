import { Request, Response, NextFunction } from 'express';
import { analyticsService } from '../services/analytics.service';

export const analyticsMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const originalSend = res.send;
  
  res.send = function(data: any) {
    // Record analytics data
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const contentLength = res.get('Content-Length');
    const bytes = contentLength ? parseInt(contentLength) : 0;
    
    if (req.path.endsWith('.ts')) {
      analyticsService.recordRequest('segment', ip, bytes);
    } else if (req.path.endsWith('.m3u8')) {
      analyticsService.recordRequest('playlist', ip, bytes);
    } else {
      analyticsService.recordRequest('other', ip, bytes);
    }
    
    return originalSend.call(this, data);
  };
  
  next();
};

export const cacheHitMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const originalSend = res.send;
  
  res.send = function(data: any) {
    // Record cache hit analytics
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    analyticsService.recordCacheHit(req.path, ip);
    
    return originalSend.call(this, data);
  };
  
  next();
};
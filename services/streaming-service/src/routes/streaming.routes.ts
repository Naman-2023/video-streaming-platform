import { Router, Request, Response } from 'express';
import winston from 'winston';
import mime from 'mime-types';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

// Mock middleware functions
const playlistCacheMiddleware = (req: Request, res: Response, next: any) => next();
const segmentCacheMiddleware = (req: Request, res: Response, next: any) => next();
const cacheInvalidationMiddleware = (type: string) => (req: Request, res: Response, next: any) => next();

const router = Router();

// Serve master playlist
router.get('/:jobId/master.m3u8', playlistCacheMiddleware, async (req: Request, res: Response): Promise<any> => {
  try {
    const { jobId } = req.params;
    
    if (!jobId) {
      return res.status(400).json({ error: 'Job ID is required' });
    }

    // Try to serve actual transcoded file
    const fs = require('fs-extra');
    const path = require('path');
    const masterPlaylistPath = path.join(process.cwd(), '..', '..', 'transcoded', jobId, 'master.m3u8');
    
    if (await fs.pathExists(masterPlaylistPath)) {
      // Serve actual transcoded master playlist
      const masterPlaylist = await fs.readFile(masterPlaylistPath, 'utf8');
      
      // Set appropriate headers for HLS master playlist
      res.set({
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Cache-Control': 'public, max-age=300', // 5 minutes
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': 'Range',
        'Access-Control-Expose-Headers': 'Content-Length, Content-Range',
      });

      res.send(masterPlaylist);
      logger.info('Served actual master playlist', { jobId, path: masterPlaylistPath });
      return;
    } else {
      // Fallback to mock playlist if transcoding not complete
      const masterPlaylist = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360
360p/playlist.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2500000,RESOLUTION=1280x720
720p/playlist.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080
1080p/playlist.m3u8`;
      
      // Set appropriate headers for HLS master playlist
      res.set({
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Cache-Control': 'public, max-age=300', // 5 minutes
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': 'Range',
        'Access-Control-Expose-Headers': 'Content-Length, Content-Range',
      });

      res.send(masterPlaylist);
      logger.info('Served mock master playlist (transcoding not complete)', { jobId });
      return;
    }
  } catch (error) {
    logger.error('Failed to serve master playlist', { 
      jobId: req.params.jobId, 
      error: error instanceof Error ? error.message : error 
    });
    
    if (error instanceof Error && error.message.includes('not found')) {
      return res.status(404).json({ error: 'Playlist not found' });
    }
    
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Serve quality-specific playlist
router.get('/:jobId/:quality/playlist.m3u8', playlistCacheMiddleware, async (req: Request, res: Response): Promise<any> => {
  try {
    const { jobId, quality } = req.params;
    
    if (!jobId || !quality) {
      return res.status(400).json({ error: 'Job ID and quality are required' });
    }

    // Validate quality parameter
    const validQualities = ['360p', '720p', '1080p'];
    if (!validQualities.includes(quality)) {
      return res.status(400).json({ error: 'Invalid quality parameter' });
    }

    // Try to serve actual transcoded quality playlist
    const fs = require('fs-extra');
    const path = require('path');
    const qualityPlaylistPath = path.join(process.cwd(), '..', '..', 'transcoded', jobId, quality, 'playlist.m3u8');
    
    if (await fs.pathExists(qualityPlaylistPath)) {
      // Serve actual transcoded quality playlist
      const qualityPlaylist = await fs.readFile(qualityPlaylistPath, 'utf8');
      
      // Set appropriate headers for HLS quality playlist
      res.set({
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Cache-Control': 'public, max-age=300', // 5 minutes
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': 'Range',
        'Access-Control-Expose-Headers': 'Content-Length, Content-Range',
      });

      res.send(qualityPlaylist);
      logger.info('Served actual quality playlist', { jobId, quality, path: qualityPlaylistPath });
      return;
    } else {
      // Fallback to mock playlist
      const qualityPlaylist = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:10
#EXTINF:10.0,
segment_000.ts
#EXT-X-ENDLIST`;
      
      // Set appropriate headers for HLS quality playlist
      res.set({
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Cache-Control': 'public, max-age=300', // 5 minutes
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': 'Range',
        'Access-Control-Expose-Headers': 'Content-Length, Content-Range',
      });

      res.send(qualityPlaylist);
      logger.info('Served mock quality playlist (transcoding not complete)', { jobId, quality });
      return;
    }
  } catch (error) {
    logger.error('Failed to serve quality playlist', { 
      jobId: req.params.jobId, 
      quality: req.params.quality,
      error: error instanceof Error ? error.message : error 
    });
    
    if (error instanceof Error && error.message.includes('not found')) {
      return res.status(404).json({ error: 'Playlist not found' });
    }
    
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Serve video segments
router.get('/:jobId/:quality/:segment', segmentCacheMiddleware, async (req: Request, res: Response): Promise<any> => {
  try {
    const { jobId, quality, segment } = req.params;
    
    if (!jobId || !quality || !segment) {
      return res.status(400).json({ error: 'Job ID, quality, and segment are required' });
    }

    // Validate quality parameter
    const validQualities = ['360p', '720p', '1080p'];
    if (!validQualities.includes(quality)) {
      return res.status(400).json({ error: 'Invalid quality parameter' });
    }

    // Validate segment format (should be .ts files)
    if (!segment.endsWith('.ts')) {
      return res.status(400).json({ error: 'Invalid segment format' });
    }

    // Try to serve actual transcoded segment
    const fs = require('fs-extra');
    const path = require('path');
    const segmentPath = path.join(process.cwd(), '..', '..', 'transcoded', jobId, quality, segment);
    
    if (await fs.pathExists(segmentPath)) {
      // Serve actual transcoded segment
      const segmentData = await fs.readFile(segmentPath);
      
      // Set appropriate headers for video segments
      const contentType = mime.lookup(segment) || 'video/mp2t';
      res.set({
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600', // 1 hour
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': 'Range',
        'Access-Control-Expose-Headers': 'Content-Length, Content-Range',
        'Accept-Ranges': 'bytes',
        'Content-Length': segmentData.length.toString()
      });

      res.send(segmentData);
      logger.debug('Served actual video segment', { jobId, quality, segment, size: segmentData.length });
      return;
    } else {
      // Return 404 for missing segments
      logger.warn('Video segment not found', { jobId, quality, segment, path: segmentPath });
      return res.status(404).json({ error: 'Segment not found' });
    }
  } catch (error) {
    logger.error('Failed to serve video segment', { 
      jobId: req.params.jobId, 
      quality: req.params.quality,
      segment: req.params.segment,
      error: error instanceof Error ? error.message : error 
    });
    
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Health check endpoint
router.get('/health', (req: Request, res: Response) => {
  res.json({ 
    status: 'healthy', 
    service: 'streaming-service',
    timestamp: new Date().toISOString()
  });
});

// Cache invalidation endpoint (for internal use)
router.delete('/:jobId/cache', cacheInvalidationMiddleware('job'), async (req: Request, res: Response): Promise<any> => {
  try {
    const { jobId } = req.params;
    const { quality } = req.query;
    
    if (!jobId) {
      return res.status(400).json({ error: 'Job ID is required' });
    }

    // Mock cache invalidation
    logger.info('Mock cache invalidation', { jobId, quality });
    
    res.json({ message: 'Cache invalidated successfully' });
    
    logger.info('Cache invalidated', { jobId, quality });
    return;
  } catch (error) {
    logger.error('Failed to invalidate cache', { 
      jobId: req.params.jobId, 
      error: error instanceof Error ? error.message : error 
    });
    
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import fs from 'fs';
import path from 'path';

const app = express();

// Basic middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Basic logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    service: 'streaming-service',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      'GET /api/v1/stream/:jobId/master.m3u8': 'Get master playlist',
      'GET /api/v1/stream/:jobId/:quality/playlist.m3u8': 'Get quality playlist',
      'GET /api/v1/stream/:jobId/:quality/:segment': 'Get video segment'
    }
  });
});

// Simple health check
app.get('/health', (req, res) => {
  res.json({
    service: 'streaming-service',
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

// HLS Streaming routes
app.get('/api/v1/stream/:jobId/master.m3u8', (req, res) => {
  const { jobId } = req.params;
  const transcodedDir = path.resolve(process.cwd(), '../../transcoded', jobId);
  
  if (!fs.existsSync(transcodedDir)) {
    return res.status(404).json({ error: 'Video not found' });
  }

  // Generate master playlist
  const masterPlaylist = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360
360p/playlist.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=1400000,RESOLUTION=1280x720
720p/playlist.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2800000,RESOLUTION=1920x1080
1080p/playlist.m3u8
`;

  res.set('Content-Type', 'application/vnd.apple.mpegurl');
  res.send(masterPlaylist);
});

app.get('/api/v1/stream/:jobId/:quality/playlist.m3u8', (req, res) => {
  const { jobId, quality } = req.params;
  const playlistPath = path.resolve(process.cwd(), '../../transcoded', jobId, quality, 'playlist.m3u8');
  
  if (!fs.existsSync(playlistPath)) {
    return res.status(404).json({ error: 'Playlist not found' });
  }

  res.set('Content-Type', 'application/vnd.apple.mpegurl');
  res.sendFile(playlistPath);
});

app.get('/api/v1/stream/:jobId/:quality/:segment', (req, res) => {
  const { jobId, quality, segment } = req.params;
  const segmentPath = path.resolve(process.cwd(), '../../transcoded', jobId, quality, segment);
  
  if (!fs.existsSync(segmentPath)) {
    return res.status(404).json({ error: 'Segment not found' });
  }

  res.set('Content-Type', 'video/mp2t');
  res.sendFile(segmentPath);
});

// Error handler
app.use((error: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Streaming service error:', error.message);
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: error.message,
      timestamp: new Date().toISOString()
    }
  });
});

const PORT = process.env.PORT || 3004;
const HOST = process.env.HOST || 'localhost';

app.listen(PORT, () => {
  console.log(`🚀 Streaming Service running on http://${HOST}:${PORT}`);
});

export default app;
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createProxyMiddleware } from 'http-proxy-middleware';

const app = express();

// Basic middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Rate limiting - prevent abuse
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: '15 minutes'
  }
});
app.use(limiter);

// Logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - API Gateway: ${req.method} ${req.path}`);
  next();
});

// Service configuration
const SERVICES = {
  UPLOAD: process.env.UPLOAD_SERVICE_URL || 'http://localhost:3001',
  STREAMING: process.env.STREAMING_SERVICE_URL || 'http://localhost:3004',
  TRANSCODING: process.env.TRANSCODING_SERVICE_URL || 'http://localhost:3005'
};

// Health check for API Gateway
app.get('/health', async (req, res) => {
  try {
    // Check if all services are reachable
    const serviceChecks = await Promise.allSettled([
      fetch(`${SERVICES.UPLOAD}/health`).then(r => r.ok),
      fetch(`${SERVICES.STREAMING}/health`).then(r => r.ok),
      fetch(`${SERVICES.TRANSCODING}/health`).then(r => r.ok)
    ]);

    const servicesStatus = {
      upload: serviceChecks[0].status === 'fulfilled' && serviceChecks[0].value,
      streaming: serviceChecks[1].status === 'fulfilled' && serviceChecks[1].value,
      transcoding: serviceChecks[2].status === 'fulfilled' && serviceChecks[2].value
    };

    const allHealthy = Object.values(servicesStatus).every(status => status);

    res.status(allHealthy ? 200 : 503).json({
      service: 'api-gateway',
      status: allHealthy ? 'healthy' : 'degraded',
      services: servicesStatus,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({
      service: 'api-gateway',
      status: 'unhealthy',
      error: 'Failed to check service health',
      timestamp: new Date().toISOString()
    });
  }
});

// API Gateway info endpoint
app.get('/', (req, res) => {
  res.json({
    service: 'video-platform-api-gateway',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      'POST /api/upload/file': 'Upload video file',
      'POST /api/upload/url': 'Upload video from URL',
      'GET /api/upload/status/:jobId': 'Get upload status',
      'GET /api/upload/formats': 'Get supported formats',
      'GET /api/stream/:jobId/master.m3u8': 'Get master playlist',
      'GET /api/stream/:jobId/:quality/playlist.m3u8': 'Get quality playlist',
      'GET /api/stream/:jobId/:quality/:segment': 'Get video segment',
      'POST /api/transcode': 'Start transcoding job',
      'GET /api/transcode/status/:jobId': 'Get transcoding status'
    },
    services: SERVICES
  });
});

// Proxy configurations for each service
const uploadProxy = createProxyMiddleware({
  target: SERVICES.UPLOAD,
  changeOrigin: true,
  pathRewrite: {
    '^/api/upload': '/api/v1/upload'
  },
  onError: (err, req, res) => {
    console.error('Upload service proxy error:', err.message);
    res.status(503).json({
      error: 'Upload service unavailable',
      message: 'Please try again later'
    });
  }
});

const streamingProxy = createProxyMiddleware({
  target: SERVICES.STREAMING,
  changeOrigin: true,
  pathRewrite: {
    '^/api/stream': '/api/v1/stream'
  },
  onError: (err, req, res) => {
    console.error('Streaming service proxy error:', err.message);
    res.status(503).json({
      error: 'Streaming service unavailable',
      message: 'Please try again later'
    });
  }
});

const transcodingProxy = createProxyMiddleware({
  target: SERVICES.TRANSCODING,
  changeOrigin: true,
  pathRewrite: {
    '^/api/transcode': '/api/v1'
  },
  onError: (err, req, res) => {
    console.error('Transcoding service proxy error:', err.message);
    res.status(503).json({
      error: 'Transcoding service unavailable',
      message: 'Please try again later'
    });
  }
});

// Route requests to appropriate services
app.use('/api/upload', uploadProxy);
app.use('/api/stream', streamingProxy);
app.use('/api/transcode', transcodingProxy);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    message: `${req.method} ${req.originalUrl} is not a valid endpoint`,
    availableEndpoints: [
      'GET /',
      'GET /health',
      'POST /api/upload/file',
      'GET /api/upload/status/:jobId',
      'GET /api/stream/:jobId/master.m3u8',
      'POST /api/transcode'
    ]
  });
});

// Global error handler
app.use((error: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('API Gateway error:', error.message);
  res.status(500).json({
    error: 'Internal server error',
    message: 'Something went wrong in the API Gateway',
    timestamp: new Date().toISOString()
  });
});

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || 'localhost';

app.listen(PORT, () => {
  console.log(`🚀 API Gateway running on http://${HOST}:${PORT}`);
  console.log('📡 Proxying to services:');
  console.log(`   Upload Service: ${SERVICES.UPLOAD}`);
  console.log(`   Streaming Service: ${SERVICES.STREAMING}`);
  console.log(`   Transcoding Service: ${SERVICES.TRANSCODING}`);
});

export default app;
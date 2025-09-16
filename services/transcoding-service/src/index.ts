import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createClient } from 'redis';

const app = express();
let redisClient: any;

// Basic middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Basic logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Initialize Redis connection
async function initRedis() {
  try {
    redisClient = createClient({
      url: `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || '6379'}`
    });
    
    redisClient.on('error', (err: any) => {
      console.log('Redis Client Error', err);
    });
    
    await redisClient.connect();
    console.log('Connected to Redis');
  } catch (error) {
    console.error('Failed to connect to Redis:', error);
  }
}

// Root endpoint
app.get('/', (_req, res) => {
  res.json({
    service: 'transcoding-service',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      'POST /api/v1/transcode': 'Start transcoding job',
      'GET /api/v1/status/:jobId': 'Get transcoding status'
    }
  });
});

// Simple health check
app.get('/health', async (_req, res) => {
  let redisStatus = 'disconnected';
  try {
    if (redisClient) {
      await redisClient.ping();
      redisStatus = 'connected';
    }
  } catch (error) {
    redisStatus = 'error';
  }

  res.json({
    service: 'transcoding-service',
    status: 'healthy',
    redis: redisStatus,
    timestamp: new Date().toISOString()
  });
});

// Note: Transcoding jobs now come from Kafka, not HTTP API
// The worker.ts file handles Kafka consumption

// Get transcoding status
app.get('/api/v1/status/:jobId', async (req, res) => {
  const { jobId } = req.params;
  
  try {
    let status = 'unknown';
    
    if (redisClient) {
      const jobStatus = await redisClient.get(`transcoding:status:${jobId}`);
      if (jobStatus) {
        status = JSON.parse(jobStatus);
      }
    }

    res.json({
      success: true,
      jobId,
      status
    });
  } catch (error) {
    console.error('Error getting transcoding status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get transcoding status'
    });
  }
});

// Error handler
app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Transcoding service error:', error.message);
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: error.message,
      timestamp: new Date().toISOString()
    }
  });
});

const PORT = process.env.PORT || 3005;
const HOST = process.env.HOST || 'localhost';

// Start server
async function startServer() {
  await initRedis();
  
  app.listen(PORT, () => {
    console.log(`🚀 Transcoding Service running on http://${HOST}:${PORT}`);
  });
}

startServer();

export default app;
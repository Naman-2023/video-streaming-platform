import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import uploadRoutes from './routes/upload.routes';

const app = express();

// Basic middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Basic logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Setup routes
app.use('/api/v1/upload', uploadRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    service: 'upload-service',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      'POST /api/v1/upload/file': 'Upload video file',
      'POST /api/v1/upload/url': 'Upload video from URL',
      'GET /api/v1/upload/status/:jobId': 'Get upload status',
      'GET /api/v1/upload/formats': 'Get supported formats'
    }
  });
});

// Simple health check
app.get('/health', (req, res) => {
  res.json({
    service: 'upload-service',
    version: '1.0.0',
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

// Error handler
app.use((error: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Upload service error:', error.message);
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: error.message,
      timestamp: new Date().toISOString()
    }
  });
});

const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || 'localhost';

app.listen(PORT, () => {
  console.log(`🚀 Upload Service running on http://${HOST}:${PORT}`);
});

export default app;
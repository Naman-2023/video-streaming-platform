import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs-extra';
import axios from 'axios';
import { createClient } from 'redis';

// Configure multer for file uploads
const upload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept video files and common video extensions
    const allowedMimes = ['video/mp4', 'video/avi', 'video/mov', 'video/mkv', 'video/webm', 'video/flv'];
    const allowedExts = ['.mp4', '.avi', '.mov', '.mkv', '.webm', '.flv'];
    
    const isValidMime = file.mimetype.startsWith('video/') || allowedMimes.includes(file.mimetype);
    const isValidExt = allowedExts.some(ext => file.originalname.toLowerCase().endsWith(ext));
    
    if (isValidMime || isValidExt) {
      cb(null, true);
    } else {
      cb(new Error('Only video files are allowed'));
    }
  },
});

const router = Router();

// Redis client for status checking
let redisClient: any = null;

// Initialize Redis connection
async function initRedis() {
  if (!redisClient) {
    try {
      redisClient = createClient({
        url: `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || '6379'}`
      });
      
      redisClient.on('error', (err: any) => {
        console.log('Upload Service Redis Client Error', err);
      });
      
      await redisClient.connect();
      console.log('Upload Service connected to Redis');
    } catch (error) {
      console.error('Upload Service failed to connect to Redis:', error);
    }
  }
}

// Initialize Redis on module load
initRedis();

// Create job ID
const createJobId = () => {
  return `job_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
};

// POST /api/v1/upload/file - Upload video file
router.post('/file', upload.single('video'), async (req: Request, res: Response): Promise<any> => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'NO_FILE',
          message: 'No video file provided',
          timestamp: new Date().toISOString()
        }
      });
    }

    const userId = req.headers['x-user-id'] as string || 'user_test123';
    const jobId = createJobId();
    
    console.log('File upload initiated:', {
      jobId,
      userId,
      filename: req.file.originalname,
      size: req.file.size,
      path: req.file.path
    });

    // Trigger transcoding automatically via transcoding service
    try {
      const absoluteInputPath = path.resolve(req.file.path);
      const absoluteOutputPath = path.resolve('../../transcoded', jobId);
      
      console.log('Starting automatic transcoding:', {
        jobId,
        inputPath: absoluteInputPath,
        outputPath: absoluteOutputPath
      });

      // Call transcoding service API
      const transcodingResponse = await axios.post('http://localhost:3005/api/v1/transcode', {
        jobId,
        inputPath: absoluteInputPath,
        outputPath: absoluteOutputPath
      });
      
      console.log('Transcoding job queued:', { 
        jobId, 
        response: transcodingResponse.data
      });
    } catch (error) {
      console.error('Failed to start transcoding:', {
        jobId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      // Don't fail the upload if transcoding fails to start
    }

    res.status(201).json({
      success: true,
      data: {
        jobId,
        status: 'QUEUED',
        message: 'File uploaded successfully and queued for processing'
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('File upload failed:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'UPLOAD_FAILED',
        message: 'Failed to upload file',
        timestamp: new Date().toISOString()
      }
    });
  }
});

// POST /api/v1/upload/url - Upload video from URL
router.post('/url', async (req: Request, res: Response): Promise<any> => {
  try {
    const { url, filename } = req.body;
    
    if (!url) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'NO_URL',
          message: 'Video URL is required',
          timestamp: new Date().toISOString()
        }
      });
    }

    const userId = req.headers['x-user-id'] as string || 'user_test123';
    const jobId = createJobId();
    
    console.log('URL upload initiated:', {
      jobId,
      userId,
      url,
      filename
    });

    res.status(201).json({
      success: true,
      data: {
        jobId,
        status: 'QUEUED',
        message: 'URL upload initiated and queued for processing'
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('URL upload failed:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'UPLOAD_FAILED',
        message: 'Failed to upload from URL',
        timestamp: new Date().toISOString()
      }
    });
  }
});

// GET /api/v1/upload/status/:jobId - Get upload status
router.get('/status/:jobId', async (req: Request, res: Response): Promise<any> => {
  try {
    const { jobId } = req.params;
    
    if (!jobId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'NO_JOB_ID',
          message: 'Job ID is required',
          timestamp: new Date().toISOString()
        }
      });
    }

    let status = 'QUEUED';
    let progress = 0;
    let currentStep = 'Waiting to start processing';
    let error = null;

    // First check Redis for real-time transcoding status
    try {
      if (redisClient) {
        const redisStatus = await redisClient.get(`transcoding:status:${jobId}`);
        if (redisStatus) {
          const statusData = JSON.parse(redisStatus);
          status = statusData.status.toUpperCase();
          progress = statusData.progress || 0;
          
          switch (statusData.status) {
            case 'processing':
              currentStep = `Transcoding in progress (${progress}%)`;
              break;
            case 'completed':
              currentStep = 'Transcoding completed successfully';
              progress = 100;
              break;
            case 'failed':
              currentStep = 'Transcoding failed';
              status = 'FAILED';
              error = statusData.error;
              break;
            default:
              currentStep = 'Processing...';
          }
        }
      }
    } catch (redisError) {
      console.warn('Error checking Redis status:', { jobId, error: redisError });
    }

    // If no Redis status, check file system as fallback
    if (status === 'QUEUED') {
      try {
        const transcodedPath = path.resolve('../../transcoded', jobId);
        
        if (await fs.pathExists(transcodedPath)) {
          // Check if all quality folders exist
          const qualities = ['360p', '720p', '1080p'];
          let completedQualities = 0;
          
          for (const quality of qualities) {
            const qualityPath = path.join(transcodedPath, quality, 'playlist.m3u8');
            if (await fs.pathExists(qualityPath)) {
              completedQualities++;
            }
          }
          
          if (completedQualities === qualities.length) {
            status = 'COMPLETED';
            progress = 100;
            currentStep = 'Transcoding completed successfully';
          } else if (completedQualities > 0) {
            status = 'PROCESSING';
            progress = Math.round((completedQualities / qualities.length) * 100);
            currentStep = `Transcoding ${completedQualities}/${qualities.length} qualities completed`;
          } else {
            status = 'PROCESSING';
            progress = 25;
            currentStep = 'Transcoding in progress';
          }
        }
      } catch (fsError) {
        console.warn('Error checking file system status:', { jobId, error: fsError });
      }
    }

    const statusResponse = {
      jobId,
      status,
      progress,
      currentStep,
      estimatedTimeRemaining: status === 'COMPLETED' ? 0 : Math.max(0, 180 - (progress * 1.8)),
      ...(error && { error })
    };

    res.json({
      success: true,
      data: statusResponse,
      timestamp: new Date().toISOString()
    });
    
    console.log('Upload status retrieved:', { jobId, status, progress });
  } catch (error) {
    console.error('Failed to get upload status:', { jobId: req.params.jobId, error });
    res.status(500).json({
      success: false,
      error: {
        code: 'STATUS_FAILED',
        message: 'Failed to retrieve upload status',
        timestamp: new Date().toISOString()
      }
    });
  }
});

// GET /api/v1/upload/formats - Get supported formats
router.get('/formats', (_req: Request, res: Response) => {
  const supportedFormats = {
    video: [
      { format: 'mp4', description: 'MPEG-4 Video' },
      { format: 'avi', description: 'Audio Video Interleave' },
      { format: 'mov', description: 'QuickTime Movie' },
      { format: 'mkv', description: 'Matroska Video' },
      { format: 'webm', description: 'WebM Video' },
      { format: 'flv', description: 'Flash Video' }
    ],
    maxFileSize: '500MB',
    maxDuration: '2 hours'
  };

  res.json({
    success: true,
    data: supportedFormats,
    timestamp: new Date().toISOString()
  });
});

export default router;
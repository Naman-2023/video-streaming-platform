import { createClient } from 'redis';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

let redisClient: any;

async function initRedis() {
  try {
    redisClient = createClient({
      url: `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || '6379'}`
    });
    
    redisClient.on('error', (err: any) => {
      console.log('Redis Client Error', err);
    });
    
    await redisClient.connect();
    console.log('Worker connected to Redis');
  } catch (error) {
    console.error('Worker failed to connect to Redis:', error);
  }
}

async function transcodeVideo(jobId: string, inputPath: string, outputPath: string) {
  console.log(`Starting transcoding job ${jobId}`);
  
  try {
    // Update status to processing
    if (redisClient) {
      await redisClient.set(`transcoding:status:${jobId}`, JSON.stringify({
        status: 'processing',
        progress: 0,
        updatedAt: new Date().toISOString()
      }));
    }

    // Create output directory with absolute path
    const outputDir = path.resolve(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Create quality directories
    const qualities = ['360p', '720p', '1080p'];
    for (const quality of qualities) {
      const qualityDir = path.join(outputDir, quality);
      if (!fs.existsSync(qualityDir)) {
        fs.mkdirSync(qualityDir, { recursive: true });
      }
    }

    // Transcode to different qualities
    const transcodingPromises = qualities.map(quality => {
      return new Promise((resolve, reject) => {
        const qualityDir = path.join(outputDir, quality);
        const playlistPath = path.join(qualityDir, 'playlist.m3u8');
        
        let resolution: string, bitrate: string;
        switch (quality) {
          case '360p':
            resolution = '640x360';
            bitrate = '800k';
            break;
          case '720p':
            resolution = '1280x720';
            bitrate = '1400k';
            break;
          case '1080p':
            resolution = '1920x1080';
            bitrate = '2800k';
            break;
          default:
            resolution = '640x360';
            bitrate = '800k';
        }

        const ffmpegArgs = [
          '-i', inputPath,
          '-c:v', 'libx264',
          '-c:a', 'aac',
          '-s', resolution,
          '-b:v', bitrate,
          '-b:a', '128k',
          '-hls_time', '10',
          '-hls_list_size', '0',
          '-f', 'hls',
          playlistPath
        ];

        const ffmpeg = spawn('ffmpeg', ffmpegArgs);
        
        ffmpeg.on('close', (code) => {
          if (code === 0) {
            console.log(`${quality} transcoding completed for job ${jobId}`);
            resolve(quality);
          } else {
            console.error(`${quality} transcoding failed for job ${jobId} with code ${code}`);
            reject(new Error(`FFmpeg failed with code ${code}`));
          }
        });

        ffmpeg.on('error', (error) => {
          console.error(`${quality} transcoding error for job ${jobId}:`, error);
          reject(error);
        });
      });
    });

    // Wait for all qualities to complete
    await Promise.all(transcodingPromises);

    // Update status to completed
    if (redisClient) {
      await redisClient.set(`transcoding:status:${jobId}`, JSON.stringify({
        status: 'completed',
        progress: 100,
        completedAt: new Date().toISOString()
      }));
    }

    console.log(`Transcoding job ${jobId} completed successfully`);
    
  } catch (error) {
    console.error(`Transcoding job ${jobId} failed:`, error);
    
    // Update status to failed
    if (redisClient) {
      await redisClient.set(`transcoding:status:${jobId}`, JSON.stringify({
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        failedAt: new Date().toISOString()
      }));
    }
  }
}

async function processQueue() {
  if (!redisClient) return;

  try {
    // Get job from queue
    const jobData = await redisClient.brPop('transcoding:queue', 5);
    
    if (jobData) {
      const job = JSON.parse(jobData.element);
      await transcodeVideo(job.jobId, job.inputPath, job.outputPath);
    }
  } catch (error) {
    console.error('Error processing queue:', error);
  }
}

async function startWorker() {
  console.log('🔧 Starting Transcoding Worker...');
  
  await initRedis();
  
  // Process queue continuously
  while (true) {
    await processQueue();
    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second between checks
  }
}

// Handle shutdown
process.on('SIGTERM', () => {
  console.log('Worker shutting down...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('Worker shutting down...');
  process.exit(0);
});

startWorker();
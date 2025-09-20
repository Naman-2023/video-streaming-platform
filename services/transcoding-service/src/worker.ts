import { createClient } from 'redis';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { createConsumer, createProducer, TOPICS, CONSUMER_GROUP } from './kafka';

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

async function updateProgress(jobId: string, progress: number, message?: string) {
  if (redisClient) {
    try {
      await redisClient.set(`transcoding:status:${jobId}`, JSON.stringify({
        status: 'processing',
        progress: Math.round(progress),
        message: message || `Processing... ${Math.round(progress)}%`,
        updatedAt: new Date().toISOString()
      }));
    } catch (error) {
      console.error(`Failed to update progress for job ${jobId}:`, error);
    }
  }
}

async function transcodeVideo(jobId: string, inputPath: string, outputPath: string) {
  console.log(`🎬 Starting transcoding job ${jobId}`);
  console.log(`📁 Input: ${inputPath}`);
  console.log(`📁 Output: ${outputPath}`);
  
  try {
    // Validate input file exists
    if (!fs.existsSync(inputPath)) {
      throw new Error(`Input file not found: ${inputPath}`);
    }

    // Update status to processing
    await updateProgress(jobId, 0, 'Initializing transcoding...');

    // Create output directory with absolute path
    const outputDir = path.resolve(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
      console.log(`📁 Created output directory: ${outputDir}`);
    }

    // Create quality directories
    const qualities = ['360p', '720p', '1080p'];
    for (const quality of qualities) {
      const qualityDir = path.join(outputDir, quality);
      if (!fs.existsSync(qualityDir)) {
        fs.mkdirSync(qualityDir, { recursive: true });
      }
    }

    await updateProgress(jobId, 10, 'Starting quality transcoding...');

    // Transcode to different qualities with progress tracking
    let completedQualities = 0;
    const transcodingPromises = qualities.map((quality, index) => {
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
          '-progress', 'pipe:1',  // Enable progress output
          playlistPath
        ];

        console.log(`🔄 Starting ${quality} transcoding for job ${jobId}`);
        const ffmpeg = spawn('ffmpeg', ffmpegArgs);
        
        let duration = 0;
        let currentTime = 0;

        // Parse FFmpeg output for progress
        ffmpeg.stdout?.on('data', (data) => {
          const output = data.toString();
          
          // Extract duration (only once)
          if (duration === 0) {
            const durationMatch = output.match(/Duration: (\d{2}):(\d{2}):(\d{2})/);
            if (durationMatch) {
              const hours = parseInt(durationMatch[1]);
              const minutes = parseInt(durationMatch[2]);
              const seconds = parseInt(durationMatch[3]);
              duration = hours * 3600 + minutes * 60 + seconds;
            }
          }

          // Extract current time
          const timeMatch = output.match(/time=(\d{2}):(\d{2}):(\d{2})/);
          if (timeMatch && duration > 0) {
            const hours = parseInt(timeMatch[1]);
            const minutes = parseInt(timeMatch[2]);
            const seconds = parseInt(timeMatch[3]);
            currentTime = hours * 3600 + minutes * 60 + seconds;
            
            const qualityProgress = (currentTime / duration) * 100;
            const overallProgress = 10 + ((completedQualities + (qualityProgress / 100)) / qualities.length) * 80;
            
            updateProgress(jobId, overallProgress, `Transcoding ${quality}: ${Math.round(qualityProgress)}%`);
          }
        });

        ffmpeg.stderr?.on('data', (data) => {
          const output = data.toString();
          
          // Extract duration from stderr if not found in stdout
          if (duration === 0) {
            const durationMatch = output.match(/Duration: (\d{2}):(\d{2}):(\d{2})/);
            if (durationMatch) {
              const hours = parseInt(durationMatch[1]);
              const minutes = parseInt(durationMatch[2]);
              const seconds = parseInt(durationMatch[3]);
              duration = hours * 3600 + minutes * 60 + seconds;
            }
          }

          // Extract progress from stderr
          const timeMatch = output.match(/time=(\d{2}):(\d{2}):(\d{2})/);
          if (timeMatch && duration > 0) {
            const hours = parseInt(timeMatch[1]);
            const minutes = parseInt(timeMatch[2]);
            const seconds = parseInt(timeMatch[3]);
            currentTime = hours * 3600 + minutes * 60 + seconds;
            
            const qualityProgress = (currentTime / duration) * 100;
            const overallProgress = 10 + ((completedQualities + (qualityProgress / 100)) / qualities.length) * 80;
            
            updateProgress(jobId, overallProgress, `Transcoding ${quality}: ${Math.round(qualityProgress)}%`);
          }

          // Log errors but don't fail on warnings
          if (output.includes('Error') || output.includes('error')) {
            console.error(`⚠️  FFmpeg ${quality} warning/error:`, output.trim());
          }
        });
        
        ffmpeg.on('close', (code) => {
          if (code === 0) {
            completedQualities++;
            const overallProgress = 10 + (completedQualities / qualities.length) * 80;
            console.log(`✅ ${quality} transcoding completed for job ${jobId}`);
            updateProgress(jobId, overallProgress, `${quality} completed (${completedQualities}/${qualities.length})`);
            resolve(quality);
          } else {
            console.error(`❌ ${quality} transcoding failed for job ${jobId} with exit code ${code}`);
            reject(new Error(`FFmpeg failed with exit code ${code} for ${quality}`));
          }
        });

        ffmpeg.on('error', (error) => {
          console.error(`❌ ${quality} transcoding process error for job ${jobId}:`, error);
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
        message: 'All qualities transcoded successfully',
        completedAt: new Date().toISOString()
      }));
    }

    console.log(`🎉 Transcoding job ${jobId} completed successfully`);
    
  } catch (error) {
    console.error(`💥 Transcoding job ${jobId} failed:`, error);
    
    // Update status to failed
    if (redisClient) {
      await redisClient.set(`transcoding:status:${jobId}`, JSON.stringify({
        status: 'failed',
        progress: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
        message: 'Transcoding failed',
        failedAt: new Date().toISOString()
      }));
    }
    
    throw error; // Re-throw to handle in processQueue
  }
}

async function startKafkaConsumer() {
  const consumer = createConsumer();
  const producer = createProducer();
  
  try {
    await consumer.connect();
    await producer.connect();
    
    await consumer.subscribe({ topic: TOPICS.TRANSCODING_JOBS });
    
    console.log(`🎯 Kafka consumer connected, listening to ${TOPICS.TRANSCODING_JOBS}`);
    
    await consumer.run({
      eachMessage: async ({ message }: { message: any }) => {
        try {
          const job = JSON.parse(message.value!.toString());
          console.log(`📥 Processing job from Kafka:`, {
            jobId: job.jobId,
            inputPath: job.inputPath,
            outputPath: job.outputPath
          });
          
          await transcodeVideo(job.jobId, job.inputPath, job.outputPath);
          
          // Notify that video is ready for streaming
          await producer.send({
            topic: TOPICS.STREAMING_READY,
            messages: [{
              key: job.jobId,
              value: JSON.stringify({
                jobId: job.jobId,
                status: 'ready',
                completedAt: new Date().toISOString()
              })
            }]
          });
          
          console.log(`✅ Job completed and streaming notification sent: ${job.jobId}`);
        } catch (error) {
          console.error('💥 Error processing Kafka message:', error);
        }
      }
    });
  } catch (error) {
    console.error('💥 Kafka consumer error:', error);
    // Retry connection after delay
    setTimeout(startKafkaConsumer, 5000);
  }
}

let isShuttingDown = false;

async function startWorker() {
  console.log('🔧 Starting Transcoding Worker with Kafka...');
  console.log(`🆔 Worker PID: ${process.pid}`);
  
  await initRedis(); // Still need Redis for status updates
  
  // Start Kafka consumer (runs indefinitely)
  await startKafkaConsumer();
  
  console.log('🔌 Worker ended');
}

// Graceful shutdown handling
async function shutdown() {
  if (isShuttingDown) return;
  
  console.log('🛑 Worker shutting down gracefully...');
  isShuttingDown = true;
  
  // Close Redis connection
  if (redisClient) {
    try {
      await redisClient.disconnect();
      console.log('🔌 Redis connection closed');
    } catch (error) {
      console.error('Error closing Redis connection:', error);
    }
  }
  
  console.log('✅ Worker shutdown complete');
  process.exit(0);
}

// Handle shutdown signals
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception:', error);
  shutdown();
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
  shutdown();
});

startWorker().catch((error) => {
  console.error('💥 Failed to start worker:', error);
  process.exit(1);
});
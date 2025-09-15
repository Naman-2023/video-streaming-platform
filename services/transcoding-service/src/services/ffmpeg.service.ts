import ffmpeg from 'fluent-ffmpeg';
import { QualityProfile } from '../types';
import { logger } from '../utils/logger';
import { config } from '../config';
import { HLSPlaylistService } from './hls-playlist.service';
import * as fs from 'fs-extra';
import * as path from 'path';

export class FFmpegService {
  private hlsPlaylistService: HLSPlaylistService;

  constructor() {
    this.hlsPlaylistService = new HLSPlaylistService();
    
    // Set FFmpeg path if needed
    if (process.env.FFMPEG_PATH) {
      ffmpeg.setFfmpegPath(process.env.FFMPEG_PATH);
    }
    if (process.env.FFPROBE_PATH) {
      ffmpeg.setFfprobePath(process.env.FFPROBE_PATH);
    }
  }

  async transcodeQuality(
    inputPath: string,
    outputPath: string,
    quality: QualityProfile,
    onProgress?: (progress: number) => void
  ): Promise<void> {
    return new Promise(async (resolve, reject) => {
      try {
        const qualityOutputPath = path.join(outputPath, quality.name);
        
        // Ensure output directory exists
        await fs.ensureDir(qualityOutputPath);
        
        const playlistPath = path.join(qualityOutputPath, 'playlist.m3u8');
        const segmentPattern = path.join(qualityOutputPath, 'segment_%03d.ts');
        
        // Get input video info to determine if we should upscale
        const videoInfo = await this.getVideoInfo(inputPath);
        const [inputWidth, inputHeight] = videoInfo.resolution.split('x').map(Number);
        const [targetWidth, targetHeight] = quality.resolution.split('x').map(Number);
        
        // Don't upscale - use original resolution if it's smaller than target
        let finalResolution = quality.resolution;
        let finalBitrate = quality.bitrate;
        
        if (inputWidth < targetWidth || inputHeight < targetHeight) {
          finalResolution = videoInfo.resolution;
          // Scale bitrate proportionally
          const scaleFactor = (inputWidth * inputHeight) / (targetWidth * targetHeight);
          finalBitrate = Math.round(quality.bitrate * scaleFactor);
          
          logger.info(`Adjusting quality for smaller input video`, {
            originalResolution: videoInfo.resolution,
            targetResolution: quality.resolution,
            finalResolution,
            originalBitrate: quality.bitrate,
            finalBitrate
          });
        }
        
        logger.info(`Starting transcoding for quality ${quality.name}`, {
          inputPath,
          outputPath: qualityOutputPath,
          resolution: finalResolution,
          bitrate: finalBitrate,
          segmentDuration: config.transcoding.segmentDuration
        });

        // Advanced FFmpeg options for better HLS compatibility
        const ffmpegCommand = ffmpeg(inputPath)
          .outputOptions([
            // Video codec settings
            '-c:v', 'libx264',
            '-preset', 'medium',
            '-profile:v', 'high',
            '-level', '4.0',
            '-crf', '23',
            
            // Audio codec settings
            '-c:a', 'aac',
            '-b:a', '128k',
            '-ar', '48000',
            '-ac', '2',
            
            // Rate control
            '-b:v', `${finalBitrate}k`,
            '-maxrate', `${Math.round(finalBitrate * 1.2)}k`,
            '-bufsize', `${Math.round(finalBitrate * 2)}k`,
            
            // GOP settings for better seeking
            '-g', '48',
            '-keyint_min', '48',
            '-sc_threshold', '0',
            
            // Resolution
            '-s', finalResolution,
            
            // HLS specific settings
            '-f', 'hls',
            '-hls_time', config.transcoding.segmentDuration.toString(),
            '-hls_playlist_type', 'vod',
            '-hls_segment_filename', segmentPattern,
            '-hls_flags', 'independent_segments',
            
            // Optimization flags
            '-movflags', '+faststart',
            '-tune', 'film'
          ])
          .output(playlistPath);

        // Add hardware acceleration if available
        if (await this.isHardwareAccelerationAvailable()) {
          ffmpegCommand.inputOptions(['-hwaccel', 'auto']);
          logger.debug('Hardware acceleration enabled');
        }

        ffmpegCommand
          .on('start', (commandLine) => {
            logger.debug(`FFmpeg command: ${commandLine}`);
          })
          .on('progress', (progress) => {
            const percent = Math.round(progress.percent || 0);
            logger.debug(`Transcoding progress for ${quality.name}: ${percent}%`, {
              frames: progress.frames,
              fps: progress.currentFps,
              bitrate: progress.currentKbps
            });
            if (onProgress) {
              onProgress(percent);
            }
          })
          .on('end', async () => {
            try {
              // Verify the output files were created
              const playlistExists = await fs.pathExists(playlistPath);
              if (!playlistExists) {
                throw new Error('Playlist file was not created');
              }

              // Count segments
              const segmentCount = await this.countSegments(qualityOutputPath);
              
              logger.info(`Transcoding completed for quality ${quality.name}`, {
                outputPath: qualityOutputPath,
                segmentCount,
                finalResolution,
                finalBitrate
              });
              
              resolve();
            } catch (verificationError) {
              reject(verificationError);
            }
          })
          .on('error', (error) => {
            logger.error(`Transcoding failed for quality ${quality.name}`, {
              error: error.message,
              inputPath,
              outputPath: qualityOutputPath,
              resolution: finalResolution,
              bitrate: finalBitrate
            });
            reject(error);
          })
          .run();
          
      } catch (error) {
        reject(error);
      }
    });
  }

  private async isHardwareAccelerationAvailable(): Promise<boolean> {
    // Simple check - in production you might want to test actual hardware capabilities
    return process.platform === 'linux' || process.platform === 'darwin';
  }

  private async countSegments(outputPath: string): Promise<number> {
    try {
      const files = await fs.readdir(outputPath);
      return files.filter(file => file.endsWith('.ts')).length;
    } catch (error) {
      logger.warn('Failed to count segments', { error: error instanceof Error ? error.message : 'Unknown error' });
      return 0;
    }
  }

  async generateMasterPlaylist(outputPath: string, qualities: QualityProfile[]): Promise<void> {
    await this.hlsPlaylistService.generateMasterPlaylist(outputPath, qualities);
  }

  async getVideoInfo(inputPath: string): Promise<{
    duration: number;
    resolution: string;
    format: string;
    size: number;
  }> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(inputPath, (err, metadata) => {
        if (err) {
          reject(err);
          return;
        }

        const videoStream = metadata.streams.find(stream => stream.codec_type === 'video');
        if (!videoStream) {
          reject(new Error('No video stream found'));
          return;
        }

        const stats = fs.statSync(inputPath);
        
        resolve({
          duration: metadata.format.duration || 0,
          resolution: `${videoStream.width}x${videoStream.height}`,
          format: metadata.format.format_name || 'unknown',
          size: stats.size
        });
      });
    });
  }

  isAvailable(): boolean {
    try {
      // Simple check to see if FFmpeg is available
      return true; // In a real implementation, you might want to run a test command
    } catch (error) {
      return false;
    }
  }

  async transcodeMultiQuality(
    inputPath: string,
    outputPath: string,
    qualities: QualityProfile[],
    onProgress?: (overallProgress: number, currentQuality: string) => void
  ): Promise<void> {
    logger.info('Starting multi-quality transcoding', {
      inputPath,
      outputPath,
      qualityCount: qualities.length,
      qualities: qualities.map(q => ({ name: q.name, resolution: q.resolution, bitrate: q.bitrate }))
    });

    // Get input video info to filter out impossible qualities
    const videoInfo = await this.getVideoInfo(inputPath);
    const [inputWidth, inputHeight] = videoInfo.resolution.split('x').map(Number);
    
    // Filter qualities that make sense for this input
    const validQualities = qualities.filter(quality => {
      const [targetWidth, targetHeight] = quality.resolution.split('x').map(Number);
      // Include quality if input is larger or equal, or if it's only slightly smaller
      const widthRatio = inputWidth / targetWidth;
      const heightRatio = inputHeight / targetHeight;
      return widthRatio >= 0.8 && heightRatio >= 0.8; // Allow some tolerance
    });

    if (validQualities.length === 0) {
      throw new Error('No valid qualities found for input video resolution');
    }

    if (validQualities.length < qualities.length) {
      logger.info('Filtered out some qualities due to input resolution constraints', {
        originalCount: qualities.length,
        validCount: validQualities.length,
        inputResolution: videoInfo.resolution,
        filteredOut: qualities.filter(q => !validQualities.includes(q)).map(q => q.name)
      });
    }

    // Process qualities sequentially to avoid overwhelming the system
    for (let i = 0; i < validQualities.length; i++) {
      const quality = validQualities[i];
      const baseProgress = (i / validQualities.length) * 100;
      
      try {
        await this.transcodeQuality(
          inputPath,
          outputPath,
          quality,
          (qualityProgress) => {
            const overallProgress = baseProgress + (qualityProgress / validQualities.length);
            if (onProgress) {
              onProgress(Math.round(overallProgress), quality.name);
            }
          }
        );
        
        logger.info(`Completed quality ${quality.name} (${i + 1}/${validQualities.length})`);
        
      } catch (error) {
        logger.error(`Failed to transcode quality ${quality.name}`, {
          error: error instanceof Error ? error.message : 'Unknown error',
          qualityIndex: i + 1,
          totalQualities: validQualities.length
        });
        throw error;
      }
    }

    // Generate comprehensive playlists using HLS service
    const playlistResult = await this.hlsPlaylistService.generatePlaylistsFromSegments(outputPath, validQualities);
    
    logger.info('Multi-quality transcoding completed successfully', {
      inputPath,
      outputPath,
      processedQualities: validQualities.length,
      totalDuration: videoInfo.duration,
      masterPlaylist: playlistResult.masterPlaylist,
      qualityPlaylists: Object.keys(playlistResult.qualityPlaylists)
    });
  }

  async validateTranscodingOutput(outputPath: string, qualities: QualityProfile[]): Promise<{
    valid: boolean;
    issues: string[];
    segmentCounts: Record<string, number>;
  }> {
    const issues: string[] = [];
    const segmentCounts: Record<string, number> = {};
    
    try {
      // Check master playlist
      const masterPlaylistPath = path.join(outputPath, 'master.m3u8');
      if (!(await fs.pathExists(masterPlaylistPath))) {
        issues.push('Master playlist (master.m3u8) not found');
      } else {
        const masterContent = await fs.readFile(masterPlaylistPath, 'utf8');
        if (!masterContent.includes('#EXTM3U')) {
          issues.push('Master playlist has invalid format');
        }
      }

      // Check each quality
      for (const quality of qualities) {
        const qualityPath = path.join(outputPath, quality.name);
        const playlistPath = path.join(qualityPath, 'playlist.m3u8');
        
        if (!(await fs.pathExists(playlistPath))) {
          issues.push(`Playlist for ${quality.name} not found`);
          continue;
        }

        // Count segments
        const segmentCount = await this.countSegments(qualityPath);
        segmentCounts[quality.name] = segmentCount;
        
        if (segmentCount === 0) {
          issues.push(`No segments found for ${quality.name}`);
        }

        // Validate playlist content
        const playlistContent = await fs.readFile(playlistPath, 'utf8');
        if (!playlistContent.includes('#EXTM3U') || !playlistContent.includes('#EXT-X-ENDLIST')) {
          issues.push(`Invalid playlist format for ${quality.name}`);
        }
      }

      return {
        valid: issues.length === 0,
        issues,
        segmentCounts
      };

    } catch (error) {
      return {
        valid: false,
        issues: [`Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
        segmentCounts
      };
    }
  }

  async cleanup(outputPath: string): Promise<void> {
    try {
      if (await fs.pathExists(outputPath)) {
        await fs.remove(outputPath);
        logger.info('Cleaned up transcoding output', { path: outputPath });
      }
    } catch (error) {
      logger.error('Failed to cleanup transcoding output', {
        path: outputPath,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}
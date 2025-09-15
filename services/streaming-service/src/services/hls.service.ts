import { storageService } from './storage.service';
import { cacheService } from './cache.service';
import { config } from '../config';
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

export interface QualityVariant {
  name: string;
  resolution: string;
  bitrate: number;
  bandwidth: number;
}

export class HLSService {
  private readonly qualityVariants: QualityVariant[] = [
    { name: '360p', resolution: '640x360', bitrate: 800, bandwidth: 1000000 },
    { name: '720p', resolution: '1280x720', bitrate: 2500, bandwidth: 3000000 },
    { name: '1080p', resolution: '1920x1080', bitrate: 5000, bandwidth: 6000000 },
  ];

  async getMasterPlaylist(jobId: string): Promise<string> {
    const cacheKey = `master_playlist:${jobId}`;
    
    // Try to get from cache first
    const cached = await cacheService.get(cacheKey);
    if (cached) {
      logger.debug('Serving master playlist from cache', { jobId });
      return cached;
    }

    // Generate master playlist
    const availableQualities = await this.getAvailableQualities(jobId);
    const masterPlaylist = this.generateMasterPlaylist(jobId, availableQualities);

    // Cache the playlist
    await cacheService.set(cacheKey, masterPlaylist, config.cache.playlistTtl);
    
    logger.info('Generated and cached master playlist', { jobId, qualities: availableQualities.length });
    return masterPlaylist;
  }

  async getQualityPlaylist(jobId: string, quality: string): Promise<string> {
    const cacheKey = `quality_playlist:${jobId}:${quality}`;
    
    // Try to get from cache first
    const cached = await cacheService.get(cacheKey);
    if (cached) {
      logger.debug('Serving quality playlist from cache', { jobId, quality });
      return cached;
    }

    // Get playlist from storage
    const playlistPath = `jobs/${jobId}/hls/${quality}/playlist.m3u8`;
    
    if (!(await storageService.objectExists(playlistPath))) {
      throw new Error(`Quality playlist not found: ${quality}`);
    }

    const playlistBuffer = await storageService.getObject(playlistPath);
    const playlist = playlistBuffer.toString('utf-8');

    // Update playlist URLs to point to our streaming endpoints
    const updatedPlaylist = this.updatePlaylistUrls(playlist, jobId, quality);

    // Cache the playlist
    await cacheService.set(cacheKey, updatedPlaylist, config.cache.playlistTtl);
    
    logger.info('Served quality playlist', { jobId, quality });
    return updatedPlaylist;
  }

  async getSegment(jobId: string, quality: string, segmentName: string): Promise<Buffer> {
    const segmentPath = `jobs/${jobId}/hls/${quality}/${segmentName}`;
    
    if (!(await storageService.objectExists(segmentPath))) {
      throw new Error(`Segment not found: ${segmentName}`);
    }

    const segment = await storageService.getObject(segmentPath);
    logger.debug('Served video segment', { jobId, quality, segmentName, size: segment.length });
    
    return segment;
  }

  async getSegmentStream(jobId: string, quality: string, segmentName: string) {
    const segmentPath = `jobs/${jobId}/hls/${quality}/${segmentName}`;
    
    if (!(await storageService.objectExists(segmentPath))) {
      throw new Error(`Segment not found: ${segmentName}`);
    }

    const stream = await storageService.getObjectStream(segmentPath);
    logger.debug('Served video segment stream', { jobId, quality, segmentName });
    
    return stream;
  }

  private async getAvailableQualities(jobId: string): Promise<QualityVariant[]> {
    const availableQualities: QualityVariant[] = [];

    for (const quality of this.qualityVariants) {
      const playlistPath = `jobs/${jobId}/hls/${quality.name}/playlist.m3u8`;
      if (await storageService.objectExists(playlistPath)) {
        availableQualities.push(quality);
      }
    }

    return availableQualities;
  }

  private generateMasterPlaylist(jobId: string, qualities: QualityVariant[]): string {
    let playlist = '#EXTM3U\n#EXT-X-VERSION:3\n\n';

    for (const quality of qualities) {
      playlist += `#EXT-X-STREAM-INF:BANDWIDTH=${quality.bandwidth},RESOLUTION=${quality.resolution}\n`;
      playlist += `/api/v1/stream/${jobId}/${quality.name}/playlist.m3u8\n\n`;
    }

    return playlist;
  }

  private updatePlaylistUrls(playlist: string, jobId: string, quality: string): string {
    // Replace relative segment URLs with absolute URLs pointing to our streaming service
    return playlist.replace(
      /^(segment_\d+\.ts)$/gm,
      `/api/v1/stream/${jobId}/${quality}/$1`
    );
  }

  async invalidateCache(jobId: string, quality?: string): Promise<void> {
    if (quality) {
      await cacheService.del(`quality_playlist:${jobId}:${quality}`);
    } else {
      await cacheService.del(`master_playlist:${jobId}`);
      // Invalidate all quality playlists for this job
      for (const q of this.qualityVariants) {
        await cacheService.del(`quality_playlist:${jobId}:${q.name}`);
      }
    }
    
    logger.info('Invalidated cache', { jobId, quality });
  }
}

export const hlsService = new HLSService();
import * as fs from 'fs-extra';
import * as path from 'path';
import { QualityProfile } from '../types';
import { logger } from '../utils/logger';

export class HLSPlaylistService {
  async generateMasterPlaylist(outputPath: string, qualities: QualityProfile[]): Promise<void> {
    const masterPlaylistContent = this.createMasterPlaylistContent(qualities);
    const masterPlaylistPath = path.join(outputPath, 'master.m3u8');
    
    await fs.ensureDir(outputPath);
    await fs.writeFile(masterPlaylistPath, masterPlaylistContent);
    
    logger.info('Master playlist generated', { path: masterPlaylistPath });
  }

  async generatePlaylistsFromSegments(outputPath: string, qualities: QualityProfile[]): Promise<{
    masterPlaylist: string;
    qualityPlaylists: Record<string, string>;
  }> {
    // Generate master playlist
    await this.generateMasterPlaylist(outputPath, qualities);
    
    const qualityPlaylists: Record<string, string> = {};
    
    // Verify quality playlists exist
    for (const quality of qualities) {
      const qualityPath = path.join(outputPath, quality.name, 'playlist.m3u8');
      if (await fs.pathExists(qualityPath)) {
        qualityPlaylists[quality.name] = qualityPath;
      }
    }
    
    return {
      masterPlaylist: path.join(outputPath, 'master.m3u8'),
      qualityPlaylists
    };
  }

  private createMasterPlaylistContent(qualities: QualityProfile[]): string {
    let content = '#EXTM3U\n#EXT-X-VERSION:3\n';
    
    for (const quality of qualities) {
      content += `#EXT-X-STREAM-INF:BANDWIDTH=${quality.bitrate},RESOLUTION=${quality.resolution}\n`;
      content += `${quality.name}/playlist.m3u8\n`;
    }
    
    return content;
  }
}
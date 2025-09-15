// Basic types for transcoding service
export interface TranscodingJob {
  jobId: string;
  inputPath: string;
  outputPath: string;
  qualities: QualityProfile[];
  userId?: string;
  metadata?: {
    title?: string;
    description?: string;
  };
}

export interface QualityProfile {
  name: string;
  resolution: string;
  bitrate: number;
  fps?: number;
}

export interface JobProgress {
  jobId: string;
  progress: number;
  currentStep: string;
  estimatedTimeRemaining?: number;
}

export interface VideoInfo {
  duration: number;
  resolution: string;
  format: string;
  size: number;
  bitrate?: number;
  fps?: number;
}
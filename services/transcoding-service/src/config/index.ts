export const config = {
  port: parseInt(process.env['PORT'] || '3005'),
  host: process.env['HOST'] || 'localhost',
  redis: {
    url: process.env['REDIS_URL'] || 'redis://localhost:6379'
  },
  transcoding: {
    concurrentJobs: parseInt(process.env['TRANSCODING_CONCURRENT_JOBS'] || '2'),
    segmentDuration: parseInt(process.env['SEGMENT_DURATION'] || '10'),
    outputPath: process.env['TRANSCODING_OUTPUT_PATH'] || './transcoded',
    tempPath: process.env['TRANSCODING_TEMP_PATH'] || './temp'
  },
  storage: {
    uploadPath: process.env['UPLOAD_PATH'] || './uploads'
  }
};
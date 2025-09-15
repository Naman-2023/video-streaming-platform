export const config = {
  port: process.env.STREAMING_SERVICE_PORT || 3004,
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
  },
  storage: {
    type: process.env.STORAGE_TYPE || 'minio',
    endpoint: process.env.STORAGE_ENDPOINT || 'localhost:9000',
    accessKey: process.env.STORAGE_ACCESS_KEY || 'minioadmin',
    secretKey: process.env.STORAGE_SECRET_KEY || 'minioadmin',
    bucket: process.env.STORAGE_BUCKET || 'video-platform',
    useSSL: process.env.STORAGE_USE_SSL === 'true',
  },
  cache: {
    playlistTtl: parseInt(process.env.PLAYLIST_CACHE_TTL || '300'), // 5 minutes
    segmentTtl: parseInt(process.env.SEGMENT_CACHE_TTL || '3600'), // 1 hour
  },
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
  },
  compression: {
    threshold: 1024, // Only compress responses larger than 1KB
    level: 6, // Compression level (1-9)
  },
};
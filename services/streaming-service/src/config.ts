import dotenv from 'dotenv';

dotenv.config();

// Simple config without Joi validation
const envVars = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '3004'),
  HOST: process.env.HOST || 'localhost',
  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
  CORS_ORIGIN: process.env.CORS_ORIGIN || '*',
  CORS_CREDENTIALS: process.env.CORS_CREDENTIALS === 'true',
  COMPRESSION_THRESHOLD: parseInt(process.env.COMPRESSION_THRESHOLD || '1024'),
  COMPRESSION_LEVEL: parseInt(process.env.COMPRESSION_LEVEL || '6'),
  CACHE_TTL: parseInt(process.env.CACHE_TTL || '3600'),
  SEGMENT_CACHE_TTL: parseInt(process.env.SEGMENT_CACHE_TTL || '86400'),
  PLAYLIST_CACHE_TTL: parseInt(process.env.PLAYLIST_CACHE_TTL || '300'),
  MINIO_ENDPOINT: process.env.MINIO_ENDPOINT || 'localhost:9000',
  MINIO_USE_SSL: process.env.MINIO_USE_SSL === 'true',
  MINIO_ACCESS_KEY: process.env.MINIO_ACCESS_KEY || 'minioadmin',
  MINIO_SECRET_KEY: process.env.MINIO_SECRET_KEY || 'minioadmin',
  MINIO_BUCKET: process.env.MINIO_BUCKET || 'video-platform',
};

export const config = {
  env: envVars.NODE_ENV,
  port: envVars.PORT,
  host: envVars.HOST,
  redis: {
    url: envVars.REDIS_URL,
  },
  cors: {
    origin: envVars.CORS_ORIGIN,
    credentials: envVars.CORS_CREDENTIALS,
  },
  compression: {
    threshold: envVars.COMPRESSION_THRESHOLD,
    level: envVars.COMPRESSION_LEVEL,
  },
  cache: {
    ttl: envVars.CACHE_TTL,
    segmentTtl: envVars.SEGMENT_CACHE_TTL,
    playlistTtl: envVars.PLAYLIST_CACHE_TTL,
  },
  storage: {
    endpoint: envVars.MINIO_ENDPOINT,
    useSSL: envVars.MINIO_USE_SSL,
    accessKey: envVars.MINIO_ACCESS_KEY,
    secretKey: envVars.MINIO_SECRET_KEY,
    bucket: envVars.MINIO_BUCKET,
  },
};
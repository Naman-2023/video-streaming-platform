import { jest } from '@jest/globals';

// Mock Redis client
jest.mock('redis', () => ({
  createClient: jest.fn(() => ({
    connect: jest.fn(),
    disconnect: jest.fn(),
    on: jest.fn(),
    get: jest.fn(),
    set: jest.fn(),
    setEx: jest.fn(),
    del: jest.fn(),
    exists: jest.fn(),
  })),
}));

// Mock MinIO client
jest.mock('minio', () => ({
  Client: jest.fn(() => ({
    getObject: jest.fn(),
    statObject: jest.fn(),
  })),
}));

// Mock winston logger
jest.mock('winston', () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  })),
  format: {
    json: jest.fn(),
    simple: jest.fn(),
  },
  transports: {
    Console: jest.fn(),
  },
}));

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.STREAMING_SERVICE_PORT = '3004';
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6379';
process.env.STORAGE_ENDPOINT = 'localhost:9000';
process.env.STORAGE_ACCESS_KEY = 'testkey';
process.env.STORAGE_SECRET_KEY = 'testsecret';
process.env.STORAGE_BUCKET = 'test-bucket';
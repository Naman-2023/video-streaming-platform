import { StorageService } from '../../services/storage.service';
import { Client as MinioClient } from 'minio';

// Mock MinIO client
jest.mock('minio');
jest.mock('@video-platform/shared', () => ({
  config: {
    storage: {
      endpoint: 'http://localhost:9000',
      accessKey: 'test-access-key',
      secretKey: 'test-secret-key',
      buckets: {
        videos: 'test-videos',
        streams: 'test-streams',
      },
    },
  },
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
  InternalServerError: class extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'InternalServerError';
    }
  },
}));

const mockMinioClient = MinioClient as jest.MockedClass<typeof MinioClient>;

describe('StorageService', () => {
  let storageService: StorageService;
  let mockClient: jest.Mocked<MinioClient>;

  beforeEach(() => {
    mockClient = {
      bucketExists: jest.fn(),
      makeBucket: jest.fn(),
      setBucketPolicy: jest.fn(),
      putObject: jest.fn(),
      getObject: jest.fn(),
      statObject: jest.fn(),
      removeObject: jest.fn(),
      presignedGetObject: jest.fn(),
    } as any;

    mockMinioClient.mockImplementation(() => mockClient);
    storageService = new StorageService();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('uploadVideo', () => {
    it('should upload video successfully', async () => {
      const buffer = Buffer.from('test video data');
      const filename = 'test-video.mp4';
      const contentType = 'video/mp4';

      mockClient.putObject.mockResolvedValue({
        etag: 'test-etag',
        versionId: 'test-version',
      });

      const result = await storageService.uploadVideo(buffer, filename, contentType);

      expect(mockClient.putObject).toHaveBeenCalledWith(
        'test-videos',
        expect.stringContaining(filename),
        expect.any(Object), // stream
        buffer.length,
        expect.objectContaining({
          'Content-Type': contentType,
          'Cache-Control': 'max-age=31536000',
        })
      );

      expect(result).toEqual({
        url: expect.stringContaining(filename),
        size: buffer.length,
      });
    });

    it('should handle upload errors', async () => {
      const buffer = Buffer.from('test video data');
      const filename = 'test-video.mp4';
      const contentType = 'video/mp4';

      mockClient.putObject.mockRejectedValue(new Error('Upload failed'));

      await expect(
        storageService.uploadVideo(buffer, filename, contentType)
      ).rejects.toThrow('Video upload failed');
    });
  });

  describe('healthCheck', () => {
    it('should return true when storage is healthy', async () => {
      mockClient.bucketExists.mockResolvedValue(true);

      const result = await storageService.healthCheck();

      expect(result).toBe(true);
      expect(mockClient.bucketExists).toHaveBeenCalledWith('test-videos');
    });

    it('should return false when storage is unhealthy', async () => {
      mockClient.bucketExists.mockRejectedValue(new Error('Connection failed'));

      const result = await storageService.healthCheck();

      expect(result).toBe(false);
    });
  });

  describe('getVideoInfo', () => {
    it('should return video information', async () => {
      const url = 'test-videos/test-video.mp4';
      const mockStat = {
        size: 1024,
        lastModified: new Date('2023-01-01'),
      };

      mockClient.statObject.mockResolvedValue(mockStat as any);

      const result = await storageService.getVideoInfo(url);

      expect(result).toEqual({
        size: 1024,
        lastModified: new Date('2023-01-01'),
      });
      expect(mockClient.statObject).toHaveBeenCalledWith('test-videos', 'test-video.mp4');
    });
  });
});
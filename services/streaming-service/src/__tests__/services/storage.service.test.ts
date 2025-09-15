import { StorageService } from '../../services/storage.service';
import { Client } from 'minio';

// Mock MinIO client
jest.mock('minio');

const MockedClient = Client as jest.MockedClass<typeof Client>;

describe('StorageService', () => {
  let storageService: StorageService;
  let mockMinioClient: jest.Mocked<Client>;

  beforeEach(() => {
    mockMinioClient = {
      getObject: jest.fn(),
      statObject: jest.fn(),
    } as any;

    MockedClient.mockImplementation(() => mockMinioClient);
    storageService = new StorageService();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getObject', () => {
    it('should return buffer from object stream', async () => {
      const testData = 'test file content';
      const mockStream = {
        on: jest.fn((event, callback) => {
          if (event === 'data') {
            callback(Buffer.from(testData));
          } else if (event === 'end') {
            callback();
          }
        }),
      };

      mockMinioClient.getObject.mockResolvedValue(mockStream as any);

      const result = await storageService.getObject('test-object');

      expect(result).toEqual(Buffer.from(testData));
      expect(mockMinioClient.getObject).toHaveBeenCalledWith('video-platform', 'test-object');
    });

    it('should handle stream errors', async () => {
      const mockError = new Error('Stream error');
      const mockStream = {
        on: jest.fn((event, callback) => {
          if (event === 'error') {
            callback(mockError);
          }
        }),
      };

      mockMinioClient.getObject.mockResolvedValue(mockStream as any);

      await expect(storageService.getObject('test-object')).rejects.toThrow('Stream error');
    });

    it('should handle MinIO client errors', async () => {
      const mockError = new Error('MinIO error');
      mockMinioClient.getObject.mockRejectedValue(mockError);

      await expect(storageService.getObject('test-object')).rejects.toThrow('MinIO error');
    });
  });

  describe('getObjectStream', () => {
    it('should return object stream', async () => {
      const mockStream = { pipe: jest.fn() };
      mockMinioClient.getObject.mockResolvedValue(mockStream as any);

      const result = await storageService.getObjectStream('test-object');

      expect(result).toBe(mockStream);
      expect(mockMinioClient.getObject).toHaveBeenCalledWith('video-platform', 'test-object');
    });

    it('should handle MinIO client errors', async () => {
      const mockError = new Error('MinIO error');
      mockMinioClient.getObject.mockRejectedValue(mockError);

      await expect(storageService.getObjectStream('test-object')).rejects.toThrow('MinIO error');
    });
  });

  describe('objectExists', () => {
    it('should return true when object exists', async () => {
      mockMinioClient.statObject.mockResolvedValue({} as any);

      const result = await storageService.objectExists('test-object');

      expect(result).toBe(true);
      expect(mockMinioClient.statObject).toHaveBeenCalledWith('video-platform', 'test-object');
    });

    it('should return false when object does not exist', async () => {
      mockMinioClient.statObject.mockRejectedValue(new Error('Object not found'));

      const result = await storageService.objectExists('test-object');

      expect(result).toBe(false);
    });
  });

  describe('getObjectStat', () => {
    it('should return object statistics', async () => {
      const mockStat = {
        size: 1024,
        lastModified: new Date(),
        etag: 'test-etag',
      };
      mockMinioClient.statObject.mockResolvedValue(mockStat as any);

      const result = await storageService.getObjectStat('test-object');

      expect(result).toBe(mockStat);
      expect(mockMinioClient.statObject).toHaveBeenCalledWith('video-platform', 'test-object');
    });

    it('should handle MinIO client errors', async () => {
      const mockError = new Error('MinIO error');
      mockMinioClient.statObject.mockRejectedValue(mockError);

      await expect(storageService.getObjectStat('test-object')).rejects.toThrow('MinIO error');
    });
  });
});
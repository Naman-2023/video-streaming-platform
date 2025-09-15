import { CacheService } from '../../services/cache.service';
import { createClient } from 'redis';

// Mock Redis client
jest.mock('redis');

const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>;

describe('CacheService', () => {
  let cacheService: CacheService;
  let mockRedisClient: any;

  beforeEach(() => {
    mockRedisClient = {
      connect: jest.fn(),
      disconnect: jest.fn(),
      on: jest.fn(),
      get: jest.fn(),
      set: jest.fn(),
      setEx: jest.fn(),
      del: jest.fn(),
      exists: jest.fn(),
    };

    mockCreateClient.mockReturnValue(mockRedisClient);
    cacheService = new CacheService();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('connect', () => {
    it('should connect to Redis when not connected', async () => {
      mockRedisClient.connect.mockResolvedValue(undefined);

      await cacheService.connect();

      expect(mockRedisClient.connect).toHaveBeenCalled();
    });

    it('should not connect when already connected', async () => {
      // Simulate connection event
      const onCall = mockRedisClient.on.mock.calls.find(call => call[0] === 'connect');
      if (onCall) onCall[1]();

      await cacheService.connect();

      expect(mockRedisClient.connect).not.toHaveBeenCalled();
    });
  });

  describe('disconnect', () => {
    it('should disconnect from Redis when connected', async () => {
      // Simulate connection
      const onCall = mockRedisClient.on.mock.calls.find(call => call[0] === 'connect');
      if (onCall) onCall[1]();

      mockRedisClient.disconnect.mockResolvedValue(undefined);

      await cacheService.disconnect();

      expect(mockRedisClient.disconnect).toHaveBeenCalled();
    });
  });

  describe('get', () => {
    it('should return value when connected and key exists', async () => {
      // Simulate connection
      const onCall = mockRedisClient.on.mock.calls.find(call => call[0] === 'connect');
      if (onCall) onCall[1]();

      mockRedisClient.get.mockResolvedValue('test-value');

      const result = await cacheService.get('test-key');

      expect(result).toBe('test-value');
      expect(mockRedisClient.get).toHaveBeenCalledWith('test-key');
    });

    it('should return null when not connected', async () => {
      const result = await cacheService.get('test-key');

      expect(result).toBeNull();
      expect(mockRedisClient.get).not.toHaveBeenCalled();
    });

    it('should return null when Redis operation fails', async () => {
      // Simulate connection
      const onCall = mockRedisClient.on.mock.calls.find(call => call[0] === 'connect');
      if (onCall) onCall[1]();

      mockRedisClient.get.mockRejectedValue(new Error('Redis error'));

      const result = await cacheService.get('test-key');

      expect(result).toBeNull();
    });
  });

  describe('set', () => {
    it('should set value without TTL when connected', async () => {
      // Simulate connection
      const onCall = mockRedisClient.on.mock.calls.find(call => call[0] === 'connect');
      if (onCall) onCall[1]();

      mockRedisClient.set.mockResolvedValue('OK');

      await cacheService.set('test-key', 'test-value');

      expect(mockRedisClient.set).toHaveBeenCalledWith('test-key', 'test-value');
      expect(mockRedisClient.setEx).not.toHaveBeenCalled();
    });

    it('should set value with TTL when connected', async () => {
      // Simulate connection
      const onCall = mockRedisClient.on.mock.calls.find(call => call[0] === 'connect');
      if (onCall) onCall[1]();

      mockRedisClient.setEx.mockResolvedValue('OK');

      await cacheService.set('test-key', 'test-value', 300);

      expect(mockRedisClient.setEx).toHaveBeenCalledWith('test-key', 300, 'test-value');
      expect(mockRedisClient.set).not.toHaveBeenCalled();
    });

    it('should not set when not connected', async () => {
      await cacheService.set('test-key', 'test-value');

      expect(mockRedisClient.set).not.toHaveBeenCalled();
      expect(mockRedisClient.setEx).not.toHaveBeenCalled();
    });

    it('should handle Redis operation errors gracefully', async () => {
      // Simulate connection
      const onCall = mockRedisClient.on.mock.calls.find(call => call[0] === 'connect');
      if (onCall) onCall[1]();

      mockRedisClient.set.mockRejectedValue(new Error('Redis error'));

      await expect(cacheService.set('test-key', 'test-value')).resolves.not.toThrow();
    });
  });

  describe('del', () => {
    it('should delete key when connected', async () => {
      // Simulate connection
      const onCall = mockRedisClient.on.mock.calls.find(call => call[0] === 'connect');
      if (onCall) onCall[1]();

      mockRedisClient.del.mockResolvedValue(1);

      await cacheService.del('test-key');

      expect(mockRedisClient.del).toHaveBeenCalledWith('test-key');
    });

    it('should not delete when not connected', async () => {
      await cacheService.del('test-key');

      expect(mockRedisClient.del).not.toHaveBeenCalled();
    });
  });

  describe('exists', () => {
    it('should return true when key exists and connected', async () => {
      // Simulate connection
      const onCall = mockRedisClient.on.mock.calls.find(call => call[0] === 'connect');
      if (onCall) onCall[1]();

      mockRedisClient.exists.mockResolvedValue(1);

      const result = await cacheService.exists('test-key');

      expect(result).toBe(true);
      expect(mockRedisClient.exists).toHaveBeenCalledWith('test-key');
    });

    it('should return false when key does not exist', async () => {
      // Simulate connection
      const onCall = mockRedisClient.on.mock.calls.find(call => call[0] === 'connect');
      if (onCall) onCall[1]();

      mockRedisClient.exists.mockResolvedValue(0);

      const result = await cacheService.exists('test-key');

      expect(result).toBe(false);
    });

    it('should return false when not connected', async () => {
      const result = await cacheService.exists('test-key');

      expect(result).toBe(false);
      expect(mockRedisClient.exists).not.toHaveBeenCalled();
    });
  });
});
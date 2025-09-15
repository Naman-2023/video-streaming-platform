import { Client } from 'minio';
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

export class StorageService {
  private client: Client;

  constructor() {
    this.client = new Client({
      endPoint: config.storage.endpoint.split(':')[0],
      port: parseInt(config.storage.endpoint.split(':')[1] || '9000'),
      useSSL: config.storage.useSSL,
      accessKey: config.storage.accessKey,
      secretKey: config.storage.secretKey,
    });
  }

  async getObject(objectName: string): Promise<Buffer> {
    try {
      const stream = await this.client.getObject(config.storage.bucket, objectName);
      const chunks: Buffer[] = [];
      
      return new Promise((resolve, reject) => {
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('end', () => resolve(Buffer.concat(chunks)));
        stream.on('error', reject);
      });
    } catch (error) {
      logger.error('Failed to get object from storage', { objectName, error });
      throw error;
    }
  }

  async getObjectStream(objectName: string) {
    try {
      return await this.client.getObject(config.storage.bucket, objectName);
    } catch (error) {
      logger.error('Failed to get object stream from storage', { objectName, error });
      throw error;
    }
  }

  async objectExists(objectName: string): Promise<boolean> {
    try {
      await this.client.statObject(config.storage.bucket, objectName);
      return true;
    } catch (error) {
      return false;
    }
  }

  async getObjectStat(objectName: string) {
    try {
      return await this.client.statObject(config.storage.bucket, objectName);
    } catch (error) {
      logger.error('Failed to get object stat from storage', { objectName, error });
      throw error;
    }
  }
}

export const storageService = new StorageService();
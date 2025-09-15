import express, { Application } from 'express';
import { logger } from '@video-platform/shared';
import { userMiddleware } from './user';

export function setupMiddleware(app: Application): void {
  // Body parsing
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // User context middleware (extracts user info from headers set by API Gateway)
  app.use(userMiddleware);

  logger.info('✅ Upload service middleware setup completed');
}

export * from './user';
export * from './upload';
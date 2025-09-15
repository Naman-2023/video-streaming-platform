import { Request, Response, NextFunction } from 'express';
import { logger } from '@video-platform/shared';

export interface UserRequest extends Request {
  user?: {
    id: string;
    email: string;
  };
}

export const userMiddleware = (req: UserRequest, res: Response, next: NextFunction): void => {
  // Extract user information from headers set by API Gateway
  const userId = req.headers['x-user-id'] as string;
  const userEmail = req.headers['x-user-email'] as string;

  if (userId && userEmail) {
    req.user = {
      id: userId,
      email: userEmail,
    };

    logger.debug('User context extracted', {
      userId,
      userEmail,
      path: req.path,
    });
  }

  next();
};
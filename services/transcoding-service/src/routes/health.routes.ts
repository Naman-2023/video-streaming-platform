import { Router } from 'express';

export const healthRoutes = Router();

healthRoutes.get('/', (req, res) => {
  res.json({
    service: 'transcoding-service',
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});
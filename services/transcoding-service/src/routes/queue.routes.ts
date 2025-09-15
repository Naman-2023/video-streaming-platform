import { Router } from 'express';
import { TranscodingQueue } from '../queue/transcoding-queue';

export const queueRoutes = (queue: TranscodingQueue) => {
  const router = Router();

  router.get('/status', async (req, res) => {
    try {
      const counts = await queue.getJobCounts();
      res.json({
        success: true,
        data: counts,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  router.post('/job', async (req, res) => {
    try {
      const job = await queue.addJob(req.body);
      res.json({
        success: true,
        data: { jobId: job.id },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  return router;
};
import { Router } from 'express';
import mongoose from 'mongoose';

export const healthRouter = Router();

/**
 * The endpoint a deploy checks. It reports the database state rather than only
 * that the process is up, because a server that cannot reach Mongo is not healthy.
 */
healthRouter.get('/health', (req, res) => {
  const dbState = mongoose.connection.readyState; // 1 = connected
  const healthy = dbState === 1;
  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'degraded',
    db: healthy ? 'connected' : 'disconnected',
    uptimeSeconds: Math.round(process.uptime()),
  });
});

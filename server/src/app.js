import express from 'express';
import cors from 'cors';
import { config } from './config/env.js';
import { healthRouter } from './routes/health.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';

export function createApp() {
  const app = express();

  app.use(cors({ origin: config.corsOrigin, credentials: true }));
  app.use(express.json({ limit: '1mb' }));

  app.use('/api', healthRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { config } from './config/env.js';
import { healthRouter } from './routes/health.js';
import { authRouter } from './routes/auth.js';
import { usersRouter } from './routes/users.js';
import { authenticate } from './middleware/authenticate.js';
import { csrfProtection } from './middleware/csrf.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';

export function createApp() {
  const app = express();

  app.use(cors({ origin: config.corsOrigin, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  // ---------------------------------------------------------------------------------------
  // The opt-out list (BE-01-05 AC-2). These are the ONLY routes reachable without a session.
  // Everything mounted after `authenticate` is protected by default, so a new router added
  // below inherits protection rather than needing to remember it.
  // ---------------------------------------------------------------------------------------
  app.use('/api', healthRouter);
  app.use('/api', authRouter);

  app.use('/api', authenticate);
  app.use('/api', csrfProtection);

  app.use('/api', usersRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

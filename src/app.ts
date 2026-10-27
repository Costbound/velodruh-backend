import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { env } from './config/env.js';
import {
  errorHandler,
  notFoundHandler,
  requestIdMiddleware,
} from './middlewares/error-handler.js';
import apiRouter from './routes/api.router.js';
import docsRouter from './routes/docs.route.js';
import healthRouter from './routes/health.route.js';

export function createApp(): Express {
  const app = express();

  const allowedOrigins = env.CORS_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.use(helmet());
  app.use(
    cors({
      origin: allowedOrigins.length > 0 ? allowedOrigins : true,
      credentials: true,
    }),
  );
  app.use(requestIdMiddleware);
  app.use(express.json());

  app.use('/health', healthRouter);
  app.use(docsRouter);
  app.use('/api/v1', apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export default createApp;

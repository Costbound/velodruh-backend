import express, { Express, NextFunction, Request, Response } from 'express';
import healthRouter from './routes/health.route.js';

export function createApp(): Express {
  const app = express();

  app.use(express.json());

  app.use('/health', healthRouter);

  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'Not Found' });
  });

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  });

  return app;
}

export default createApp;

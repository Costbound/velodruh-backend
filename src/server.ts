import 'dotenv/config';
import { createApp } from './app.js';
import { env } from './config/env.js';

const app = createApp();

const server = app.listen(env.PORT, () => {
  console.log(`Server listening on http://localhost:${env.PORT}`);
  console.log(`Swagger UI available at http://localhost:${env.PORT}/api-docs`);
});

function shutdown(signal: string): void {
  console.log(`Received ${signal}. Shutting down gracefully...`);
  server.close(() => {
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

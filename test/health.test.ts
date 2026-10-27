import { createApp } from '../src/app.js';
import { invokeApp } from './helpers/test-client.js';

describe('Health, Docs & Core Middleware', () => {
  const app = createApp();

  it('GET /health returns 200 and { status: "ok" } with x-request-id header', async () => {
    const response = await invokeApp<{ status: string }>(app, {
      method: 'GET',
      path: '/health',
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
    expect(typeof response.headers['x-request-id']).toBe('string');
  });

  it('preserves incoming x-request-id header when provided', async () => {
    const customId = 'custom-trace-id-123';
    const response = await invokeApp<{ status: string }>(app, {
      method: 'GET',
      path: '/health',
      headers: { 'x-request-id': customId },
    });

    expect(response.status).toBe(200);
    expect(response.headers['x-request-id']).toBe(customId);
  });

  it('GET /api-docs.json returns OpenAPI 3.1.0 specification', async () => {
    const response = await invokeApp<{
      openapi: string;
      info: { title: string; version: string };
      paths: Record<string, unknown>;
    }>(app, {
      method: 'GET',
      path: '/api-docs.json',
    });

    expect(response.status).toBe(200);
    expect(response.body.openapi).toBe('3.1.0');
    expect(response.body.info.title).toBe('VeloDruh API');
    expect(response.body.paths['/api/v1/wizard/meta']).toBeDefined();
    expect(response.body.paths['/api/v1/wizard/evaluate']).toBeDefined();
    expect(response.body.paths['/api/v1/bikes/{slug}']).toBeDefined();
  });

  it('returns 404 NOT_FOUND for unknown routes', async () => {
    const response = await invokeApp<{ error: string; code: string }>(app, {
      method: 'GET',
      path: '/does-not-exist',
    });

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('NOT_FOUND');
  });
});

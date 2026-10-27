import request from 'supertest';
import { createApp } from '../src/app.js';

describe('GET /health', () => {
  it('returns status ok', async () => {
    const app = createApp();

    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });
});

describe('unknown routes', () => {
  it('returns 404', async () => {
    const app = createApp();

    const response = await request(app).get('/does-not-exist');

    expect(response.status).toBe(404);
  });
});

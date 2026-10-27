import { createApp } from '../src/app.js';
import type { BikeDetailDto } from '../src/schemas/bike.schema.js';
import { invokeApp } from './helpers/test-client.js';

describe('Bikes Catalog & Deep-Dive Endpoints', () => {
  const app = createApp();

  it('GET /api/v1/bikes returns all bikes in the catalog', async () => {
    const response = await invokeApp<{ items: BikeDetailDto[]; total: number }>(app, {
      method: 'GET',
      path: '/api/v1/bikes',
    });

    expect(response.status).toBe(200);
    expect(response.body.total).toBeGreaterThanOrEqual(6);
    expect(response.body.items.length).toBe(response.body.total);
  });

  it('GET /api/v1/bikes filters by category and price range', async () => {
    const response = await invokeApp<{ items: BikeDetailDto[]; total: number }>(app, {
      method: 'GET',
      path: '/api/v1/bikes?category=GRAVEL&maxPriceUah=40000',
    });

    expect(response.status).toBe(200);
    expect(response.body.items.length).toBe(1);
    expect(response.body.items[0]?.slug).toBe('pride-rocx-8-2-2025');
  });

  it('GET /api/v1/bikes/:slug returns full specification, geometry, and shop offers', async () => {
    const response = await invokeApp<BikeDetailDto>(app, {
      method: 'GET',
      path: '/api/v1/bikes/pride-rocx-8-2-2025',
    });

    expect(response.status).toBe(200);
    expect(response.body.slug).toBe('pride-rocx-8-2-2025');
    expect(response.body.brand.name).toBe('Pride');
    expect(response.body.variants.length).toBeGreaterThanOrEqual(3);
    expect(response.body.variants[0]?.offers.length).toBeGreaterThanOrEqual(1);
  });

  it('GET /api/v1/bikes/:slug returns 404 NOT_FOUND for unknown bike slug', async () => {
    const response = await invokeApp<{ error: string; code: string }>(app, {
      method: 'GET',
      path: '/api/v1/bikes/non-existent-bike-slug',
    });

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('NOT_FOUND');
  });
});


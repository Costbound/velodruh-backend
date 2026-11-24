import type { Request, Response } from 'express';
import { bikeListQuerySchema, bikeSlugParamsSchema } from '../schemas/bike.schema.js';
import { getBikeBySlug, listBikes } from '../services/bikes.service.js';
import { getCatalogBikes } from '../services/catalog.repository.js';

export async function handleListBikes(req: Request, res: Response): Promise<void> {
  const query = bikeListQuerySchema.parse(req.query);
  const catalog = await getCatalogBikes();
  const bikes = listBikes(query, catalog);
  res.status(200).json({
    items: bikes,
    total: bikes.length,
    appliedFilters: query,
  });
}

export async function handleGetBikeBySlug(req: Request, res: Response): Promise<void> {
  const { slug } = bikeSlugParamsSchema.parse(req.params);
  const catalog = await getCatalogBikes();
  const bike = getBikeBySlug(slug, catalog);
  res.status(200).json(bike);
}

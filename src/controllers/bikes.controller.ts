import type { Request, Response } from 'express';
import { getBikeBySlug, listBikes } from '../services/bikes.service.js';
import { bikeListQuerySchema, bikeSlugParamsSchema } from '../schemas/bike.schema.js';

export function handleListBikes(req: Request, res: Response): void {
  const query = bikeListQuerySchema.parse(req.query);
  const bikes = listBikes(query);
  res.status(200).json({ items: bikes, total: bikes.length });
}

export function handleGetBikeBySlug(req: Request, res: Response): void {
  const { slug } = bikeSlugParamsSchema.parse(req.params);
  const bike = getBikeBySlug(slug);
  res.status(200).json(bike);
}


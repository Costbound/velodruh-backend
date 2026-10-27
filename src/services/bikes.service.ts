import { AppError } from '../middlewares/app-error.js';
import type { BikeDetailDto, BikeListQuery } from '../schemas/bike.schema.js';
import { CATALOG_BIKES } from './catalog.data.js';

export function listBikes(query: BikeListQuery = {}): BikeDetailDto[] {
  return CATALOG_BIKES.filter((bike) => {
    if (query.category !== undefined && bike.category !== query.category) {
      return false;
    }
    if (query.minPriceUah !== undefined && bike.bestPriceUah < query.minPriceUah) {
      return false;
    }
    if (query.maxPriceUah !== undefined && bike.bestPriceUah > query.maxPriceUah) {
      return false;
    }
    return true;
  });
}

export function getBikeBySlug(slug: string): BikeDetailDto {
  const bike = CATALOG_BIKES.find((item) => item.slug === slug);
  if (!bike) {
    throw AppError.notFound(`Bike with slug "${slug}" not found`);
  }
  return bike;
}


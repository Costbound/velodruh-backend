import { AppError } from '../middlewares/app-error.js';
import type { BikeDetailDto, BikeListQuery } from '../schemas/bike.schema.js';
import { CATALOG_BIKES } from './catalog.data.js';

export function listBikes(query: Partial<BikeListQuery> = {}): BikeDetailDto[] {
  const filtered = CATALOG_BIKES.filter((bike) => {
    if (query.category !== undefined && bike.category !== query.category) {
      return false;
    }

    if (query.brand !== undefined) {
      const targetBrand = query.brand.toLowerCase();
      if (
        bike.brand.slug.toLowerCase() !== targetBrand &&
        bike.brand.name.toLowerCase() !== targetBrand
      ) {
        return false;
      }
    }

    if (
      query.gender !== undefined &&
      bike.gender !== query.gender &&
      bike.gender !== 'UNISEX'
    ) {
      return false;
    }

    if (query.minPriceUah !== undefined && bike.bestPriceUah < query.minPriceUah) {
      return false;
    }

    if (query.maxPriceUah !== undefined && bike.bestPriceUah > query.maxPriceUah) {
      return false;
    }

    if (
      query.brakeType !== undefined &&
      query.brakeType.length > 0 &&
      !query.brakeType.includes(bike.specs.brakeType)
    ) {
      return false;
    }

    if (query.frameMaterial !== undefined && bike.specs.frameMaterial !== query.frameMaterial) {
      return false;
    }

    if (query.ridingPosition !== undefined && bike.specs.ridingPosition !== query.ridingPosition) {
      return false;
    }

    if (query.wheelSize !== undefined && bike.specs.wheelSize !== query.wheelSize) {
      return false;
    }

    if (query.hasRackMounts !== undefined && bike.specs.hasRackMounts !== query.hasRackMounts) {
      return false;
    }

    if (
      query.hasFenderMounts !== undefined &&
      bike.specs.hasFenderMounts !== query.hasFenderMounts
    ) {
      return false;
    }

    if (query.suspensionFork !== undefined && bike.specs.suspensionFork !== query.suspensionFork) {
      return false;
    }

    if (query.maxWeightKg !== undefined && bike.specs.weightKg > query.maxWeightKg) {
      return false;
    }

    // Variant-level filters (sizeLabel, riderHeightCm, inStockOnly)
    const matchingVariants = bike.variants.filter((variant) => {
      if (query.sizeLabel !== undefined && variant.sizeLabel !== query.sizeLabel) {
        return false;
      }
      if (
        query.riderHeightCm !== undefined &&
        (query.riderHeightCm < variant.minRiderHeightCm ||
          query.riderHeightCm > variant.maxRiderHeightCm)
      ) {
        return false;
      }
      if (query.inStockOnly === true && !variant.offers.some((offer) => offer.inStock)) {
        return false;
      }
      return true;
    });

    if (
      (query.sizeLabel !== undefined ||
        query.riderHeightCm !== undefined ||
        query.inStockOnly === true) &&
      matchingVariants.length === 0
    ) {
      return false;
    }

    return true;
  });

  const sortBy = query.sortBy ?? 'price_asc';
  return [...filtered].sort((a, b) => {
    switch (sortBy) {
      case 'price_asc':
        return a.bestPriceUah - b.bestPriceUah;
      case 'price_desc':
        return b.bestPriceUah - a.bestPriceUah;
      case 'weight_asc':
        return a.specs.weightKg - b.specs.weightKg;
      case 'year_desc':
        return b.modelYear - a.modelYear || a.bestPriceUah - b.bestPriceUah;
    }
  });
}

export function getBikeBySlug(slug: string): BikeDetailDto {
  const bike = CATALOG_BIKES.find((item) => item.slug === slug);
  if (!bike) {
    throw AppError.notFound(`Bike with slug "${slug}" not found`);
  }
  return bike;
}

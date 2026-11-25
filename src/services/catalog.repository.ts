import { env } from '../config/env.js';
import { db } from '../prisma/db.js';
import type { BikeDetailDto } from '../schemas/bike.schema.js';
import type { BikeCategoryType, FrameSizeLabelType } from '../schemas/wizard.schema.js';
import { CATALOG_BIKES } from './catalog.data.js';

const DEFAULT_WEIGHT_BY_CATEGORY: Record<BikeCategoryType, number> = {
  ROAD: 9.8,
  GRAVEL: 10.9,
  TOURING: 12.6,
  CITY_COMMUTER: 11.8,
  HYBRID: 13.0,
  MTB_HARDTAIL: 13.8,
};

const VALID_SIZE_LABELS = new Set<FrameSizeLabelType>(['XS', 'S', 'M', 'L', 'XL']);

function coerceSizeLabel(raw: string): FrameSizeLabelType {
  const upper = raw.trim().toUpperCase() as FrameSizeLabelType;
  return VALID_SIZE_LABELS.has(upper) ? upper : 'M';
}

/** Loads the complete bike catalog from PostgreSQL via Prisma ORM v8 and maps to `BikeDetailDto[]`. */
export async function fetchCatalogFromPostgres(client: typeof db = db): Promise<BikeDetailDto[]> {
  const rows = await client.orm.public.Bike.include('brand')
    .include('variants', (variant) =>
      variant.include('offers', (offer) => offer.include('shop')),
    )
    .all();

  return rows.map((bike): BikeDetailDto => {
    const variants = bike.variants.map((variant) => ({
      sizeLabel: coerceSizeLabel(variant.sizeLabel),
      numericSizeCm: variant.numericSizeCm ?? 54,
      minRiderHeightCm: variant.minRiderHeightCm,
      maxRiderHeightCm: variant.maxRiderHeightCm,
      minInseamCm: variant.minInseamCm ?? 76,
      maxInseamCm: variant.maxInseamCm ?? 86,
      stackMm: variant.stackMm ?? 0,
      reachMm: variant.reachMm ?? 0,
      offers: variant.offers.map((offer) => ({
        shopName: offer.shop.name,
        shopSlug: offer.shop.slug,
        priceUah: offer.priceUah,
        oldPriceUah: offer.oldPriceUah,
        inStock: offer.inStock,
        productUrl: offer.productUrl,
        affiliateUrl: offer.affiliateUrl,
        lastCheckedAt: offer.lastCheckedAt,
      })),
    }));

    const allOffers = variants.flatMap((v) => v.offers);
    const inStockOffers = allOffers.filter((o) => o.inStock);
    const pricePool = inStockOffers.length > 0 ? inStockOffers : allOffers;
    const bestPriceUah =
      pricePool.length > 0 ? Math.min(...pricePool.map((o) => o.priceUah)) : 0;

    return {
      slug: bike.slug,
      name: bike.name,
      brand: {
        slug: bike.brand.slug,
        name: bike.brand.name,
        logoUrl: bike.brand.logoUrl,
        country: bike.brand.country,
      },
      category: bike.category,
      modelYear: bike.modelYear,
      description: bike.description ?? '',
      gender: bike.gender,
      specs: {
        brakeType: bike.brakeType,
        drivetrain: bike.drivetrain,
        wheelSize: bike.wheelSize,
        weightKg: bike.weightKg ?? DEFAULT_WEIGHT_BY_CATEGORY[bike.category],
        frameMaterial: bike.frameMaterial,
        ridingPosition: bike.ridingPosition,
        hasRackMounts: bike.hasRackMounts,
        hasFenderMounts: bike.hasFenderMounts,
        suspensionFork: bike.suspensionFork,
      },
      surfaceProfile: {
        asphaltScore: bike.asphaltScore,
        gravelScore: bike.gravelScore,
        offroadScore: bike.offroadScore,
      },
      imageUrl: bike.imageUrl,
      keyHighlights: [...bike.keyHighlights],
      bestPriceUah,
      variants,
    };
  });
}

/**
 * Returns the active bike catalog based on `CATALOG_SOURCE` (`memory` by default,
 * or `postgres` to query data populated by the ETL pipeline).
 */
export async function getCatalogBikes(): Promise<BikeDetailDto[]> {
  if (env.CATALOG_SOURCE === 'postgres') {
    return await fetchCatalogFromPostgres();
  }
  return CATALOG_BIKES;
}

import { z } from 'zod';
import { bikeCategoryEnum, riderGenderEnum, ridingPositionEnum } from './wizard.schema.js';

export const bikeSlugParamsSchema = z.object({
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
});

export const bikeListQuerySchema = z.object({
  category: bikeCategoryEnum.optional(),
  minPriceUah: z.coerce.number().int().nonnegative().optional(),
  maxPriceUah: z.coerce.number().int().positive().optional(),
});

export type BikeSlugParams = z.infer<typeof bikeSlugParamsSchema>;
export type BikeListQuery = z.infer<typeof bikeListQuerySchema>;

export interface BikeOfferDto {
  shopName: string;
  shopSlug: string;
  priceUah: number;
  oldPriceUah: number | null;
  inStock: boolean;
  productUrl: string;
  affiliateUrl: string;
  lastCheckedAt: string;
}

export interface BikeVariantDto {
  sizeLabel: 'XS' | 'S' | 'M' | 'L' | 'XL';
  numericSizeCm: number;
  minRiderHeightCm: number;
  maxRiderHeightCm: number;
  minInseamCm: number;
  maxInseamCm: number;
  stackMm: number;
  reachMm: number;
  offers: BikeOfferDto[];
}

export interface BikeDetailDto {
  slug: string;
  name: string;
  brand: {
    slug: string;
    name: string;
    logoUrl: string | null;
    country: string | null;
  };
  category: z.infer<typeof bikeCategoryEnum>;
  modelYear: number;
  description: string;
  gender: z.infer<typeof riderGenderEnum>;
  specs: {
    brakeType: 'HYDRAULIC_DISC' | 'MECHANICAL_DISC' | 'RIM';
    drivetrain: string;
    wheelSize: string;
    weightKg: number;
    frameMaterial: 'ALUMINUM' | 'CARBON' | 'STEEL';
    ridingPosition: z.infer<typeof ridingPositionEnum>;
    hasRackMounts: boolean;
    hasFenderMounts: boolean;
    suspensionFork: boolean;
  };
  surfaceProfile: {
    asphaltScore: number;
    gravelScore: number;
    offroadScore: number;
  };
  imageUrl: string | null;
  keyHighlights: string[];
  bestPriceUah: number;
  variants: BikeVariantDto[];
}

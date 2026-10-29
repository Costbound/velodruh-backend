import { z } from 'zod';
import {
  bikeCategoryEnum,
  brakeTypeEnum,
  frameMaterialEnum,
  frameSizeLabelEnum,
  riderGenderEnum,
  ridingPositionEnum,
  type BrakeType,
} from './wizard.schema.js';

const booleanQuerySchema = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((val) => val === true || val === 'true' || val === '1');

const commaSeparatedBrakeTypesSchema = z
  .union([z.array(brakeTypeEnum), brakeTypeEnum, z.string()])
  .transform((val): BrakeType[] => {
    if (Array.isArray(val)) {
      return val;
    }
    const items = val
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return z.array(brakeTypeEnum).parse(items);
  });

export const bikeSortByEnum = z.enum(['price_asc', 'price_desc', 'weight_asc', 'year_desc']);

export const bikeSlugParamsSchema = z.object({
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
});

export const bikeListQuerySchema = z.object({
  category: bikeCategoryEnum.optional(),
  brand: z.string().trim().min(1).optional(),
  sizeLabel: frameSizeLabelEnum.optional(),
  riderHeightCm: z.coerce.number().int().min(140).max(215).optional(),
  gender: riderGenderEnum.optional(),
  minPriceUah: z.coerce.number().int().nonnegative().optional(),
  maxPriceUah: z.coerce.number().int().positive().optional(),
  brakeType: commaSeparatedBrakeTypesSchema.optional(),
  frameMaterial: frameMaterialEnum.optional(),
  ridingPosition: ridingPositionEnum.optional(),
  wheelSize: z.string().trim().min(1).optional(),
  hasRackMounts: booleanQuerySchema.optional(),
  hasFenderMounts: booleanQuerySchema.optional(),
  suspensionFork: booleanQuerySchema.optional(),
  maxWeightKg: z.coerce.number().positive().optional(),
  inStockOnly: booleanQuerySchema.optional(),
  sortBy: bikeSortByEnum.default('price_asc'),
});

export type BikeSlugParams = z.infer<typeof bikeSlugParamsSchema>;
export type BikeListQuery = z.infer<typeof bikeListQuerySchema>;
export type BikeSortBy = z.infer<typeof bikeSortByEnum>;

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
  sizeLabel: z.infer<typeof frameSizeLabelEnum>;
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
    brakeType: z.infer<typeof brakeTypeEnum>;
    drivetrain: string;
    wheelSize: string;
    weightKg: number;
    frameMaterial: z.infer<typeof frameMaterialEnum>;
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

import { z } from 'zod';

export const bikeCategoryEnum = z.enum([
  'GRAVEL',
  'ROAD',
  'MTB_HARDTAIL',
  'CITY_COMMUTER',
  'TOURING',
  'HYBRID',
]);

export const riderGenderEnum = z.enum(['UNISEX', 'MALE', 'FEMALE']);

export const ridingPositionEnum = z.enum(['SPORT', 'COMFORTABLE', 'UPRIGHT']);

export const frameSizeLabelEnum = z.enum(['XS', 'S', 'M', 'L', 'XL']);

export const brakeTypeEnum = z.enum(['HYDRAULIC_DISC', 'MECHANICAL_DISC', 'RIM']);

export const frameMaterialEnum = z.enum(['ALUMINUM', 'CARBON', 'STEEL']);

export const primaryGoalEnum = z.enum(['commuting', 'fitness', 'touring', 'recreation']);

export const requiredFeatureEnum = z.enum([
  'RACK_MOUNTS',
  'FENDER_MOUNTS',
  'DISC_BRAKES',
  'HYDRAULIC_BRAKES',
  'SUSPENSION_FORK',
]);

export const wizardEvaluateRequestSchema = z.object({
  rider: z.object({
    heightCm: z.number().int().min(140).max(215),
    inseamCm: z.number().int().min(60).max(110).optional(),
    gender: riderGenderEnum.default('UNISEX'),
  }),
  budget: z
    .object({
      minUah: z.number().int().min(5000).max(300000),
      maxUah: z.number().int().min(5000).max(300000),
    })
    .refine((b) => b.maxUah >= b.minUah, {
      message: 'maxUah must be greater than or equal to minUah',
      path: ['maxUah'],
    }),
  usage: z.object({
    surfaceProportions: z
      .object({
        asphalt: z.number().min(0).max(100),
        gravel: z.number().min(0).max(100),
        offroad: z.number().min(0).max(100),
      })
      .refine((s) => Math.round(s.asphalt + s.gravel + s.offroad) === 100, {
        message: 'Surface proportions (asphalt + gravel + offroad) must sum to 100',
        path: ['asphalt'],
      }),
    ridingPosition: ridingPositionEnum.default('COMFORTABLE'),
    primaryGoal: primaryGoalEnum,
    featuresRequired: z.array(requiredFeatureEnum).default([]),
  }),
});

export type WizardEvaluateRequest = z.infer<typeof wizardEvaluateRequestSchema>;
export type BikeCategoryType = z.infer<typeof bikeCategoryEnum>;
export type RiderGenderType = z.infer<typeof riderGenderEnum>;
export type RidingPositionType = z.infer<typeof ridingPositionEnum>;
export type FrameSizeLabelType = z.infer<typeof frameSizeLabelEnum>;
export type BrakeType = z.infer<typeof brakeTypeEnum>;
export type FrameMaterialType = z.infer<typeof frameMaterialEnum>;
export type PrimaryGoalType = z.infer<typeof primaryGoalEnum>;
export type RequiredFeatureType = z.infer<typeof requiredFeatureEnum>;

export interface WizardMetaResponse {
  heightRange: { min: number; max: number; unit: 'cm' };
  inseamRange: { min: number; max: number; unit: 'cm' };
  budgetLimits: {
    min: number;
    max: number;
    defaultMin: number;
    defaultMax: number;
    currency: 'UAH';
  };
  ridingSurfaces: Array<{ id: 'asphalt' | 'gravel' | 'offroad'; label: string; icon: string }>;
  ridingGoals: Array<{ id: PrimaryGoalType; label: string }>;
  ridingPositions: Array<{ id: RidingPositionType; label: string }>;
  availableFeatures: Array<{ id: RequiredFeatureType; label: string }>;
}

export interface CalculatedFrameSize {
  standardLabel: FrameSizeLabelType;
  numericSize: number;
  unit: 'cm';
  confidence: 'HIGH' | 'MEDIUM';
  sizeAdvice: string;
}

/**
 * Calculated bike search parameters derived from the user's Wizard answers.
 * Maps directly to `GET /api/v1/bikes` query parameters so the frontend can
 * execute the search and let the user tweak any filter outside the Wizard.
 */
export interface RecommendedBikeFilters {
  category: BikeCategoryType;
  sizeLabel: FrameSizeLabelType;
  riderHeightCm: number;
  gender: RiderGenderType;
  minPriceUah: number;
  maxPriceUah: number;
  ridingPosition: RidingPositionType;
  brakeTypes?: BrakeType[];
  hasRackMounts?: boolean;
  hasFenderMounts?: boolean;
  suspensionFork?: boolean;
  inStockOnly: boolean;
}

export interface WizardEvaluateResponse {
  analysis: {
    recommendedCategory: {
      type: BikeCategoryType;
      displayName: string;
      reasoning: string;
    };
    calculatedFrameSize: CalculatedFrameSize;
  };
  recommendedFilters: RecommendedBikeFilters;
}

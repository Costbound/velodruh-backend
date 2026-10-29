import { createApp } from '../src/app.js';
import type { BikeDetailDto } from '../src/schemas/bike.schema.js';
import type {
  WizardEvaluateResponse,
  WizardMetaResponse,
} from '../src/schemas/wizard.schema.js';
import {
  calculateFrameSize,
  determineRecommendedCategory,
} from '../src/services/wizard.service.js';
import { invokeApp } from './helpers/test-client.js';

describe('Wizard Service & API Contracts', () => {
  const app = createApp();

  describe('GET /api/v1/wizard/meta', () => {
    it('returns questionnaire constraints, surfaces, goals, positions, and features', async () => {
      const response = await invokeApp<WizardMetaResponse>(app, {
        method: 'GET',
        path: '/api/v1/wizard/meta',
      });

      expect(response.status).toBe(200);
      expect(response.body.heightRange).toEqual({ min: 140, max: 215, unit: 'cm' });
      expect(response.body.inseamRange).toEqual({ min: 60, max: 110, unit: 'cm' });
      expect(response.body.budgetLimits.currency).toBe('UAH');
      expect(response.body.ridingSurfaces.map((s) => s.id)).toEqual([
        'asphalt',
        'gravel',
        'offroad',
      ]);
      expect(response.body.ridingGoals.length).toBeGreaterThanOrEqual(4);
      expect(response.body.availableFeatures.length).toBeGreaterThanOrEqual(5);
    });
  });

  describe('calculateFrameSize unit logic', () => {
    it('calculates frame sizes XS through XL across rider heights and confidence levels', () => {
      expect(calculateFrameSize(155).standardLabel).toBe('XS');
      expect(calculateFrameSize(155).confidence).toBe('MEDIUM');

      expect(calculateFrameSize(165, 76).standardLabel).toBe('S');
      expect(calculateFrameSize(165, 76).confidence).toBe('HIGH');

      const medium = calculateFrameSize(178, 83);
      expect(medium.standardLabel).toBe('M');
      expect(medium.numericSize).toBe(54);
      expect(medium.confidence).toBe('HIGH');

      expect(calculateFrameSize(185, 87).standardLabel).toBe('L');
      expect(calculateFrameSize(195, 92).standardLabel).toBe('XL');
    });
  });

  describe('determineRecommendedCategory unit logic', () => {
    it('selects GRAVEL for mixed asphalt/gravel commuting', () => {
      const cat = determineRecommendedCategory({
        surfaceProportions: { asphalt: 60, gravel: 30, offroad: 10 },
        ridingPosition: 'COMFORTABLE',
        primaryGoal: 'commuting',
        featuresRequired: ['RACK_MOUNTS', 'DISC_BRAKES'],
      });
      expect(cat.type).toBe('GRAVEL');
    });

    it('selects MTB_HARDTAIL when offroad is >= 40%', () => {
      const cat = determineRecommendedCategory({
        surfaceProportions: { asphalt: 20, gravel: 30, offroad: 50 },
        ridingPosition: 'COMFORTABLE',
        primaryGoal: 'recreation',
        featuresRequired: ['SUSPENSION_FORK'],
      });
      expect(cat.type).toBe('MTB_HARDTAIL');
    });

    it('selects ROAD for high asphalt fitness riding in SPORT position', () => {
      const cat = determineRecommendedCategory({
        surfaceProportions: { asphalt: 90, gravel: 10, offroad: 0 },
        ridingPosition: 'SPORT',
        primaryGoal: 'fitness',
        featuresRequired: ['HYDRAULIC_BRAKES'],
      });
      expect(cat.type).toBe('ROAD');
    });

    it('selects TOURING when touring with rack mounts', () => {
      const cat = determineRecommendedCategory({
        surfaceProportions: { asphalt: 50, gravel: 40, offroad: 10 },
        ridingPosition: 'COMFORTABLE',
        primaryGoal: 'touring',
        featuresRequired: ['RACK_MOUNTS'],
      });
      expect(cat.type).toBe('TOURING');
    });
  });

  describe('POST /api/v1/wizard/evaluate -> GET /api/v1/bikes flow', () => {
    it('calculates bike filter parameters from user answers and feeds them into GET /api/v1/bikes', async () => {
      const evalResponse = await invokeApp<WizardEvaluateResponse>(app, {
        method: 'POST',
        path: '/api/v1/wizard/evaluate',
        body: {
          rider: {
            heightCm: 178,
            inseamCm: 83,
            gender: 'UNISEX',
          },
          budget: {
            minUah: 25000,
            maxUah: 45000,
          },
          usage: {
            surfaceProportions: {
              asphalt: 60,
              gravel: 30,
              offroad: 10,
            },
            ridingPosition: 'COMFORTABLE',
            primaryGoal: 'commuting',
            featuresRequired: ['RACK_MOUNTS', 'DISC_BRAKES'],
          },
        },
      });

      expect(evalResponse.status).toBe(200);
      expect(evalResponse.body.analysis.recommendedCategory.type).toBe('GRAVEL');
      expect(evalResponse.body.analysis.calculatedFrameSize.standardLabel).toBe('M');
      expect(evalResponse.body.analysis.calculatedFrameSize.numericSize).toBe(54);

      const filters = evalResponse.body.recommendedFilters;
      expect(filters).toEqual({
        category: 'GRAVEL',
        sizeLabel: 'M',
        riderHeightCm: 178,
        gender: 'UNISEX',
        minPriceUah: 25000,
        maxPriceUah: 45000,
        ridingPosition: 'COMFORTABLE',
        brakeTypes: ['HYDRAULIC_DISC', 'MECHANICAL_DISC'],
        hasRackMounts: true,
        suspensionFork: false,
        inStockOnly: true,
      });

      // Use the calculated filters in GET /api/v1/bikes
      const searchParams = new URLSearchParams({
        category: filters.category,
        sizeLabel: filters.sizeLabel,
        riderHeightCm: String(filters.riderHeightCm),
        minPriceUah: String(filters.minPriceUah),
        maxPriceUah: String(filters.maxPriceUah),
        ridingPosition: filters.ridingPosition,
        brakeType: (filters.brakeTypes ?? []).join(','),
        hasRackMounts: String(filters.hasRackMounts),
        suspensionFork: String(filters.suspensionFork),
        inStockOnly: String(filters.inStockOnly),
      });

      const bikesResponse = await invokeApp<{ items: BikeDetailDto[]; total: number }>(app, {
        method: 'GET',
        path: `/api/v1/bikes?${searchParams.toString()}`,
      });

      expect(bikesResponse.status).toBe(200);
      expect(bikesResponse.body.total).toBe(1);
      expect(bikesResponse.body.items[0]?.slug).toBe('pride-rocx-8-2-2025');
    });

    it('returns 400 VALIDATION_ERROR when surface proportions do not sum to 100', async () => {
      const response = await invokeApp<{
        error: string;
        code: string;
        details: Array<{ path: string; message: string }>;
      }>(app, {
        method: 'POST',
        path: '/api/v1/wizard/evaluate',
        body: {
          rider: { heightCm: 178 },
          budget: { minUah: 25000, maxUah: 45000 },
          usage: {
            surfaceProportions: { asphalt: 50, gravel: 20, offroad: 10 },
            primaryGoal: 'commuting',
          },
        },
      });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('VALIDATION_ERROR');
      expect(response.body.details.some((d) => d.path.includes('surfaceProportions'))).toBe(true);
    });

    it('returns 400 VALIDATION_ERROR when maxUah is less than minUah', async () => {
      const response = await invokeApp<{
        error: string;
        code: string;
        details: Array<{ path: string; message: string }>;
      }>(app, {
        method: 'POST',
        path: '/api/v1/wizard/evaluate',
        body: {
          rider: { heightCm: 178 },
          budget: { minUah: 50000, maxUah: 30000 },
          usage: {
            surfaceProportions: { asphalt: 60, gravel: 30, offroad: 10 },
            primaryGoal: 'commuting',
          },
        },
      });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('VALIDATION_ERROR');
      expect(response.body.details.some((d) => d.path.includes('maxUah'))).toBe(true);
    });
  });
});

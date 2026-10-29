import { Router, type Request, type Response } from 'express';
import swaggerUi from 'swagger-ui-express';

export const openApiDocument = {
  openapi: '3.1.0',
  info: {
    title: 'VeloDruh API',
    version: '1.0.0',
    description:
      'REST API сервісу розумного підбору велосипедів та агрегації цін VeloDruh (Smart Matching Wizard & Cross-Market Catalog).',
  },
  servers: [
    {
      url: 'http://localhost:3000',
      description: 'Local Development Server',
    },
  ],
  tags: [
    { name: 'Health', description: 'Перевірка стану сервісу' },
    { name: 'Wizard', description: 'Покроковий опитувальник та розрахунок параметрів велосипеда' },
    { name: 'Bikes', description: 'Гнучкий пошук по каталогу, геометрія рам та пропозиції магазинів' },
  ],
  paths: {
    '/health': {
      get: {
        tags: ['Health'],
        summary: 'Liveness / Health check',
        responses: {
          '200': {
            description: 'Service is healthy',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['status'],
                  properties: {
                    status: { type: 'string', example: 'ok' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/v1/wizard/meta': {
      get: {
        tags: ['Wizard'],
        summary: 'Отримати метадані та довідники для покрокового опитувальника (Wizard)',
        responses: {
          '200': {
            description: 'Діапазони зросту, бюджету, типи покриття та цілі катання',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/WizardMetaResponse' },
              },
            },
          },
        },
      },
    },
    '/api/v1/wizard/evaluate': {
      post: {
        tags: ['Wizard'],
        summary:
          'Вирахувати рекомендовану категорію, ростовку та параметри пошуку велосипеда з анкети користувача',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/WizardEvaluateRequest' },
            },
          },
        },
        responses: {
          '200': {
            description:
              'Персоналізований аналіз (категорія + розмір рами) та набір розрахованих фільтрів для пошуку в GET /api/v1/bikes',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/WizardEvaluateResponse' },
              },
            },
          },
          '400': {
            description: 'Помилка валідації вхідних даних анкети',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
        },
      },
    },
    '/api/v1/bikes': {
      get: {
        tags: ['Bikes'],
        summary:
          'Пошук велосипедів за гнучкими фільтрами (після Wizard або напряму в каталозі)',
        parameters: [
          {
            name: 'category',
            in: 'query',
            required: false,
            schema: { $ref: '#/components/schemas/BikeCategory' },
          },
          {
            name: 'brand',
            in: 'query',
            required: false,
            description: 'Slug або назва бренду (напр. pride, merida, trek)',
            schema: { type: 'string', example: 'pride' },
          },
          {
            name: 'sizeLabel',
            in: 'query',
            required: false,
            schema: { $ref: '#/components/schemas/FrameSizeLabel' },
          },
          {
            name: 'riderHeightCm',
            in: 'query',
            required: false,
            schema: { type: 'integer', minimum: 140, maximum: 215, example: 178 },
          },
          {
            name: 'gender',
            in: 'query',
            required: false,
            schema: { $ref: '#/components/schemas/RiderGender' },
          },
          {
            name: 'minPriceUah',
            in: 'query',
            required: false,
            schema: { type: 'integer', minimum: 0, example: 25000 },
          },
          {
            name: 'maxPriceUah',
            in: 'query',
            required: false,
            schema: { type: 'integer', minimum: 1, example: 45000 },
          },
          {
            name: 'brakeType',
            in: 'query',
            required: false,
            description: 'Один або кілька типів гальм через кому (напр. HYDRAULIC_DISC,MECHANICAL_DISC)',
            schema: { type: 'string', example: 'HYDRAULIC_DISC,MECHANICAL_DISC' },
          },
          {
            name: 'frameMaterial',
            in: 'query',
            required: false,
            schema: { $ref: '#/components/schemas/FrameMaterial' },
          },
          {
            name: 'ridingPosition',
            in: 'query',
            required: false,
            schema: { $ref: '#/components/schemas/RidingPosition' },
          },
          {
            name: 'wheelSize',
            in: 'query',
            required: false,
            schema: { type: 'string', example: '28"' },
          },
          {
            name: 'hasRackMounts',
            in: 'query',
            required: false,
            schema: { type: 'boolean' },
          },
          {
            name: 'hasFenderMounts',
            in: 'query',
            required: false,
            schema: { type: 'boolean' },
          },
          {
            name: 'suspensionFork',
            in: 'query',
            required: false,
            schema: { type: 'boolean' },
          },
          {
            name: 'maxWeightKg',
            in: 'query',
            required: false,
            schema: { type: 'number', example: 12.5 },
          },
          {
            name: 'inStockOnly',
            in: 'query',
            required: false,
            schema: { type: 'boolean', default: false },
          },
          {
            name: 'sortBy',
            in: 'query',
            required: false,
            schema: {
              type: 'string',
              enum: ['price_asc', 'price_desc', 'weight_asc', 'year_desc'],
              default: 'price_asc',
            },
          },
        ],
        responses: {
          '200': {
            description: 'Відфільтрований та відсортований список моделей каталогу',
          },
        },
      },
    },
    '/api/v1/bikes/{slug}': {
      get: {
        tags: ['Bikes'],
        summary: 'Отримати повну специфікацію, геометрію та ціни магазинів для конкретної моделі',
        parameters: [
          {
            name: 'slug',
            in: 'path',
            required: true,
            schema: { type: 'string', example: 'pride-rocx-8-2-2025' },
          },
        ],
        responses: {
          '200': {
            description: 'Детальна інформація про велосипед',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/BikeDetailDto' },
              },
            },
          },
          '404': {
            description: 'Велосипед не знайдено',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      BikeCategory: {
        type: 'string',
        enum: ['GRAVEL', 'ROAD', 'MTB_HARDTAIL', 'CITY_COMMUTER', 'TOURING', 'HYBRID'],
      },
      FrameSizeLabel: {
        type: 'string',
        enum: ['XS', 'S', 'M', 'L', 'XL'],
      },
      RiderGender: {
        type: 'string',
        enum: ['UNISEX', 'MALE', 'FEMALE'],
      },
      RidingPosition: {
        type: 'string',
        enum: ['SPORT', 'COMFORTABLE', 'UPRIGHT'],
      },
      BrakeType: {
        type: 'string',
        enum: ['HYDRAULIC_DISC', 'MECHANICAL_DISC', 'RIM'],
      },
      FrameMaterial: {
        type: 'string',
        enum: ['ALUMINUM', 'CARBON', 'STEEL'],
      },
      WizardMetaResponse: {
        type: 'object',
        required: [
          'heightRange',
          'inseamRange',
          'budgetLimits',
          'ridingSurfaces',
          'ridingGoals',
          'ridingPositions',
          'availableFeatures',
        ],
        properties: {
          heightRange: {
            type: 'object',
            properties: {
              min: { type: 'integer', example: 140 },
              max: { type: 'integer', example: 215 },
              unit: { type: 'string', example: 'cm' },
            },
          },
          inseamRange: {
            type: 'object',
            properties: {
              min: { type: 'integer', example: 60 },
              max: { type: 'integer', example: 110 },
              unit: { type: 'string', example: 'cm' },
            },
          },
          budgetLimits: {
            type: 'object',
            properties: {
              min: { type: 'integer', example: 10000 },
              max: { type: 'integer', example: 200000 },
              defaultMin: { type: 'integer', example: 25000 },
              defaultMax: { type: 'integer', example: 55000 },
              currency: { type: 'string', example: 'UAH' },
            },
          },
          ridingSurfaces: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                label: { type: 'string' },
                icon: { type: 'string' },
              },
            },
          },
          ridingGoals: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                label: { type: 'string' },
              },
            },
          },
        },
      },
      WizardEvaluateRequest: {
        type: 'object',
        required: ['rider', 'budget', 'usage'],
        properties: {
          rider: {
            type: 'object',
            required: ['heightCm'],
            properties: {
              heightCm: { type: 'integer', minimum: 140, maximum: 215, example: 178 },
              inseamCm: { type: 'integer', minimum: 60, maximum: 110, example: 83 },
              gender: { $ref: '#/components/schemas/RiderGender' },
            },
          },
          budget: {
            type: 'object',
            required: ['minUah', 'maxUah'],
            properties: {
              minUah: { type: 'integer', minimum: 5000, maximum: 300000, example: 25000 },
              maxUah: { type: 'integer', minimum: 5000, maximum: 300000, example: 45000 },
            },
          },
          usage: {
            type: 'object',
            required: ['surfaceProportions', 'primaryGoal'],
            properties: {
              surfaceProportions: {
                type: 'object',
                required: ['asphalt', 'gravel', 'offroad'],
                properties: {
                  asphalt: { type: 'number', example: 60 },
                  gravel: { type: 'number', example: 30 },
                  offroad: { type: 'number', example: 10 },
                },
              },
              ridingPosition: { $ref: '#/components/schemas/RidingPosition' },
              primaryGoal: {
                type: 'string',
                enum: ['commuting', 'fitness', 'touring', 'recreation'],
                example: 'commuting',
              },
              featuresRequired: {
                type: 'array',
                items: {
                  type: 'string',
                  enum: [
                    'RACK_MOUNTS',
                    'FENDER_MOUNTS',
                    'DISC_BRAKES',
                    'HYDRAULIC_BRAKES',
                    'SUSPENSION_FORK',
                  ],
                },
                example: ['RACK_MOUNTS', 'DISC_BRAKES'],
              },
            },
          },
        },
      },
      RecommendedBikeFilters: {
        type: 'object',
        required: [
          'category',
          'sizeLabel',
          'riderHeightCm',
          'gender',
          'minPriceUah',
          'maxPriceUah',
          'ridingPosition',
          'inStockOnly',
        ],
        properties: {
          category: { $ref: '#/components/schemas/BikeCategory' },
          sizeLabel: { $ref: '#/components/schemas/FrameSizeLabel' },
          riderHeightCm: { type: 'integer', example: 178 },
          gender: { $ref: '#/components/schemas/RiderGender' },
          minPriceUah: { type: 'integer', example: 25000 },
          maxPriceUah: { type: 'integer', example: 45000 },
          ridingPosition: { $ref: '#/components/schemas/RidingPosition' },
          brakeTypes: {
            type: 'array',
            items: { $ref: '#/components/schemas/BrakeType' },
            example: ['HYDRAULIC_DISC', 'MECHANICAL_DISC'],
          },
          hasRackMounts: { type: 'boolean', example: true },
          hasFenderMounts: { type: 'boolean' },
          suspensionFork: { type: 'boolean', example: false },
          inStockOnly: { type: 'boolean', example: true },
        },
      },
      WizardEvaluateResponse: {
        type: 'object',
        required: ['analysis', 'recommendedFilters'],
        properties: {
          analysis: {
            type: 'object',
            properties: {
              recommendedCategory: {
                type: 'object',
                properties: {
                  type: { $ref: '#/components/schemas/BikeCategory' },
                  displayName: { type: 'string' },
                  reasoning: { type: 'string' },
                },
              },
              calculatedFrameSize: {
                type: 'object',
                properties: {
                  standardLabel: { $ref: '#/components/schemas/FrameSizeLabel' },
                  numericSize: { type: 'integer' },
                  unit: { type: 'string', example: 'cm' },
                  confidence: { type: 'string', enum: ['HIGH', 'MEDIUM'] },
                  sizeAdvice: { type: 'string' },
                },
              },
            },
          },
          recommendedFilters: { $ref: '#/components/schemas/RecommendedBikeFilters' },
        },
      },
      BikeDetailDto: {
        type: 'object',
        required: ['slug', 'name', 'brand', 'category', 'modelYear', 'specs', 'variants'],
        properties: {
          slug: { type: 'string' },
          name: { type: 'string' },
          category: { $ref: '#/components/schemas/BikeCategory' },
          modelYear: { type: 'integer' },
          bestPriceUah: { type: 'integer' },
        },
      },
      ErrorResponse: {
        type: 'object',
        required: ['error', 'code'],
        properties: {
          error: { type: 'string' },
          code: { type: 'string' },
          details: { type: 'array', items: { type: 'object' } },
        },
      },
    },
  },
};

const docsRouter = Router();

docsRouter.get('/api-docs.json', (_req: Request, res: Response) => {
  res.status(200).json(openApiDocument);
});

docsRouter.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openApiDocument));

export default docsRouter;

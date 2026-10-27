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
    { name: 'Wizard', description: 'Покроковий опитувальник та алгоритм підбору велосипеда' },
    { name: 'Bikes', description: 'Каталог моделей, геометрія рам та пропозиції магазинів' },
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
        summary: 'Розрахувати рекомендований тип велосипеда, розмір рами та топ моделей за анкетою',
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
            description: 'Персоналізований аналіз та ранжований список рекомендованих велосипедів',
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
        summary: 'Отримати список моделей велосипедів із фільтрацією за категорією та бюджетом',
        parameters: [
          {
            name: 'category',
            in: 'query',
            required: false,
            schema: { $ref: '#/components/schemas/BikeCategory' },
          },
          {
            name: 'minPriceUah',
            in: 'query',
            required: false,
            schema: { type: 'integer', minimum: 0 },
          },
          {
            name: 'maxPriceUah',
            in: 'query',
            required: false,
            schema: { type: 'integer', minimum: 1 },
          },
        ],
        responses: {
          '200': {
            description: 'Список моделей каталогу',
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
      RiderGender: {
        type: 'string',
        enum: ['UNISEX', 'MALE', 'FEMALE'],
      },
      RidingPosition: {
        type: 'string',
        enum: ['SPORT', 'COMFORTABLE', 'UPRIGHT'],
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
      WizardEvaluateResponse: {
        type: 'object',
        required: ['analysis', 'recommendations'],
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
                  standardLabel: { type: 'string', enum: ['XS', 'S', 'M', 'L', 'XL'] },
                  numericSize: { type: 'integer' },
                  unit: { type: 'string', example: 'cm' },
                  confidence: { type: 'string', enum: ['HIGH', 'MEDIUM'] },
                  sizeAdvice: { type: 'string' },
                },
              },
            },
          },
          recommendations: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                bikeId: { type: 'string', example: 'pride-rocx-8-2-2025' },
                rank: { type: 'integer', example: 1 },
                matchScore: { type: 'integer', example: 96 },
                name: { type: 'string', example: 'Pride Rocx 8.2' },
                category: { $ref: '#/components/schemas/BikeCategory' },
                frameSize: { type: 'string', example: 'M (54)' },
                bestPriceUah: { type: 'integer', example: 33900 },
                currency: { type: 'string', example: 'UAH' },
                offersCount: { type: 'integer', example: 3 },
              },
            },
          },
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


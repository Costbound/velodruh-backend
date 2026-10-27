import { Router } from 'express';
import { handleGetBikeBySlug, handleListBikes } from '../controllers/bikes.controller.js';
import { validateRequest } from '../middlewares/validate.js';
import { bikeListQuerySchema, bikeSlugParamsSchema } from '../schemas/bike.schema.js';

const bikesRouter = Router();

bikesRouter.get('/', validateRequest({ query: bikeListQuerySchema }), handleListBikes);
bikesRouter.get('/:slug', validateRequest({ params: bikeSlugParamsSchema }), handleGetBikeBySlug);

export default bikesRouter;


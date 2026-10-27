import { Router } from 'express';
import wizardRouter from './wizard.route.js';
import bikesRouter from './bikes.route.js';

const apiRouter = Router();

apiRouter.use('/wizard', wizardRouter);
apiRouter.use('/bikes', bikesRouter);

export default apiRouter;


import { Router } from 'express';
import {
  handleEvaluateWizard,
  handleGetWizardMeta,
  handleGetWizardRecommendations,
} from '../controllers/wizard.controller.js';
import { validateRequest } from '../middlewares/validate.js';
import {
  wizardEvaluateRequestSchema,
  wizardRecommendationsRequestSchema,
} from '../schemas/wizard.schema.js';

const wizardRouter = Router();

wizardRouter.get('/meta', handleGetWizardMeta);
wizardRouter.post(
  '/evaluate',
  validateRequest({ body: wizardEvaluateRequestSchema }),
  handleEvaluateWizard,
);
wizardRouter.post(
  '/recommendations',
  validateRequest({ body: wizardRecommendationsRequestSchema }),
  handleGetWizardRecommendations,
);

export default wizardRouter;



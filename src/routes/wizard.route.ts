import { Router } from 'express';
import { handleEvaluateWizard, handleGetWizardMeta } from '../controllers/wizard.controller.js';
import { validateRequest } from '../middlewares/validate.js';
import { wizardEvaluateRequestSchema } from '../schemas/wizard.schema.js';

const wizardRouter = Router();

wizardRouter.get('/meta', handleGetWizardMeta);
wizardRouter.post(
  '/evaluate',
  validateRequest({ body: wizardEvaluateRequestSchema }),
  handleEvaluateWizard,
);

export default wizardRouter;


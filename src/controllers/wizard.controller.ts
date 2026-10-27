import type { Request, Response } from 'express';
import { evaluateWizard, getWizardMeta } from '../services/wizard.service.js';
import type { WizardEvaluateRequest } from '../schemas/wizard.schema.js';

export function handleGetWizardMeta(_req: Request, res: Response): void {
  const meta = getWizardMeta();
  res.status(200).json(meta);
}

export function handleEvaluateWizard(req: Request, res: Response): void {
  const payload = req.body as WizardEvaluateRequest;
  const result = evaluateWizard(payload);
  res.status(200).json(result);
}


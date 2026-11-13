import type { Request, Response } from 'express';
import {
  evaluateWizard,
  getWizardMeta,
  getWizardRecommendations,
} from '../services/wizard.service.js';
import type {
  WizardEvaluateRequest,
  WizardRecommendationsRequest,
} from '../schemas/wizard.schema.js';

export function handleGetWizardMeta(_req: Request, res: Response): void {
  const meta = getWizardMeta();
  res.status(200).json(meta);
}

export function handleEvaluateWizard(req: Request, res: Response): void {
  const payload = req.body as WizardEvaluateRequest;
  const result = evaluateWizard(payload);
  res.status(200).json(result);
}

export function handleGetWizardRecommendations(req: Request, res: Response): void {
  const payload = req.body as WizardRecommendationsRequest;
  const result = getWizardRecommendations(payload);
  res.status(200).json(result);
}



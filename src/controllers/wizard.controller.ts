import type { Request, Response } from 'express';
import type {
  WizardEvaluateRequest,
  WizardRecommendationsRequest,
} from '../schemas/wizard.schema.js';
import { getCatalogBikes } from '../services/catalog.repository.js';
import {
  evaluateWizard,
  getWizardMeta,
  getWizardRecommendations,
} from '../services/wizard.service.js';

export function handleGetWizardMeta(_req: Request, res: Response): void {
  const meta = getWizardMeta();
  res.status(200).json(meta);
}

export function handleEvaluateWizard(req: Request, res: Response): void {
  const payload = req.body as WizardEvaluateRequest;
  const result = evaluateWizard(payload);
  res.status(200).json(result);
}

export async function handleGetWizardRecommendations(
  req: Request,
  res: Response,
): Promise<void> {
  const payload = req.body as WizardRecommendationsRequest;
  const catalog = await getCatalogBikes();
  const result = getWizardRecommendations(payload, catalog);
  res.status(200).json(result);
}

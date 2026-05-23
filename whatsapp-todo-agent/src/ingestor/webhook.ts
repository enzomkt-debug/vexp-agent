import { Router, Request, Response } from 'express';
import { config } from '../config';
import { logger } from '../lib/logger';
import { EvolutionWebhookPayload, EvolutionMessage } from '../types/evolution';
import { parseEvolutionMessage } from './parser';
import { persistMessage } from './persist';

export const webhookRouter = Router();

const persistDeps = {
  evolutionApiUrl: config.EVOLUTION_API_URL,
  evolutionApiKey: config.EVOLUTION_API_KEY,
  evolutionInstance: config.EVOLUTION_INSTANCE,
};

webhookRouter.post('/webhook/messages', (req: Request, res: Response) => {
  res.sendStatus(200);

  const payload = req.body as EvolutionWebhookPayload;

  if (!payload?.data) {
    logger.warn('Received webhook with no data');
    return;
  }

  const messages: EvolutionMessage[] = Array.isArray(payload.data)
    ? payload.data
    : [payload.data];

  for (const msg of messages) {
    const parsed = parseEvolutionMessage(msg);
    if (!parsed) continue;

    persistMessage(parsed, persistDeps).catch((err) =>
      logger.error({ err, evolutionId: msg.key.id }, 'failed to persist message'),
    );
  }
});

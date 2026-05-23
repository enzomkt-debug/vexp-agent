import express from 'express';
import cron from 'node-cron';
import { config } from './config';
import { logger } from './lib/logger';
import { webhookRouter } from './ingestor/webhook';
import { runDigest } from './processor/run';

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(webhookRouter);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', ts: new Date().toISOString() });
});

cron.schedule(
  config.DIGEST_CRON,
  async () => {
    logger.info('Cron triggered — running digest');
    try { await runDigest(); }
    catch (err) { logger.error({ err }, 'Unhandled error in runDigest'); }
  },
  { timezone: config.DIGEST_TIMEZONE },
);

logger.info({ cron: config.DIGEST_CRON, tz: config.DIGEST_TIMEZONE }, 'Cron scheduled');

app.listen(config.PORT, () => {
  logger.info({ port: config.PORT }, 'whatsapp-todo-agent running');
});

export default app;

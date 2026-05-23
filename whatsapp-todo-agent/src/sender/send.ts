import { config } from '../config';
import { logger } from '../lib/logger';
import { splitIntoMessages } from './format';

const DELAY_MS = 1000;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function sendWhatsApp(text: string): Promise<string> {
  const parts = splitIntoMessages(text);
  const number = `${config.ENZO_WHATSAPP_NUMBER}@s.whatsapp.net`;
  const url = `${config.EVOLUTION_API_URL}/message/sendText/${config.EVOLUTION_INSTANCE}`;
  let lastMessageId = '';

  for (let i = 0; i < parts.length; i++) {
    if (i > 0) await sleep(DELAY_MS);

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: config.EVOLUTION_API_KEY },
      body: JSON.stringify({ number, text: parts[i] }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Evolution sendText failed (${res.status}): ${body}`);
    }

    const data = (await res.json()) as { key?: { id?: string } };
    lastMessageId = data.key?.id ?? '';
    logger.info({ part: i + 1, total: parts.length, msgId: lastMessageId }, 'WhatsApp part sent');
  }

  return lastMessageId;
}

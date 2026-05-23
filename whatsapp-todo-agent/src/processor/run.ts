import { logger } from '../lib/logger';
import { TodoItemInput, TodoMessage } from '../db/schemas';
import { getDigestWindowStart, fetchUnprocessedMessages, markMessagesProcessed, updateDigestState } from './fetch';
import { chunkMessages } from './chunker';
import { extractTodosFromChunk } from './claude';
import { createDigest, persistItems, updateDigestSent, updateDigestError } from './persist';
import { formatDigest } from '../sender/format';
import { sendWhatsApp } from '../sender/send';

export async function runDigest(): Promise<void> {
  const windowEnd = new Date();
  logger.info({ windowEnd }, 'Starting daily digest');

  const windowStart = await getDigestWindowStart();
  const messages = await fetchUnprocessedMessages(windowStart, windowEnd);
  logger.info({ count: messages.length }, 'Messages fetched');

  if (messages.length === 0) {
    const digestId = await createDigest({ windowStart, windowEnd, messagesProcessed: 0, itemsExtracted: 0, claudeInputTokens: 0, claudeOutputTokens: 0, sentToWhatsapp: false });
    await updateDigestState(windowEnd);
    const msgId = await sendWhatsApp('🌅 *Bom dia, Enzo!*\n\nNenhuma mensagem nova desde o último resumo. 😊\n\n_Próximo resumo amanhã 08:00_');
    await updateDigestSent(digestId, msgId);
    return;
  }

  const chunks = chunkMessages(messages);
  const allItems: TodoItemInput[] = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let claudeError: string | undefined;

  for (let i = 0; i < chunks.length; i++) {
    try {
      const result = await extractTodosFromChunk(chunks[i]);
      allItems.push(...result.items);
      totalInputTokens += result.inputTokens;
      totalOutputTokens += result.outputTokens;
    } catch (err) {
      claudeError = err instanceof Error ? err.message : String(err);
      logger.error({ err, chunk: i + 1 }, 'Claude chunk failed');
      break;
    }
  }

  if (claudeError) {
    await createDigest({ windowStart, windowEnd, messagesProcessed: messages.length, itemsExtracted: 0, claudeInputTokens: totalInputTokens, claudeOutputTokens: totalOutputTokens, sentToWhatsapp: false, error: claudeError });
    return;
  }

  const validIds = new Set(messages.map((m) => m.id));
  const validatedItems = allItems.map((item) => ({ ...item, source_message_ids: item.source_message_ids.filter((id) => validIds.has(id)) }));

  const digestId = await createDigest({ windowStart, windowEnd, messagesProcessed: messages.length, itemsExtracted: validatedItems.length, claudeInputTokens: totalInputTokens, claudeOutputTokens: totalOutputTokens, sentToWhatsapp: false });
  await persistItems(digestId, validatedItems, messages);

  const text = formatDigest(validatedItems, messages, windowStart, windowEnd);
  let sendError: string | undefined;
  let msgId = '';

  try {
    msgId = await sendWhatsApp(text);
  } catch (err) {
    sendError = err instanceof Error ? err.message : String(err);
    logger.error({ err }, 'Failed to send WhatsApp digest');
  }

  if (sendError) {
    await updateDigestError(digestId, `send failed: ${sendError}`);
    return;
  }

  await updateDigestSent(digestId, msgId);
  await markMessagesProcessed(messages.map((m) => m.id));
  await updateDigestState(windowEnd);
  logger.info({ digestId, msgId }, 'Digest complete');
}

import { supabase } from '../db/client';
import { TodoItemInput, TodoMessage } from '../db/schemas';

export interface DigestInsert {
  windowStart: Date;
  windowEnd: Date;
  messagesProcessed: number;
  itemsExtracted: number;
  claudeInputTokens: number;
  claudeOutputTokens: number;
  sentToWhatsapp: boolean;
  sentAt?: Date;
  evolutionMessageId?: string;
  error?: string;
}

export async function createDigest(data: DigestInsert): Promise<string> {
  const costUsd = (data.claudeInputTokens * 3 + data.claudeOutputTokens * 15) / 1_000_000;

  const { data: row, error } = await supabase
    .from('todo_digests')
    .insert({
      window_start: data.windowStart.toISOString(),
      window_end: data.windowEnd.toISOString(),
      messages_processed: data.messagesProcessed,
      items_extracted: data.itemsExtracted,
      claude_input_tokens: data.claudeInputTokens,
      claude_output_tokens: data.claudeOutputTokens,
      claude_cost_usd: costUsd,
      sent_to_whatsapp: data.sentToWhatsapp,
      sent_at: data.sentAt?.toISOString() ?? null,
      evolution_message_id: data.evolutionMessageId ?? null,
      error: data.error ?? null,
    })
    .select('id')
    .single();

  if (error) throw new Error(`Failed to create digest: ${error.message}`);
  return row.id as string;
}

export async function updateDigestSent(digestId: string, evolutionMessageId: string): Promise<void> {
  const { error } = await supabase
    .from('todo_digests')
    .update({ sent_to_whatsapp: true, sent_at: new Date().toISOString(), evolution_message_id: evolutionMessageId })
    .eq('id', digestId);
  if (error) throw new Error(`Failed to update digest: ${error.message}`);
}

export async function updateDigestError(digestId: string, errorMsg: string): Promise<void> {
  const { error } = await supabase.from('todo_digests').update({ error: errorMsg }).eq('id', digestId);
  if (error) throw new Error(`Failed to update digest error: ${error.message}`);
}

export async function persistItems(digestId: string, items: TodoItemInput[], messages: TodoMessage[]): Promise<void> {
  if (items.length === 0) return;

  const messageById = new Map(messages.map((m) => [m.id, m]));

  const rows = items.map((item) => {
    const sourceMsg = item.source_message_ids.map((id) => messageById.get(id)).find(Boolean);
    const sourceJid = sourceMsg?.remote_jid ?? 'unknown';
    const sourceName = sourceMsg?.is_group
      ? (sourceMsg.group_name ?? sourceMsg.remote_jid)
      : (sourceMsg?.sender_name ?? null);

    return {
      digest_id: digestId,
      category: item.category,
      title: item.title,
      description: item.description ?? null,
      source_jid: sourceJid,
      source_name: sourceName,
      source_message_ids: item.source_message_ids,
      due_at: item.due_at ?? null,
      urgency: item.urgency,
      is_implicit: item.is_implicit,
    };
  });

  const { error } = await supabase.from('todo_items').insert(rows);
  if (error) throw new Error(`Failed to persist items: ${error.message}`);
}

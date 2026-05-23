import { supabase } from '../db/client';
import { TodoMessage, TodoMessageSchema } from '../db/schemas';
import { z } from 'zod';

export async function getDigestWindowStart(): Promise<Date> {
  const { data, error } = await supabase
    .from('todo_state')
    .select('last_digest_at')
    .eq('id', 1)
    .single();

  if (error) throw new Error(`Failed to read todo_state: ${error.message}`);

  if (!data.last_digest_at) {
    return new Date(Date.now() - 24 * 60 * 60 * 1000);
  }

  return new Date(data.last_digest_at);
}

export async function fetchUnprocessedMessages(
  windowStart: Date,
  windowEnd: Date,
): Promise<TodoMessage[]> {
  const { data, error } = await supabase
    .from('todo_messages')
    .select('*')
    .eq('processed', false)
    .gte('timestamp_ms', windowStart.getTime())
    .lte('timestamp_ms', windowEnd.getTime())
    .order('timestamp_ms', { ascending: true });

  if (error) throw new Error(`Failed to fetch messages: ${error.message}`);

  return z.array(TodoMessageSchema).parse(data ?? []);
}

export async function markMessagesProcessed(ids: string[]): Promise<void> {
  if (ids.length === 0) return;

  const { error } = await supabase
    .from('todo_messages')
    .update({ processed: true, processed_at: new Date().toISOString() })
    .in('id', ids);

  if (error) throw new Error(`Failed to mark messages processed: ${error.message}`);
}

export async function updateDigestState(windowEnd: Date): Promise<void> {
  const { error } = await supabase
    .from('todo_state')
    .update({ last_digest_at: windowEnd.toISOString(), updated_at: new Date().toISOString() })
    .eq('id', 1);

  if (error) throw new Error(`Failed to update todo_state: ${error.message}`);
}

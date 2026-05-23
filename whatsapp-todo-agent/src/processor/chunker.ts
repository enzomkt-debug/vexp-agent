import { TodoMessage } from '../db/schemas';
import { estimateTokens } from '../lib/tokens';

const MAX_CHUNK_TOKENS = 60_000;

export function formatMessageLine(msg: TodoMessage): string {
  const ts = new Date(msg.timestamp_ms).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const source = msg.is_group
    ? (msg.group_name ?? msg.remote_jid)
    : (msg.sender_name ?? msg.remote_jid);
  const sender = msg.sender_name ?? msg.sender_jid;
  const body = msg.content ?? (msg.has_media ? '[mídia sem legenda]' : '[sem conteúdo]');
  return `[ID: ${msg.id}] [${ts}] ${source} — ${sender}: ${body}`;
}

export function chunkMessages(messages: TodoMessage[]): string[][] {
  const grouped = new Map<string, TodoMessage[]>();
  for (const msg of messages) {
    const group = grouped.get(msg.remote_jid) ?? [];
    group.push(msg);
    grouped.set(msg.remote_jid, group);
  }

  const chunks: string[][] = [];
  let currentChunk: string[] = [];
  let currentTokens = 0;

  for (const convoMessages of grouped.values()) {
    const lines = convoMessages.map(formatMessageLine);
    const convoTokens = lines.reduce((sum, l) => sum + estimateTokens(l), 0);

    if (currentTokens + convoTokens > MAX_CHUNK_TOKENS && currentChunk.length > 0) {
      chunks.push(currentChunk);
      currentChunk = [];
      currentTokens = 0;
    }

    currentChunk.push(...lines);
    currentTokens += convoTokens;
  }

  if (currentChunk.length > 0) chunks.push(currentChunk);

  return chunks.length > 0 ? chunks : [[]];
}

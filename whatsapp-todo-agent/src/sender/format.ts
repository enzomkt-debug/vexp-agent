import { TodoItemInput, TodoMessage } from '../db/schemas';

const MAX_MSG_CHARS = 4000;

function formatItem(item: TodoItemInput, messages: TodoMessage[]): string {
  const messageById = new Map(messages.map((m) => [m.id, m]));
  const sourceMsg = item.source_message_ids.map((id) => messageById.get(id)).find(Boolean);
  const origin = sourceMsg?.is_group
    ? (sourceMsg.group_name ?? sourceMsg.remote_jid)
    : (sourceMsg?.sender_name ?? sourceMsg?.sender_jid ?? 'desconhecido');

  let line = `▸ [${item.category}] *${item.title}*`;
  if (item.description) line += `\n   _${item.description}_`;
  line += `\n   📍 ${origin}`;
  if (item.due_at) {
    const due = new Date(item.due_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    line += `\n   🗓 ${due}`;
  }
  return line;
}

export function formatDigest(items: TodoItemInput[], messages: TodoMessage[], windowStart: Date, windowEnd: Date): string {
  const startStr = windowStart.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const endStr = windowEnd.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const hora = new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });

  const altas = items.filter((i) => i.urgency === 'alta');
  const medias = items.filter((i) => i.urgency === 'média');
  const baixas = items.filter((i) => i.urgency === 'baixa');
  const sep = '━━━━━━━━━━━━━━━';

  const sections: string[] = [
    `🌅 *Bom dia, Enzo!*\nResumo de ${messages.length} mensagens — ${startStr} → ${endStr}.\n${items.length} itens identificados.`,
  ];

  if (altas.length > 0) {
    sections.push(`\n${sep}\n🔴 *URGENTE* (${altas.length})\n${sep}`);
    sections.push(altas.map((i) => formatItem(i, messages)).join('\n\n'));
  }
  if (medias.length > 0) {
    sections.push(`\n${sep}\n🟡 *MÉDIA PRIORIDADE* (${medias.length})\n${sep}`);
    sections.push(medias.map((i) => formatItem(i, messages)).join('\n\n'));
  }
  if (baixas.length > 0) {
    sections.push(`\n${sep}\n🟢 *BAIXA / INFORMATIVO* (${baixas.length})\n${sep}`);
    sections.push(baixas.map((i) => formatItem(i, messages)).join('\n\n'));
  }

  sections.push(`\n${sep}\n_Gerado às ${hora} BRT_\n_Próximo resumo amanhã 08:00_`);
  return sections.join('\n');
}

export function splitIntoMessages(text: string): string[] {
  if (text.length <= MAX_MSG_CHARS) return [text];

  const parts: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= MAX_MSG_CHARS) { parts.push(remaining); break; }
    let cut = remaining.lastIndexOf('\n', MAX_MSG_CHARS);
    if (cut <= 0) cut = MAX_MSG_CHARS;
    parts.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut).trimStart();
  }

  return parts.length === 1 ? parts : parts.map((p, i) => `(${i + 1}/${parts.length})\n${p}`);
}

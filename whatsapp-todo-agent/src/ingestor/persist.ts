import { supabase } from '../db/client';
import { logger } from '../lib/logger';
import { ParsedMessage } from './parser';

const groupNameCache = new Map<string, string>();

async function resolveGroupName(
  remoteJid: string,
  evolutionApiUrl: string,
  evolutionApiKey: string,
  evolutionInstance: string,
): Promise<string | null> {
  if (groupNameCache.has(remoteJid)) return groupNameCache.get(remoteJid)!;

  try {
    const res = await fetch(
      `${evolutionApiUrl}/group/findGroupInfos/${evolutionInstance}?groupJid=${remoteJid}`,
      { headers: { apikey: evolutionApiKey } },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { subject?: string };
    const name = data.subject ?? null;
    if (name) groupNameCache.set(remoteJid, name);
    return name;
  } catch {
    return null;
  }
}

interface PersistDeps {
  evolutionApiUrl: string;
  evolutionApiKey: string;
  evolutionInstance: string;
}

export async function persistMessage(msg: ParsedMessage, deps: PersistDeps): Promise<void> {
  let groupName: string | null = null;
  if (msg.isGroup) {
    groupName = await resolveGroupName(
      msg.remoteJid,
      deps.evolutionApiUrl,
      deps.evolutionApiKey,
      deps.evolutionInstance,
    );
  }

  const { error } = await supabase.from('todo_messages').insert({
    evolution_id: msg.evolutionId,
    remote_jid: msg.remoteJid,
    is_group: msg.isGroup,
    group_name: groupName,
    sender_jid: msg.senderJid,
    sender_name: msg.senderName,
    message_type: msg.messageType,
    content: msg.content,
    has_media: msg.hasMedia,
    media_caption: msg.mediaCaption,
    timestamp_ms: msg.timestampMs,
  });

  if (error) {
    if (error.code === '23505') return;
    throw error;
  }

  logger.debug({ evolutionId: msg.evolutionId, remoteJid: msg.remoteJid }, 'message persisted');
}

import { EvolutionMessage } from '../types/evolution';

export interface ParsedMessage {
  evolutionId: string;
  remoteJid: string;
  isGroup: boolean;
  senderJid: string;
  senderName: string | null;
  messageType: string;
  content: string | null;
  hasMedia: boolean;
  mediaCaption: string | null;
  timestampMs: number;
}

export function parseEvolutionMessage(msg: EvolutionMessage): ParsedMessage | null {
  if (msg.key.fromMe) return null;

  const { remoteJid, id, participant } = msg.key;
  const isGroup = remoteJid.endsWith('@g.us');
  const senderJid = isGroup && participant ? participant : remoteJid;
  const { messageType } = msg;

  let content: string | null = null;
  let hasMedia = false;
  let mediaCaption: string | null = null;

  const m = msg.message;
  if (m) {
    switch (messageType) {
      case 'conversation':
        content = m.conversation ?? null;
        break;
      case 'extendedTextMessage':
        content = m.extendedTextMessage?.text ?? null;
        break;
      case 'imageMessage':
        hasMedia = true;
        mediaCaption = m.imageMessage?.caption ?? null;
        content = mediaCaption;
        break;
      case 'videoMessage':
        hasMedia = true;
        mediaCaption = m.videoMessage?.caption ?? null;
        content = mediaCaption;
        break;
      case 'documentMessage':
        hasMedia = true;
        mediaCaption = m.documentMessage?.caption ?? null;
        content = mediaCaption;
        break;
      case 'audioMessage':
        hasMedia = true;
        content = null;
        break;
      default:
        content = null;
    }
  }

  return {
    evolutionId: id,
    remoteJid,
    isGroup,
    senderJid,
    senderName: msg.pushName ?? null,
    messageType,
    content,
    hasMedia,
    mediaCaption,
    timestampMs: msg.messageTimestamp * 1000,
  };
}

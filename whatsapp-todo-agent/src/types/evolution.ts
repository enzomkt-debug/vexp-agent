export interface EvolutionMessageKey {
  remoteJid: string;
  fromMe: boolean;
  id: string;
  participant?: string;
}

export interface EvolutionMessageContent {
  conversation?: string;
  extendedTextMessage?: { text: string };
  imageMessage?: { caption?: string };
  videoMessage?: { caption?: string };
  documentMessage?: { caption?: string; fileName?: string };
  audioMessage?: Record<string, unknown>;
  stickerMessage?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface EvolutionMessage {
  key: EvolutionMessageKey;
  pushName?: string;
  message?: EvolutionMessageContent;
  messageType: string;
  messageTimestamp: number;
}

export interface EvolutionWebhookPayload {
  event: string;
  instance: string;
  data: EvolutionMessage | EvolutionMessage[];
}

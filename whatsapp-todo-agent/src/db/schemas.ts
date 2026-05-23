import { z } from 'zod';

export const CATEGORIES = [
  "Rede D'Or — Trabalho",
  'Médico AI',
  'Mercado Livre',
  'Projetos pessoais',
  'Pessoal / Família',
  'Financeiro',
  'Outros',
] as const;

export type Category = (typeof CATEGORIES)[number];

export const TodoMessageSchema = z.object({
  id: z.string().uuid(),
  evolution_id: z.string(),
  remote_jid: z.string(),
  is_group: z.boolean(),
  group_name: z.string().nullable(),
  sender_jid: z.string(),
  sender_name: z.string().nullable(),
  message_type: z.string(),
  content: z.string().nullable(),
  has_media: z.boolean(),
  media_caption: z.string().nullable(),
  timestamp_ms: z.number(),
  received_at: z.string(),
  processed: z.boolean(),
  processed_at: z.string().nullable(),
});

export const TodoItemInputSchema = z.object({
  category: z.enum(CATEGORIES),
  title: z.string().max(80),
  description: z.string().max(200).nullable().optional(),
  source_message_ids: z.array(z.string()),
  due_at: z.string().nullable().optional(),
  urgency: z.enum(['alta', 'média', 'baixa']),
  is_implicit: z.boolean(),
});

export const ClaudeResponseSchema = z.object({
  items: z.array(TodoItemInputSchema),
});

export type TodoMessage = z.infer<typeof TodoMessageSchema>;
export type TodoItemInput = z.infer<typeof TodoItemInputSchema>;
export type ClaudeResponse = z.infer<typeof ClaudeResponseSchema>;

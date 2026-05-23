import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config';
import { ClaudeResponse, ClaudeResponseSchema } from '../db/schemas';
import { logger } from '../lib/logger';

const anthropic = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `Você é um assistente que analisa mensagens de WhatsApp e extrai todas as tarefas, compromissos, pendências e follow-ups direcionados ao usuário (Enzo).

REGRAS DE EXTRAÇÃO:
1. Inclua tarefas EXPLÍCITAS.
2. Inclua COMPROMISSOS com data/hora.
3. Inclua PENDÊNCIAS IMPLÍCITAS.
4. Inclua FOLLOW-UPS.
5. NÃO inclua mensagens conversacionais, memes, áudios sem contexto.
6. NÃO duplique: consolide em um único item.
7. URGÊNCIA: alta (hoje/amanhã/urgente), média (essa semana), baixa (sem prazo).

CATEGORIAS (use exatamente estas):
- "Rede D'Or — Trabalho"
- "Médico AI"
- "Mercado Livre"
- "Projetos pessoais"
- "Pessoal / Família"
- "Financeiro"
- "Outros"

FORMATO DE SAÍDA: JSON puro, sem markdown.
{"items":[{"category":"string","title":"string (máx 80 chars)","description":"string ou null","source_message_ids":["uuid"],"due_at":"ISO 8601 ou null","urgency":"alta|média|baixa","is_implicit":false}]}`;

interface ClaudeCallResult {
  items: ClaudeResponse['items'];
  inputTokens: number;
  outputTokens: number;
}

export async function extractTodosFromChunk(messageLines: string[]): Promise<ClaudeCallResult> {
  if (messageLines.length === 0) {
    return { items: [], inputTokens: 0, outputTokens: 0 };
  }

  const response = await anthropic.messages.create({
    model: config.CLAUDE_MODEL,
    max_tokens: 8000,
    temperature: 0.2,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: messageLines.join('\n') }],
  });

  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;
  const rawText = response.content[0]?.type === 'text' ? response.content[0].text.trim() : '';

  let parsed: ClaudeResponse;
  try {
    parsed = ClaudeResponseSchema.parse(JSON.parse(rawText));
  } catch (err) {
    logger.error({ err, rawText: rawText.slice(0, 500) }, 'Claude returned invalid JSON');
    throw new Error(`Claude JSON parse failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  return { items: parsed.items, inputTokens, outputTokens };
}

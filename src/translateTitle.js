require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Traduz o título de uma notícia para português do Brasil.
// Mantém nomes próprios de marcas/empresas. Se já estiver em português,
// ou se a tradução falhar, retorna o título original sem quebrar o pipeline.
async function translateTitle(title) {
  if (!title || !title.trim()) return title;

  const prompt = `Traduza o título de notícia abaixo para português do Brasil.

Regras:
- Mantenha nomes próprios de marcas, empresas e produtos como estão (ex: Bed Bath & Beyond, The Container Store, Amazon).
- Se o título já estiver em português, devolva-o exatamente igual.
- Use linguagem jornalística natural, sem adicionar nem remover informação.
- Não use aspas, não comente, não explique. Retorne SOMENTE o título traduzido.

Título: ${title}`;

  try {
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }],
    });
    const traduzido = message.content[0]?.text?.trim();
    return traduzido || title;
  } catch (err) {
    console.warn(`[translateTitle] Falha ao traduzir título: ${err.message}`);
    return title;
  }
}

module.exports = { translateTitle };

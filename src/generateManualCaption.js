require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function generateManualCaption(tema) {
  const prompt = `Você é o copywriter do perfil @vendaexponencial no Instagram, focado em ecommerce e vendas digitais para o mercado brasileiro.

Com base no tema abaixo, crie uma legenda para o Instagram que:
- Tenha no máximo 300 caracteres no texto principal
- Seja envolvente e gere curiosidade
- Use 2 a 3 emojis relevantes
- Inclua uma chamada para ação curta (ex: "Salva esse post!", "Comenta o que achou!")
- Termine com exatamente 3 hashtags: #vendaexponencial + 2 hashtags dinâmicas relevantes ao tema

Tema: ${tema}

Retorne SOMENTE a legenda pronta, sem explicações.`;

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    messages: [{ role: 'user', content: prompt }],
  });

  return message.content[0].text.trim();
}

module.exports = { generateManualCaption };

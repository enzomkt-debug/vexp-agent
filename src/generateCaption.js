require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function generateCaption(news) {
  const prompt = `Você é o copywriter do perfil @vendaexponencial no Instagram, focado em ecommerce e vendas digitais para o mercado brasileiro.

Com base na notícia abaixo, crie uma legenda para o Instagram que:
- Tenha no máximo 300 caracteres no texto principal
- Seja envolvente e gere curiosidade
- Use 2 a 3 emojis relevantes
- Inclua uma chamada para ação curta (ex: "Salva esse post!", "Comenta o que achou!")
- Termine com exatamente 3 hashtags: #vendaexponencial + 2 hashtags dinâmicas relevantes ao conteúdo específico da notícia (produto, mercado, tema ou plataforma citada)

IMPORTANTE: Priorize notícias factuais sobre o mercado (tendências, dados, mudanças de comportamento, novidades de plataformas). Se a notícia for puramente um post de blog de uma empresa falando sobre si mesma, serviço próprio ou conteúdo patrocinado/autopromocional, recuse com a mensagem exata: "IRRELEVANTE"

Notícia:
Título: ${news.title}
Resumo: ${news.summary}
Fonte: ${news.source}

Retorne SOMENTE a legenda pronta, sem explicações. Se recusar, retorne apenas "IRRELEVANTE".`;

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    messages: [{ role: 'user', content: prompt }],
  });

  return message.content[0].text.trim();
}

module.exports = { generateCaption };

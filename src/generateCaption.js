require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function generateCaption(news, artigo = null) {
  const artigoTrecho = artigo
    ? `\n\nTrecho do artigo:\n${artigo.slice(0, 600).trim()}`
    : '';

  const estrutura = artigo
    ? `- Linha de abertura: frase curta e impactante que gera curiosidade (máximo 80 chars), com 1 emoji relevante
- Resumo: 3 a 5 linhas resumindo o que aconteceu, por que importa e qual o impacto para quem vende online — use dados e fatos concretos do artigo
- Chamada para ação curta (ex: "Leia o artigo completo 👇", "Salva esse post!")
- Exatamente 3 hashtags: #vendaexponencial + 2 hashtags dinâmicas relevantes ao conteúdo específico (produto, mercado, tema ou plataforma citada)`
    : `- Tenha no máximo 300 caracteres no texto principal
- Seja envolvente e gere curiosidade
- Use 2 a 3 emojis relevantes
- Inclua uma chamada para ação curta (ex: "Salva esse post!", "Comenta o que achou!")
- Termine com exatamente 3 hashtags: #vendaexponencial + 2 hashtags dinâmicas relevantes ao conteúdo específico da notícia (produto, mercado, tema ou plataforma citada)`;

  const prompt = `Você é o copywriter do perfil @vendaexponencial no Instagram, focado em ecommerce e vendas digitais para o mercado brasileiro.

Com base na notícia abaixo, crie uma legenda para o Instagram que:
${estrutura}

IMPORTANTE: Priorize notícias factuais sobre o mercado (tendências, dados, mudanças de comportamento, novidades de plataformas). Se a notícia for puramente um post de blog de uma empresa falando sobre si mesma, serviço próprio ou conteúdo patrocinado/autopromocional, recuse com a mensagem exata: "IRRELEVANTE"

Notícia:
Título: ${news.title}
Resumo: ${news.summary}
Fonte: ${news.source}${artigoTrecho}

Retorne SOMENTE a legenda pronta, sem explicações. Se recusar, retorne apenas "IRRELEVANTE".`;

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: artigo ? 1024 : 512,
    messages: [{ role: 'user', content: prompt }],
  });

  return message.content[0].text.trim();
}

module.exports = { generateCaption };

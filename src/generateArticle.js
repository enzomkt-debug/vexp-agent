require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function generateArticle(news) {
  const prompt = `Você é um jornalista especializado em ecommerce e vendas digitais para o mercado brasileiro, escrevendo para o blog do @vendaexponencial.

Com base na notícia abaixo, escreva um artigo completo em português brasileiro com 600 a 800 palavras, estruturado assim:

1. **Introdução contextual** — situe o leitor no cenário atual do ecommerce/vendas digitais
2. **Desenvolvimento** — aprofunde os dados, fatos e análise da notícia
3. **Impacto para quem vende online no Brasil** — explique o que isso muda na prática para lojistas, afiliados e empreendedores digitais
4. **Conclusão com CTA** — encerre com uma chamada para seguir @vendaexponencial para mais conteúdo sobre vendas digitais

Use linguagem acessível, tom consultivo e direto. Evite jargões desnecessários. Use subtítulos em negrito para separar as seções.

Notícia:
Título: ${news.title}
Resumo: ${news.summary}
Fonte: ${news.source}
URL: ${news.link}

Retorne SOMENTE o artigo pronto, sem comentários adicionais.`;

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1500,
    messages: [{ role: 'user', content: prompt }],
  });

  return message.content[0].text.trim();
}

module.exports = { generateArticle };

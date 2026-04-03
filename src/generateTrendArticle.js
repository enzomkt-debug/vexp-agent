require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const STYLE_RULES = `
ESTILO DE ESCRITA:
- NUNCA use travessão (—) ou hífen como pontuação estilística no meio de frases
- NUNCA use bullet points ou listas com hífen
- NUNCA comece frases com "Vale ressaltar que", "É importante destacar", "Cabe mencionar", "Em suma", "Em conclusão", "Nesse sentido", "Sendo assim"
- NUNCA use expressões genéricas como "no mundo atual", "nos dias de hoje", "cada vez mais", "é fundamental", "é essencial"
- USE frases curtas e diretas alternadas com frases mais longas
- USE exemplos concretos e números específicos quando disponíveis
- Varie o ritmo do texto: parágrafos curtos de impacto intercalados com análises mais detalhadas
- Prefira verbos ativos a passivos
- Cite dados e fontes de forma natural no texto, não como referência acadêmica`.trim();

async function generateTrendArticle(crossRefResult) {
  const {
    trendTerm,
    trendScore,
    peakScore,
    relatedQueries,
    relatedTopics,
    matchedNews,
    noNewsMatch,
  } = crossRefResult;

  const topQueries  = (relatedQueries?.top    || []).slice(0, 3).map((q) => q.query).filter(Boolean);
  const risingQs    = (relatedQueries?.rising || []).slice(0, 3).map((q) => q.query).filter(Boolean);
  const topTopics   = (relatedTopics?.top     || []).slice(0, 3).map((t) => t.title).filter(Boolean);

  const newsSection = noNewsMatch
    ? '(Nenhuma notícia recente foi encontrada sobre este tema — baseie o artigo exclusivamente nos dados de tendência.)'
    : matchedNews.map((n, i) =>
        `Notícia ${i + 1}:\nTítulo: ${n.title}\nFonte: ${n.source}\nResumo: ${n.summary?.slice(0, 300) || '(sem resumo)'}`
      ).join('\n\n');

  const prompt = `Você é um jornalista experiente de negócios conversando com um empreendedor brasileiro. Escreve para o blog do @vendaexponencial, que cobre ecommerce e vendas digitais.

Com base nos dados de tendência e notícias abaixo, escreva um artigo em português brasileiro com 650 a 850 palavras.

${STYLE_RULES}

ESTRUTURA (aplique com naturalidade, sem rigidez):
- Abertura com o dado de tendência mais impactante (use os números: interesse ${trendScore}/100, pico ${peakScore}/100 em abril de 2025 no Brasil)
- Por que esse tema está crescendo agora (use as notícias como evidência, se disponíveis)
- O que esse comportamento de busca revela sobre o consumidor e o mercado
- Oportunidade concreta: o que lojistas, afiliados e empreendedores digitais podem fazer nos próximos 30 dias
- Encerramento com chamada para seguir @vendaexponencial

Use subtítulos em negrito (**Subtítulo**) para separar blocos de texto. Retorne SOMENTE o artigo pronto, sem comentários.

DADOS DE TENDÊNCIA (Google Trends, Brasil, abril de 2025):
- Termo em alta: "${trendTerm}"
- Interesse médio: ${trendScore}/100
- Pico de interesse: ${peakScore}/100
${topQueries.length  ? `- Buscas relacionadas (top): ${topQueries.join(', ')}` : ''}
${risingQs.length    ? `- Buscas em ascensão: ${risingQs.join(', ')}` : ''}
${topTopics.length   ? `- Tópicos associados: ${topTopics.join(', ')}` : ''}

NOTÍCIAS DE SUPORTE:
${newsSection}`;

  const message = await client.messages.create({
    model:      'claude-sonnet-4-6',
    max_tokens: 1800,
    messages:   [{ role: 'user', content: prompt }],
  });

  return message.content[0].text.trim();
}

module.exports = { generateTrendArticle };

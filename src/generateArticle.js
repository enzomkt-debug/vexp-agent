require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function generateArticle(news) {
  const prompt = `Você é um jornalista experiente de negócios conversando com um empreendedor brasileiro. Escreve para o blog do @vendaexponencial, que cobre ecommerce e vendas digitais.

Com base na notícia abaixo, escreva um artigo em português brasileiro com 600 a 800 palavras.

ESTILO DE ESCRITA:
- NUNCA use travessão (—) ou hífen como pontuação estilística no meio de frases
- NUNCA use bullet points ou listas com hífen
- NUNCA comece frases com "Vale ressaltar que", "É importante destacar", "Cabe mencionar", "Em suma", "Em conclusão", "Nesse sentido", "Sendo assim"
- NUNCA use expressões genéricas como "no mundo atual", "nos dias de hoje", "cada vez mais", "é fundamental", "é essencial"
- NUNCA use estrutura previsível de introdução, desenvolvimento e conclusão de forma mecânica
- USE frases curtas e diretas alternadas com frases mais longas
- USE exemplos concretos e números específicos quando disponíveis na notícia
- Varie o ritmo do texto: parágrafos curtos de impacto intercalados com análises mais detalhadas
- Prefira verbos ativos a passivos
- Cite dados e fontes de forma natural no texto, não como referência acadêmica

ESTRUTURA (aplique com naturalidade, sem rigidez):
- Abertura que prende a atenção com o dado ou fato mais impactante da notícia
- Contexto e análise dos dados com voz própria
- O que isso muda na prática para lojistas, afiliados e empreendedores digitais no Brasil
- Encerramento com chamada para seguir @vendaexponencial

Use subtítulos em negrito (**Subtítulo**) para separar blocos de texto. Retorne SOMENTE o artigo pronto, sem comentários.

Notícia:
Título: ${news.title}
Resumo: ${news.summary}
Fonte: ${news.source}
URL: ${news.link}`;

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1500,
    messages: [{ role: 'user', content: prompt }],
  });

  return message.content[0].text.trim();
}

module.exports = { generateArticle };

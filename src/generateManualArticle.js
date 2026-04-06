require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');
const { addAffiliateLinks, classifyAmazonKeywords } = require('./amazonAfiliados');
const { fetchNewsByTema } = require('./fetchNewsByTema');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function generateManualArticle(tema) {
  // Busca notícias recentes sobre o tema para enriquecer o contexto
  const noticias = await fetchNewsByTema(tema);
  console.log(`[generateManualArticle] ${noticias.length} notícias encontradas para "${tema}"`);

  const contextoNoticias = noticias.length > 0
    ? `\nNOTÍCIAS RECENTES SOBRE O TEMA (use como referência de dados e fatos atuais):\n` +
      noticias.map((n, i) =>
        `[${i + 1}] ${n.pubDate ? `(${new Date(n.pubDate).toLocaleDateString('pt-BR')}) ` : ''}${n.title}\nFonte: ${n.source}\n${n.summary ? `Resumo: ${n.summary.slice(0, 300)}` : ''}`
      ).join('\n\n')
    : '';

  const prompt = `Você é um jornalista experiente de negócios conversando com um empreendedor brasileiro. Escreve para o blog do @vendaexponencial, que cobre ecommerce e vendas digitais.

Com base no tema e nas notícias recentes abaixo, escreva um artigo em português brasileiro com 600 a 800 palavras.

ESTILO DE ESCRITA:
- NUNCA use travessão (—) ou hífen como pontuação estilística no meio de frases
- NUNCA use bullet points ou listas com hífen
- NUNCA comece frases com "Vale ressaltar que", "É importante destacar", "Cabe mencionar", "Em suma", "Em conclusão", "Nesse sentido", "Sendo assim"
- NUNCA use expressões genéricas como "no mundo atual", "nos dias de hoje", "cada vez mais", "é fundamental", "é essencial"
- NUNCA use estrutura previsível de introdução, desenvolvimento e conclusão de forma mecânica
- USE frases curtas e diretas alternadas com frases mais longas
- USE dados concretos, números e fatos das notícias fornecidas sempre que possível
- Varie o ritmo do texto: parágrafos curtos de impacto intercalados com análises mais detalhadas
- Prefira verbos ativos a passivos
- Cite fontes de forma natural no texto quando usar dados específicos

ESTRUTURA (aplique com naturalidade, sem rigidez):
- Abertura que prende a atenção com o dado ou fato mais impactante sobre o tema
- Contexto e análise com voz própria, ancorada nos fatos recentes
- O que isso muda na prática para lojistas, afiliados e empreendedores digitais no Brasil
- Encerramento com chamada para seguir @vendaexponencial

Use subtítulos em negrito (**Subtítulo**) para separar blocos de texto. Retorne SOMENTE o artigo pronto, sem comentários.

Tema: ${tema}
${contextoNoticias}`;

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1500,
    messages: [{ role: 'user', content: prompt }],
  });

  const artigo = message.content[0].text.trim();
  const candidates = tema
    .replace(/[^a-zA-ZÀ-ú\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3);
  const keywords = await classifyAmazonKeywords(candidates);
  return addAffiliateLinks(artigo, keywords);
}

module.exports = { generateManualArticle };

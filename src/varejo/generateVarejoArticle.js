require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');
const { addAffiliateLinks, classifyAmazonKeywords } = require('../amazonAfiliados');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MESES = [
  '', 'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

const STYLE_RULES = `
ESTILO DE ESCRITA:
- NUNCA use travessão (—) ou hífen como pontuação estilística no meio de frases
- NUNCA use bullet points ou listas com hífen
- NUNCA comece frases com "Vale ressaltar que", "É importante destacar", "Cabe mencionar", "Em suma", "Em conclusão", "Nesse sentido", "Sendo assim"
- NUNCA use expressões genéricas como "no mundo atual", "nos dias de hoje", "cada vez mais", "é fundamental", "é essencial"
- USE frases curtas e diretas alternadas com frases mais longas
- Varie o ritmo do texto: parágrafos curtos de impacto intercalados com análises
- Prefira verbos ativos a passivos
- Cite os números de interesse do Google Trends de forma natural no texto`.trim();

async function generateVarejoArticle(trendData) {
  const { categoria, period, mainTerm, specificTrends, topSpecific, secondLevelRising } = trendData;
  const periodoLabel = period.label; // ex: "2025-01-03 a 2026-04-03"
  const mesAtual     = MESES[new Date().getMonth() + 1];
  const anoAtual     = new Date().getFullYear();

  // Rising = os não-óbvios, com dados numéricos quando disponíveis
  const risingLines = (specificTrends || []).slice(0, 5).map((t) => {
    if (t.isBreakout) return `${t.keyword} — BREAKOUT (crescimento >5000% vs período anterior)`;
    const pct = t.value && t.value !== 9999 ? ` — alta de +${t.value}% nas buscas` : '';
    const avg = t.avgInterest ? ` | interesse médio ${t.avgInterest}/100` : '';
    return `${t.keyword}${pct}${avg}`;
  });

  // Top = contexto de volume (previsíveis, mas necessários para comparação)
  const topLines = (topSpecific || []).slice(0, 4).map((t) => t.keyword);

  // Drill L2 = sub-modelos/variações do rising mais forte
  const l2Lines = (secondLevelRising || []).slice(0, 4).map((t) => {
    const flag = t.value === 9999 ? ' (Breakout)' : '';
    return `${t.keyword}${flag} [sub-termo de "${t.parentTerm}"]`;
  });

  const topTopics = (mainTerm.relatedTopics?.top || []).slice(0, 4).map((t) => t.title).filter(Boolean);

  const prompt = `Você é um analista de mercado e jornalista de negócios escrevendo para o blog do @vendaexponencial, que cobre ecommerce e vendas digitais para empreendedores brasileiros.

Com base nos dados do Google Trends abaixo, escreva um artigo em português brasileiro com 650 a 850 palavras sobre o comportamento de busca na categoria "${categoria.label}" nos últimos 90 dias no varejo digital brasileiro.

REGRA PRINCIPAL: Foque no que foi SURPREENDENTE, ESPECÍFICO e NÃO-ÓBVIO. Ignore conclusões genéricas como "mulheres compram mais" ou "essa categoria é popular". O leitor já sabe disso. O valor está nos modelos específicos, nas marcas que cresceram de forma inesperada, nas buscas em ascensão que revelam uma mudança de comportamento do consumidor.

Se houver termos "Breakout" nos dados, eles são o coração do artigo: significam crescimento explosivo acima de 5000% comparado ao período anterior. Explique o que pode ter causado esse comportamento.

O tom deve ser: analista que leu os dados e descobriu algo que a maioria não percebeu.

${STYLE_RULES}

DIRETRIZES EDITORIAIS:

O artigo deve ter título e abertura que prendam o leitor imediatamente. NÃO existe um formato fixo — varie a abordagem a cada artigo para que a leitura não canse. Algumas possibilidades (não se limite a elas):
- Abrir com uma pergunta provocadora baseada num dado surpreendente
- Abrir com uma cena ou situação concreta que o consumidor viveu
- Abrir com o dado mais contra-intuitivo dos rising terms
- Abrir com uma afirmação forte que desafia o senso comum do mercado
- Titular com urgência, curiosidade, ou um dado que surpreende

O que NUNCA muda: o artigo deve ter pelo menos um dado numérico concreto (% de crescimento, interesse médio, pico) já no primeiro parágrafo ou no título. O leitor precisa sentir que aprendeu algo que a maioria não sabe.

CONTEÚDO OBRIGATÓRIO (em qualquer ordem que faça sentido narrativo):
- Os produtos/modelos específicos dos rising terms com seus dados de crescimento
- O que esse comportamento revela sobre o consumidor (vai além do óbvio)
- Contraste com os termos de alto volume (previsíveis) para mostrar onde está a oportunidade real
- Ação concreta para lojistas ou afiliados baseada nesses dados
- Encerramento com chamada para seguir @vendaexponencial

Use subtítulos em negrito (**Subtítulo**) para separar blocos. Retorne SOMENTE o artigo, sem comentários.

═══ DADOS DE TENDÊNCIA ═══
Categoria: "${categoria.label}" | Brasil | últimos 90 dias (${periodoLabel})
Fonte: Google Trends (categoria Shopping)

TERMOS EM ASCENSÃO INESPERADA — foco principal do artigo:
${risingLines.length ? risingLines.map(l => `• ${l}`).join('\n') : '• (sem dados de rising)'}

DRILL DE SEGUNDO NÍVEL — sub-modelos em crescimento:
${l2Lines.length ? l2Lines.map(l => `• ${l}`).join('\n') : '• (sem dados)'}

TERMOS COM MAIOR VOLUME (contexto, mais previsíveis):
${topLines.length ? topLines.map(l => `• ${l}`).join('\n') : '• (sem dados)'}

MARCAS E TÓPICOS ASSOCIADOS:
${topTopics.length ? topTopics.map(t => `• ${t}`).join('\n') : '• (sem dados)'}

Interesse médio da categoria: ${mainTerm.avgInterest}/100 | Pico: ${mainTerm.peakInterest}/100

IMPORTANTE: Se os dados de termos específicos estiverem ausentes, não invente hipóteses vagas. Nesse caso, foque no que os números globais da categoria revelam sobre o comportamento atual do consumidor.`;

  const message = await client.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 1800,
    messages:   [{ role: 'user', content: prompt }],
  });

  const artigo = message.content[0].text.trim();
  const candidates = (specificTrends || []).slice(0, 5).map(t => t.keyword).filter(Boolean);
  const keywords = await classifyAmazonKeywords(candidates);
  return addAffiliateLinks(artigo, keywords);
}

async function generateVarejoCaption(trendData) {
  const { categoria, period, mainTerm, specificTrends } = trendData;

  const breakouts = (specificTrends || []).filter((t) => t.isBreakout).map((t) => t.keyword);
  const topRising = (specificTrends || []).filter((t) => !t.isBreakout).slice(0, 2).map((t) => t.keyword);
  const destaques = breakouts.length ? breakouts.slice(0, 2) : topRising;

  const prompt = `Crie uma legenda curta para Instagram (máximo 200 caracteres antes das hashtags) para um post sobre o que está crescendo de forma inesperada em "${categoria.label}" no varejo digital brasileiro nos últimos 90 dias.

${destaques.length ? `Termos com crescimento acima do esperado: ${destaques.join(', ')}` : `Interesse de busca: ${mainTerm.avgInterest}/100`}
Tom: direto, menciona um produto ou modelo específico, surpreende o leitor com um dado não-óbvio. Evite generalizações.

Retorne SOMENTE a legenda + hashtags. Use exatamente 3 hashtags: #vendaexponencial + 2 dinâmicas relevantes ao conteúdo (categoria, produto ou marca específica citada).`;

  const message = await client.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 200,
    messages:   [{ role: 'user', content: prompt }],
  });

  return message.content[0].text.trim();
}

module.exports = { generateVarejoArticle, generateVarejoCaption };

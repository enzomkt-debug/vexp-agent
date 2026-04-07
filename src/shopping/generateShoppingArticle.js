require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');
const { addAffiliateLinks } = require('../amazonAfiliados');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const STYLE_RULES = `
ESTILO DE ESCRITA:
- NUNCA use travessão (—) ou hífen como pontuação estilística no meio de frases
- NUNCA use bullet points ou listas com hífen
- NUNCA comece frases com "Vale ressaltar que", "É importante destacar", "Cabe mencionar", "Em suma", "Em conclusão", "Nesse sentido", "Sendo assim"
- NUNCA use expressões genéricas como "no mundo atual", "nos dias de hoje", "cada vez mais", "é fundamental", "é essencial"
- USE frases curtas e diretas alternadas com frases mais longas
- Varie o ritmo do texto: parágrafos curtos de impacto intercalados com análises
- Prefira verbos ativos a passivos
- Cite preços e nomes de lojas de forma natural no texto`.trim();

async function generateShoppingArticle(shoppingData) {
  const { categoria, products, period } = shoppingData;

  const productLines = (products || []).map((p, i) =>
    `#${i + 1} ${p.title}${p.price ? ` | ${p.price}` : ''}${p.source ? ` | Loja: ${p.source}` : ''}${p.rating ? ` | Avaliação: ${p.rating}` : ''}${p.reviews ? ` (${p.reviews} avaliações)` : ''}`
  );

  const prompt = `Você é um analista de mercado e jornalista de negócios escrevendo para o blog do @vendaexponencial, que cobre ecommerce e vendas digitais para empreendedores brasileiros.

Com base nos dados de produtos mais vendidos no Google Shopping abaixo, escreva um artigo em português brasileiro com 600 a 800 palavras sobre o que está sendo comprado agora na categoria "${categoria.label}".

FOCO PRINCIPAL: O que esses produtos revelam sobre o comportamento do consumidor hoje. Quais produtos lideram, por qual preço, em quais lojas, e o que isso diz sobre as preferências do comprador brasileiro neste momento.

O tom deve ser: analista que leu os dados de vendas e descobriu padrões que a maioria dos lojistas não percebeu.

${STYLE_RULES}

DIRETRIZES EDITORIAIS:
- Abrir com um dado concreto de produto (preço, posição, loja) que surpreenda
- Citar ao menos 3 produtos específicos com preços e lojas
- Analisar o que a faixa de preço dos líderes revela sobre o mercado
- Identificar padrões: marcas dominantes, faixas de preço recorrentes, lojas mais frequentes
- Incluir ação concreta para lojistas ou afiliados
- Encerrar com chamada para seguir @vendaexponencial

Use subtítulos em negrito (**Subtítulo**) para separar blocos. Retorne SOMENTE o artigo, sem comentários.

═══ DADOS DO GOOGLE SHOPPING ═══
Categoria: "${categoria.label}" | Brasil | ${period.label}
Fonte: Google Shopping

TOP PRODUTOS MAIS VENDIDOS AGORA:
${productLines.length ? productLines.map(l => `• ${l}`).join('\n') : '• (sem dados disponíveis)'}

IMPORTANTE: Se os dados de produtos estiverem ausentes, foque no comportamento geral do consumidor na categoria com base no que é conhecido sobre o mercado brasileiro.`;

  const message = await client.messages.create({
    model:      'claude-sonnet-4-6',
    max_tokens: 1500,
    messages:   [{ role: 'user', content: prompt }],
  });

  const artigo = message.content[0].text.trim();
  const keywords = (products || []).slice(0, 3).map((p) => p.title).filter(Boolean);
  return addAffiliateLinks(artigo, keywords);
}

async function generateShoppingCaption(shoppingData, artigo = null) {
  const { categoria, products } = shoppingData;

  const topProduct = (products || [])[0];
  const destaque = topProduct
    ? `Produto #1: ${topProduct.title}${topProduct.price ? ` por ${topProduct.price}` : ''}${topProduct.source ? ` na ${topProduct.source}` : ''}`
    : `Categoria: ${categoria.label}`;

  const artigoTrecho = artigo ? `\n\nTrecho do artigo:\n${artigo.slice(0, 600).trim()}` : '';

  const prompt = `Você é o copywriter do perfil @vendaexponencial no Instagram, focado em ecommerce e vendas digitais para o mercado brasileiro.

Crie uma legenda para Instagram sobre os produtos mais vendidos em "${categoria.label}" no Google Shopping, com a seguinte estrutura:
- Linha de abertura: frase curta e impactante que gera curiosidade (máximo 80 chars), com 1 emoji relevante
- Resumo: 3 a 5 linhas com dados concretos do artigo (produto, preço, loja, tendência de mercado)
- Chamada para ação curta (ex: "Leia o artigo completo 👇", "Salva esse post!")
- Exatamente 3 hashtags: #vendaexponencial + 2 dinâmicas relevantes (categoria, produto ou loja específica citada)

${destaque}${artigoTrecho}

Retorne SOMENTE a legenda pronta, sem explicações.`;

  const message = await client.messages.create({
    model:      'claude-sonnet-4-6',
    max_tokens: 1024,
    messages:   [{ role: 'user', content: prompt }],
  });

  return message.content[0].text.trim();
}

module.exports = { generateShoppingArticle, generateShoppingCaption };

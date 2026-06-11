require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Quantidade de slides de conteúdo (entre capa e CTA). Total = conteudo + 2.
const MIN_SLIDES = 3;
const MAX_SLIDES = 5;

// Extrai o primeiro objeto JSON de um texto, mesmo que venha com cercas ```json
function extrairJson(texto) {
  if (!texto) return null;
  const limpo = texto.replace(/```json/gi, '').replace(/```/g, '').trim();
  const ini = limpo.indexOf('{');
  const fim = limpo.lastIndexOf('}');
  if (ini === -1 || fim === -1 || fim <= ini) return null;
  try {
    return JSON.parse(limpo.slice(ini, fim + 1));
  } catch {
    return null;
  }
}

/**
 * Gera o conteúdo estruturado de um carrossel de LinkedIn a partir de um artigo.
 * Retorna { categoria, capa:{titulo,gancho}, slides:[{titulo,texto}], cta:{titulo,texto}, legenda }
 * ou null em caso de falha.
 */
async function generateCarouselContent({ titulo, fonte, url_fonte, artigo_completo }) {
  if (!artigo_completo) return null;

  const prompt = `Você é um estrategista de conteúdo escrevendo um CARROSSEL de LinkedIn para a página Venda Exponencial, voltada a quem TOMA DECISÃO COMERCIAL no varejo digital brasileiro: gestores comerciais, de marketing e de e-commerce, lojistas e operadores de marketplace.

PÚBLICO-ALVO E ÂNGULO (regra mais importante):
- Escreva de OPERADOR para OPERADOR. Cada slide deve responder "o que isso muda na PRÁTICA do meu negócio?": vendas, conversão, ticket, margem operacional, CAC, sortimento, precificação, canais de venda, logística e relação com marketplaces.
- NÃO escreva para o público do mercado financeiro. Evite enquadramento de investidor (valuation, múltiplos, ações/bolsa, juros, macroeconomia) a menos que se traduza diretamente numa decisão de quem opera a loja.

A partir do artigo abaixo, produza um carrossel com ${MIN_SLIDES} a ${MAX_SLIDES} slides de conteúdo (além da capa e do slide final de chamada). O carrossel deve ser ANALÍTICO, com dados concretos, e desenhado para alta retenção (cada slide entrega uma ideia que puxa o próximo).

Responda APENAS com um objeto JSON válido, sem comentários, sem markdown, sem texto fora do JSON, exatamente nesta forma:

{
  "categoria": "<rótulo curto em CAIXA ALTA, máx 18 caracteres, ex: TENDÊNCIA, MARKETPLACE, LOGÍSTICA>",
  "capa": {
    "titulo": "<gancho forte e curto, máx 60 caracteres, sem ponto final>",
    "gancho": "<uma linha de apoio que cria curiosidade, máx 90 caracteres>"
  },
  "slides": [
    {
      "titulo": "<título do slide, máx 40 caracteres>",
      "texto": "<1 a 3 frases curtas com 1 dado concreto e a análise, máx 220 caracteres>"
    }
  ],
  "cta": {
    "titulo": "<chamada final curta, máx 45 caracteres>",
    "texto": "<convite para comentar/seguir, máx 120 caracteres>"
  },
  "legenda": "<texto NATIVO do post de LinkedIn, 600 a 1100 caracteres, tom editorial e analítico de OPERADOR para OPERADOR (como um head de e-commerce ou consultor de varejo falando com colegas de gestão). NÃO use registro de jornalismo econômico/mercado financeiro (Valor, Brazil Journal, mercado de capitais), que atrai o público errado. Primeira linha é uma tese forte que funciona sozinha. Termina com uma pergunta específica ancorada numa decisão comercial/operacional. No máximo 2 hashtags minúsculas e específicas no fim. PROIBIDO: emoji decorativo, 'salva esse post', 'fica de olho', negrito markdown, ALL CAPS, link, URL, 'Fonte:', hashtag de marca.>"
}

REGRAS DE CONTEÚDO:
- Português do Brasil, sem travessão (—) como pontuação estilística.
- Cada slide deve ter densidade: priorize números, percentuais, prazos e comparações que estejam no artigo.
- Não invente dados que não estejam no artigo. Se faltar número, use a análise qualitativa.
- Os títulos dos slides não podem se repetir nem ser genéricos ("Introdução", "Conclusão").
- Sempre que possível, traduza o dado numa implicação operacional concreta para quem opera a loja (o que fazer com preço, canal, sortimento, estoque ou margem).
- A "legenda" é o texto que acompanha o carrossel; não descreva os slides nela, escreva um post próprio.

ARTIGO DE ORIGEM:
Título: ${titulo}
Fonte: ${fonte || 'n/d'}
Conteúdo:
${artigo_completo}`;

  let raw;
  try {
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    });
    raw = message.content[0].text.trim();
  } catch (err) {
    console.error('[generateCarouselContent] Erro na API:', err.message);
    return null;
  }

  const data = extrairJson(raw);
  if (!data || !data.capa || !Array.isArray(data.slides) || data.slides.length === 0) {
    console.error('[generateCarouselContent] JSON inválido ou incompleto.');
    return null;
  }

  // Normaliza e limita a quantidade de slides
  const slides = data.slides
    .filter((s) => s && (s.titulo || s.texto))
    .slice(0, MAX_SLIDES)
    .map((s) => ({ titulo: String(s.titulo || '').trim(), texto: String(s.texto || '').trim() }));

  return {
    categoria: String(data.categoria || 'ECOMMERCE').trim().slice(0, 18).toUpperCase(),
    capa: {
      titulo: String(data.capa.titulo || titulo).trim(),
      gancho: String(data.capa.gancho || '').trim(),
    },
    slides,
    cta: {
      titulo: String(data.cta?.titulo || 'Quer aprofundar?').trim(),
      texto: String(data.cta?.texto || 'Siga @vendaexponencial e comente o que achou.').trim(),
    },
    legenda: data.legenda ? String(data.legenda).trim() : null,
  };
}

module.exports = { generateCarouselContent, MIN_SLIDES, MAX_SLIDES };

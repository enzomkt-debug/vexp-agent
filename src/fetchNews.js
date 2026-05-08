const Parser = require('rss-parser');
const parser = new Parser();

// Fontes prioritárias: portais especializados em ecommerce (intercalados na fila)
const PRIORITY_FEEDS = [
  'https://www.ecommercebrasil.com.br/feed/',
  'https://portalnovarejo.com.br/feed/',
  'https://mercadoeconsumo.com.br/feed/',
];

const OTHER_FEEDS = [
  // Portais de notícias gerais com cobertura de varejo
  'https://www.abcomm.org.br/feed/',
  'https://www.infomoney.com.br/feed/',
  'https://exame.com/feed/',
  'https://economia.uol.com.br/rss.xml',
  'https://www.moneytimes.com.br/feed/',
  // Fontes internacionais (grandes movimentos de mercado)
  'https://techcrunch.com/category/commerce/feed/',
  'https://www.retaildive.com/feeds/news/',
  'https://www.modernretail.co/feed/',
  // Google News — queries específicas para notícias de impacto
  'https://news.google.com/rss/search?q="Mercado+Livre"+OR+"Shopee"+OR+"Amazon+Brasil"+OR+"Magazine+Luiza"&hl=pt-BR&gl=BR&ceid=BR:pt',
  'https://news.google.com/rss/search?q="Shein"+OR+"Temu"+OR+"TikTok+Shop"+OR+"imposto+importação"&hl=pt-BR&gl=BR&ceid=BR:pt',
  'https://news.google.com/rss/search?q="ecommerce"+faturamento+OR+resultado+OR+crescimento+OR+queda&hl=pt-BR&gl=BR&ceid=BR:pt',
  'https://news.google.com/rss/search?q="varejo+digital"+OR+"vendas+online"+recorde+OR+crise+OR+alta+OR+bilhão&hl=pt-BR&gl=BR&ceid=BR:pt',
];

const RELEVANCE_KEYWORDS = [
  'ecommerce', 'e-commerce', 'loja virtual', 'loja online',
  'marketplace', 'mercado livre', 'shopee', 'amazon', 'magazine luiza', 'magalu',
  'shein', 'temu', 'tiktok shop', 'alibaba',
  'varejo digital', 'varejo online', 'vendas online',
  'faturamento', 'receita', 'pix', 'checkout',
  'fulfillment', 'logística', 'entrega', 'frete',
  'retail', 'commerce', 'shopify', 'direct-to-consumer', 'dtc',
];

const BLOCKED_DOMAINS = [
  'olhardigital.com.br',
  'tecmundo.com.br',
  'canaltech.com.br',
  'resultadosdigitais.com.br',  // blog corporativo RD Station
  'rockcontent.com',             // blog corporativo
  'neilpatel.com',               // blog corporativo
];

function isRelevant(item) {
  if (BLOCKED_DOMAINS.some((domain) => (item.link || '').includes(domain))) return false;
  const text = `${item.title} ${item.summary}`.toLowerCase();
  return RELEVANCE_KEYWORDS.some((kw) => text.includes(kw));
}

function extractGoogleNewsSource(rawTitle) {
  // Google News titles end with " - Source Name"
  const parts = rawTitle.split(' - ');
  if (parts.length >= 2) return parts[parts.length - 1].trim();
  return null;
}

function cleanGoogleNewsTitle(rawTitle) {
  const parts = rawTitle.split(' - ');
  if (parts.length >= 2) return parts.slice(0, -1).join(' - ').trim();
  return rawTitle;
}

async function fetchFeed(feedUrl, isPriority) {
  const isGoogleNews = feedUrl.includes('news.google.com');
  // Fontes prioritárias buscam mais itens para ter mais opções
  const maxItems = isPriority ? 20 : 10;
  try {
    const feed = await parser.parseURL(feedUrl);
    const items = (feed.items || []).slice(0, maxItems).map((item) => {
      const rawTitle = item.title || '';
      const title  = isGoogleNews ? cleanGoogleNewsTitle(rawTitle) : rawTitle;
      const source = isGoogleNews
        ? (extractGoogleNewsSource(rawTitle) || feed.title || feedUrl)
        : (feed.title || feedUrl);
      return {
        title,
        link:    item.link || '',
        summary: item.contentSnippet || item.content || '',
        source,
        pubDate: item.pubDate || new Date().toISOString(),
        priority: isPriority,
      };
    });

    const relevant = isPriority
      ? items   // fontes prioritárias já são especializadas, não filtrar
      : items.filter(isRelevant);

    if (relevant.length === 0) {
      console.warn(`[fetchNews] Nenhuma notícia relevante em ${feedUrl} — pulando.`);
    }
    return relevant;
  } catch (err) {
    console.warn(`[fetchNews] Falha ao carregar feed ${feedUrl}: ${err.message}`);
    return [];
  }
}

async function fetchLatestNews() {
  const priorityItems = [];
  const otherItems = [];

  // Buscar todos os feeds em paralelo
  const priorityResults = await Promise.all(
    PRIORITY_FEEDS.map((url) => fetchFeed(url, true))
  );
  const otherResults = await Promise.all(
    OTHER_FEEDS.map((url) => fetchFeed(url, false))
  );

  for (const items of priorityResults) priorityItems.push(...items);
  for (const items of otherResults) otherItems.push(...items);

  // Ordenar cada grupo por data
  priorityItems.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
  otherItems.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

  // Intercalar: a cada 2 notícias, 1 é de fonte prioritária
  const merged = [];
  let pi = 0, oi = 0;
  while (pi < priorityItems.length || oi < otherItems.length) {
    if (pi < priorityItems.length) merged.push(priorityItems[pi++]);
    if (oi < otherItems.length) merged.push(otherItems[oi++]);
    if (oi < otherItems.length) merged.push(otherItems[oi++]);
  }

  console.log(`[fetchNews] ${priorityItems.length} prioritárias + ${otherItems.length} outras = ${merged.length} total`);
  return merged;
}

module.exports = { fetchLatestNews };

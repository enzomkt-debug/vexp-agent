const Parser = require('rss-parser');
const parser = new Parser();

// Fontes prioritárias: portais especializados em ecommerce (intercalados na fila)
const PRIORITY_FEEDS = [
  'https://www.ecommercebrasil.com.br/feed/',
  'https://portalnovarejo.com.br/feed/',
  'https://mercadoeconsumo.com.br/feed/',
];

// Monta a URL de uma busca do Google News em pt-BR.
// O operador `when:7d` limita aos últimos 7 dias (notícia fresca);
// parênteses agrupam os OR para a precedência booleana ficar correta.
function googleNewsFeed(query) {
  const q = encodeURIComponent(`${query} when:7d`);
  return `https://news.google.com/rss/search?q=${q}&hl=pt-BR&gl=BR&ceid=BR:pt`;
}

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
  // Google News — eixos temáticos (últimos 7 dias, OR agrupados)
  // Marketplaces e plataformas de ecommerce
  googleNewsFeed('("Mercado Livre" OR Shopee OR "Amazon Brasil" OR AliExpress OR Nuvemshop OR VTEX OR Shopify)'),
  // Grandes varejistas e redes
  googleNewsFeed('("Magazine Luiza" OR Magalu OR Americanas OR "Casas Bahia" OR Renner OR "Mercado Pago")'),
  // Cross-border / importação
  googleNewsFeed('(Shein OR Temu OR "TikTok Shop") (Brasil OR importação OR taxação OR "remessa conforme")'),
  // Resultados e desempenho de mercado
  googleNewsFeed('ecommerce (faturamento OR resultado OR crescimento OR vendas OR investimento)'),
  // Logística e pagamentos
  googleNewsFeed('(ecommerce OR "varejo digital") (logística OR "última milha" OR frete OR fulfillment OR Pix OR checkout)'),
  // Regulação e tendências
  googleNewsFeed('(ecommerce OR "varejo digital") (regulação OR tributação OR "inteligência artificial" OR "live commerce" OR "social commerce")'),
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

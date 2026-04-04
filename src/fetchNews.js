const Parser = require('rss-parser');
const parser = new Parser();

const RSS_FEEDS = [
  // Blogs brasileiros de vendas/marketing
  'https://resultadosdigitais.com.br/feed/',
  'https://conversion.com.br/blog/feed/',
  'https://marketingdeconteudo.com/feed/',
  'https://www.agendor.com.br/blog/feed/',
  'https://meetime.com.br/blog/feed/',
  // Portais especializados em ecommerce e varejo
  'https://www.ecommercebrasil.com.br/feed/',
  'https://portalnovarejo.com.br/feed/',
  'https://mercadoeconsumo.com.br/feed/',
  'https://www.abcomm.org.br/feed/',
  // Google News — tópicos de ecommerce e varejo digital
  'https://news.google.com/rss/search?q=ecommerce+OR+"vendas+online"+OR+"loja+virtual"&hl=pt-BR&gl=BR&ceid=BR:pt',
  'https://news.google.com/rss/search?q=marketing+digital+OR+"trafego+pago"+OR+"conversao"&hl=pt-BR&gl=BR&ceid=BR:pt',
  'https://news.google.com/rss/search?q=marketplace+OR+"varejo+digital"+OR+faturamento&hl=pt-BR&gl=BR&ceid=BR:pt',
];

const RELEVANCE_KEYWORDS = [
  'ecommerce', 'e-commerce', 'vendas', 'digital', 'marketing',
  'loja', 'cliente', 'conversão', 'conversao', 'tráfego', 'trafego',
  'receita', 'faturamento', 'varejo', 'marketplace',
];

const BLOCKED_DOMAINS = [
  'olhardigital.com.br',
  'tecmundo.com.br',
  'canaltech.com.br',
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

async function fetchLatestNews() {
  const allItems = [];

  for (const feedUrl of RSS_FEEDS) {
    const isGoogleNews = feedUrl.includes('news.google.com');
    try {
      const feed = await parser.parseURL(feedUrl);
      const items = (feed.items || []).slice(0, 10).map((item) => {
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
        };
      });

      const relevant = items.filter(isRelevant);
      if (relevant.length === 0) {
        console.warn(`[fetchNews] Nenhuma notícia relevante em ${feedUrl} — pulando.`);
        continue;
      }

      allItems.push(...relevant);
    } catch (err) {
      console.warn(`[fetchNews] Falha ao carregar feed ${feedUrl}: ${err.message}`);
    }
  }

  // Sort by date descending
  allItems.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
  return allItems;
}

module.exports = { fetchLatestNews };

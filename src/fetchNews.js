const Parser = require('rss-parser');
const parser = new Parser();

const RSS_FEEDS = [
  'https://resultadosdigitais.com.br/feed/',
  'https://conversion.com.br/blog/feed/',
  'https://marketingdeconteudo.com/feed/',
  'https://www.agendor.com.br/blog/feed/',
  'https://meetime.com.br/blog/feed/',
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

async function fetchLatestNews() {
  const allItems = [];

  for (const feedUrl of RSS_FEEDS) {
    try {
      const feed = await parser.parseURL(feedUrl);
      const items = (feed.items || []).slice(0, 10).map((item) => ({
        title: item.title || '',
        link: item.link || '',
        summary: item.contentSnippet || item.content || '',
        source: feed.title || feedUrl,
        pubDate: item.pubDate || new Date().toISOString(),
      }));

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

const Parser = require('rss-parser');
const parser = new Parser();

const RSS_FEEDS = [
  'https://www.ecommercebrasil.com.br/feed/',
  'https://www.meioemensagem.com.br/feed/',
  'https://olhardigital.com.br/feed/',
  'https://www.startups.com.br/feed/',
  'https://feeds.feedburner.com/blogdoecommerce',
];

async function fetchLatestNews() {
  const allItems = [];

  for (const feedUrl of RSS_FEEDS) {
    try {
      const feed = await parser.parseURL(feedUrl);
      const items = (feed.items || []).slice(0, 5).map((item) => ({
        title: item.title || '',
        link: item.link || '',
        summary: item.contentSnippet || item.content || '',
        source: feed.title || feedUrl,
        pubDate: item.pubDate || new Date().toISOString(),
      }));
      allItems.push(...items);
    } catch (err) {
      console.warn(`[fetchNews] Falha ao carregar feed ${feedUrl}: ${err.message}`);
    }
  }

  // Sort by date descending, return freshest
  allItems.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
  return allItems;
}

module.exports = { fetchLatestNews };

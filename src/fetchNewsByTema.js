const Parser = require('rss-parser');
const parser = new Parser();

async function fetchNewsByTema(tema) {
  const query = encodeURIComponent(tema);
  const feedUrl = `https://news.google.com/rss/search?q=${query}&hl=pt-BR&gl=BR&ceid=BR:pt`;

  let items = [];
  try {
    const feed = await parser.parseURL(feedUrl);
    items = (feed.items || []).slice(0, 8).map((item) => {
      const rawTitle = item.title || '';
      const parts = rawTitle.split(' - ');
      const title  = parts.length >= 2 ? parts.slice(0, -1).join(' - ').trim() : rawTitle;
      const source = parts.length >= 2 ? parts[parts.length - 1].trim() : feedUrl;
      return {
        title,
        source,
        link:    item.link || '',
        summary: item.contentSnippet || item.content || '',
        pubDate: item.pubDate || '',
      };
    });
  } catch (err) {
    console.warn(`[fetchNewsByTema] Falha ao buscar notícias para "${tema}": ${err.message}`);
  }

  return items;
}

module.exports = { fetchNewsByTema };

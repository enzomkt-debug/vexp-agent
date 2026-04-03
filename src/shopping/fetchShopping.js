const axios = require('axios');

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchShoppingResults(keyword) {
  try {
    const { data } = await axios.get('https://api.scaleserp.com/search', {
      params: {
        q:             keyword,
        search_type:   'shopping',
        gl:            'br',
        hl:            'pt-br',
        location:      'Brazil',
        google_domain: 'google.com.br',
        num:           10,
        api_key:       process.env.SCALESERP_KEY,
      },
      timeout: 15000,
    });

    return (data.shopping_results || []).map((item) => ({
      title:     item.title                          || '',
      price:     item.price                          || null,
      rating:    item.rating                         || null,
      reviews:   item.reviews                        || null,
      source:    item.merchant || item.source        || null,
      thumbnail: item.image   || item.thumbnail      || null,
      link:      item.link                           || null,
      position:  item.position                       || 999,
    }));
  } catch (err) {
    console.warn(`[fetchShopping] Erro ao buscar "${keyword}": ${err.message}`);
    return [];
  }
}

function titlesAreSimilar(a, b) {
  const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return true;
  const short = Math.min(na.length, nb.length, 30);
  return short > 10 && na.slice(0, short) === nb.slice(0, short);
}

async function fetchShoppingData(categoria) {
  const keywords = (categoria.keywords || []).slice(0, 2);
  const allResults = [];

  for (let i = 0; i < keywords.length; i++) {
    const kw = keywords[i];
    console.log(`[fetchShopping] Buscando "${kw}"...`);
    const results = await fetchShoppingResults(kw);
    allResults.push(...results);

    if (i < keywords.length - 1) await delay(1000);
  }

  // Remove duplicatas por título similar
  const deduped = [];
  for (const item of allResults) {
    const isDupe = deduped.some((existing) => titlesAreSimilar(existing.title, item.title));
    if (!isDupe) deduped.push(item);
  }

  const products = deduped
    .sort((a, b) => a.position - b.position)
    .slice(0, 5);

  return {
    categoria,
    products,
    period: { label: 'Hoje' },
    source: 'Google Shopping',
  };
}

module.exports = { fetchShoppingData };

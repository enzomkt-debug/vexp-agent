const axios = require('axios');

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// Mapa de categoria → ID MLB do Mercado Livre
const MLB_CATEGORY_MAP = {
  'moda-feminina':      'MLB1051',
  'moda-masculina':     'MLB1051',
  'calcados':           'MLB1430',
  'smartphones':        'MLB1648',
  'notebooks':          'MLB1652',
  'tv-eletronicos':     'MLB1000',
  'games':              'MLB1144',
  'beleza-cosmeticos':  'MLB1246',
  'suplementos':        'MLB1297',
  'casa-decoracao':     'MLB1574',
  'moveis':             'MLB1574',
  'utensilios':         'MLB1574',
  'eletrodomesticos':   'MLB1574',
  'livros':             'MLB1193',
  'esportes':           'MLB1297',
  'ferramentas':        'MLB1499',
  'pet':                'MLB1132',
  'brinquedos':         'MLB5726',
  'bebe':               'MLB1276',
  'joias-relogios':     'MLB1182',
  'informatica':        'MLB1652',
  'automotivo':         'MLB1747',
  'saude':              'MLB1246',
  'bolsas':             'MLB1430',
  'infantil-roupas':    'MLB1276',
  'alimentos-delivery':'MLB1172',
  'papelaria':          'MLB1574',
  'oculos':             'MLB1182',
  'streaming-digital':  'MLB1144',
  'cama-banho':         'MLB1574',
  'audio':              'MLB1000',
};

let cachedToken = null;
let tokenExpiry  = 0;

async function getAccessToken() {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;

  const { data } = await axios.post('https://api.mercadolibre.com/oauth/token', null, {
    params: {
      grant_type:    'client_credentials',
      client_id:     process.env.ML_APP_ID,
      client_secret: process.env.ML_SECRET_KEY,
    },
    timeout: 10000,
  });

  cachedToken = data.access_token;
  tokenExpiry  = Date.now() + (data.expires_in - 60) * 1000; // renova 1min antes
  return cachedToken;
}

async function fetchShoppingData(categoria) {
  const categoryId = MLB_CATEGORY_MAP[categoria.id];

  if (!categoryId) {
    console.warn(`[fetchShopping] Categoria sem mapeamento MLB: ${categoria.id}`);
    return { categoria, products: [], period: { label: 'Hoje' }, source: 'Mercado Livre' };
  }

  let token;
  try {
    token = await getAccessToken();
  } catch (err) {
    console.warn(`[fetchShopping] Erro ao obter token ML: ${err.message}`);
    return { categoria, products: [], period: { label: 'Hoje' }, source: 'Mercado Livre' };
  }

  try {
    await delay(500);
    const { data } = await axios.get('https://api.mercadolibre.com/sites/MLB/search', {
      params: {
        category: categoryId,
        sort:     'sold_quantity_desc',
        limit:    8,
      },
      headers: { Authorization: `Bearer ${token}` },
      timeout: 15000,
    });

    const products = (data.results || []).slice(0, 5).map((item, i) => ({
      title:     item.title      || '',
      price:     item.price      ? `R$ ${item.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : null,
      rating:    item.reviews?.rating_average || null,
      reviews:   item.reviews?.total          || null,
      source:    item.seller?.nickname         || null,
      thumbnail: item.thumbnail?.replace('-I.jpg', '-O.jpg') || item.thumbnail || null,
      link:      item.permalink  || null,
      position:  i + 1,
    }));

    console.log(`[fetchShopping] ${products.length} produtos coletados para "${categoria.label}" (${categoryId})`);
    return { categoria, products, period: { label: 'Hoje' }, source: 'Mercado Livre' };

  } catch (err) {
    console.warn(`[fetchShopping] Erro ao buscar produtos ML: ${err.message}`);
    return { categoria, products: [], period: { label: 'Hoje' }, source: 'Mercado Livre' };
  }
}

module.exports = { fetchShoppingData };

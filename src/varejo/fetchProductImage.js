const axios = require('axios');

const WIKI_API = 'https://commons.wikimedia.org/w/api.php';
const WIKI_HEADERS = { 'User-Agent': 'vexp-agent/1.0 (ecommerce-trends-bot)' };
const UNSPLASH_KEY = process.env.UNSPLASH_ACCESS_KEY;

async function fetchProductImage(keyword, categoriaLabel = '') {
  // Remove ruído e palavras PT-BR genéricas
  const clean = keyword
    .replace(/\b(produto|comprar|preço|barato|oferta|brasil|novo|melhor)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  const categoryHint = getCategoryHint(categoriaLabel);

  try {
    const base  = clean;
    const short = clean.split(' ').slice(0, 2).join(' ');
    const brand = clean.split(' ')[0];

    // 1. Tenta Unsplash (qualidade superior)
    if (UNSPLASH_KEY) {
      const attempts = [
        `${base} ${categoryHint}`.trim(),
        `${short} ${categoryHint}`.trim(),
        `${brand} ${categoryHint}`.trim(),
      ];
      for (const query of attempts) {
        const url = await searchUnsplashImage(query);
        if (url) return url;
      }
    }

    // 2. Fallback: Wikimedia Commons
    const attempts = [
      `${base} ${categoryHint}`.trim(),
      `${short} ${categoryHint}`.trim(),
      `${base}`,
      `${brand} ${categoryHint}`.trim(),
    ];
    for (const query of attempts) {
      const url = await searchCommonsImage(query);
      if (url) return url;
    }

    return null;
  } catch {
    return null;
  }
}

async function searchUnsplashImage(query) {
  try {
    const { data } = await axios.get('https://api.unsplash.com/search/photos', {
      params: { query, per_page: 5, orientation: 'squarish' },
      headers: { Authorization: `Client-ID ${UNSPLASH_KEY}` },
      timeout: 8000,
    });
    const results = data?.results || [];
    if (!results.length) return null;
    return results[0].urls?.regular || null;
  } catch {
    return null;
  }
}

// Mapa de categorias para termos em inglês (Wikimedia Commons é majoritariamente EN)
function getCategoryHint(label = '') {
  const l = label.toLowerCase();
  if (/cal[çc]ado|t[êe]nis|sapat|sandal/.test(l)) return 'shoe sneaker';
  if (/celular|smartphone|iphone|android/.test(l)) return 'smartphone mobile';
  if (/tv|televi|smart tv/.test(l)) return 'television display';
  if (/notebook|laptop|comput/.test(l)) return 'laptop computer';
  if (/roupa|vest|cami|calç[ao]|moda/.test(l)) return 'clothing fashion';
  if (/eletrodom|geladeira|fog[ão]|maquina/.test(l)) return 'appliance';
  if (/m[óo]vel|sof[áa]|cadeira|cama/.test(l)) return 'furniture';
  if (/bel[ae]za|cosm[ée]tic|perfume|maquiagem/.test(l)) return 'cosmetic beauty';
  if (/brinqued|jog[oa]|game/.test(l)) return 'toy game';
  if (/livr[oa]|libro/.test(l)) return 'book';
  return 'product';
}

async function searchCommonsImage(query) {
  try {
    // Passo 1: buscar arquivo de imagem no Commons
    const searchResp = await axios.get(WIKI_API, {
      params: {
        action: 'query',
        list: 'search',
        srsearch: query,
        srnamespace: 6,      // namespace 6 = Arquivos/Files
        srlimit: 5,
        srwhat: 'text',
        format: 'json',
        origin: '*',
      },
      headers: WIKI_HEADERS,
      timeout: 8000,
    });

    const results = searchResp.data?.query?.search || [];
    // Filtrar por extensões de imagem comuns
    const imageFiles = results.filter(r =>
      /\.(jpg|jpeg|png|webp)$/i.test(r.title)
    );
    if (!imageFiles.length) return null;

    // Passo 2: obter URL direta do primeiro resultado de imagem
    const fileTitle = imageFiles[0].title;
    const infoResp = await axios.get(WIKI_API, {
      params: {
        action: 'query',
        titles: fileTitle,
        prop: 'imageinfo',
        iiprop: 'url',
        iiurlwidth: 600,
        format: 'json',
        origin: '*',
      },
      headers: WIKI_HEADERS,
      timeout: 8000,
    });

    const pages = Object.values(infoResp.data?.query?.pages || {});
    const thumbUrl = pages[0]?.imageinfo?.[0]?.thumburl;
    const fullUrl  = pages[0]?.imageinfo?.[0]?.url;

    return thumbUrl || fullUrl || null;
  } catch {
    return null;
  }
}

module.exports = { fetchProductImage };

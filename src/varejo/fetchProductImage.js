const axios = require('axios');

const WIKI_API = 'https://commons.wikimedia.org/w/api.php';
const WIKI_HEADERS = { 'User-Agent': 'vexp-agent/1.0 (ecommerce-trends-bot)' };

/**
 * Busca imagem do produto via Wikimedia Commons (gratuito, sem API key).
 * Aceita keyword do produto e opcionalmente o label da categoria para refinar.
 * Retorna URL da imagem ou null se não encontrar.
 */
async function fetchProductImage(keyword, categoriaLabel = '') {
  // Remove ruído e palavras PT-BR genéricas
  const clean = keyword
    .replace(/\b(produto|comprar|preço|barato|oferta|brasil|novo|melhor)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Sufixo de contexto baseado na categoria (melhora resultados do Commons)
  const categoryHint = getCategoryHint(categoriaLabel);

  try {
    const base   = clean;
    const brand  = clean.split(' ')[0];          // só a marca/modelo
    const short  = clean.split(' ').slice(0, 2).join(' '); // marca + modelo

    // Ordem de tentativas: mais específico → mais genérico
    const attempts = [
      `${base} ${categoryHint}`.trim(),          // ex: "Nike Pegasus Turbo shoe"
      `${short} ${categoryHint}`.trim(),          // ex: "Nike Pegasus shoe"
      `${base}`,                                  // ex: "Nike Pegasus Turbo"
      `${brand} ${categoryHint}`.trim(),          // ex: "Nike shoe"
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

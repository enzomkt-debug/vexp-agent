require('dotenv').config();
const { getCategoriaParaDia, CATEGORIAS } = require('../varejo/categorias');
const { fetchShoppingData }               = require('./fetchShopping');
const { generateShoppingArticle, generateShoppingCaption } = require('./generateShoppingArticle');
const { supabase } = require('../supabaseClient');

const FONTE_SHOPPING = 'Google Shopping';

// Verifica se já existe um post desta categoria nos últimos 30 dias
async function categoriaJaPostadaRecente(categoriaId) {
  const limite = new Date();
  limite.setDate(limite.getDate() - 30);

  const { data } = await supabase
    .from('noticias')
    .select('id')
    .eq('fonte', FONTE_SHOPPING)
    .ilike('url_original', `%categoria:${categoriaId}%`)
    .gte('publicado_em', limite.toISOString())
    .limit(1);

  return data && data.length > 0;
}

// Escolhe a categoria do dia com offset de +15 para não coincidir com varejo
async function escolherCategoria() {
  const diaBase = ((new Date().getDate() - 1 + 15) % CATEGORIAS.length) + 1;

  for (let offset = 0; offset < CATEGORIAS.length; offset++) {
    const dia = ((diaBase - 1 + offset) % CATEGORIAS.length) + 1;
    const cat = getCategoriaParaDia(dia);

    const jaPostada = await categoriaJaPostadaRecente(cat.id);
    if (!jaPostada) return cat;

    console.log(`[shopping] Categoria "${cat.label}" já postada recentemente, pulando...`);
  }

  console.warn('[shopping] Todas as categorias foram postadas nos últimos 30 dias. Reiniciando ciclo.');
  return getCategoriaParaDia(((new Date().getDate() - 1 + 15) % CATEGORIAS.length) + 1);
}

async function runShopping() {
  console.log('[shopping] Iniciando post de mais vendidos via Google Shopping.');

  // 1. Escolher categoria do dia
  const categoria = await escolherCategoria();
  console.log(`[shopping] Categoria: "${categoria.label}"`);

  // 2. Buscar dados do Google Shopping
  const shoppingData = await fetchShoppingData(categoria);
  console.log(`[shopping] Produtos coletados: ${shoppingData.products.length}`);

  if (!shoppingData.products.length) {
    throw new Error(`[shopping] Nenhum produto encontrado para "${categoria.label}" no Google Shopping.`);
  }

  // 3. Gerar artigo e legenda em paralelo
  const [artigo, caption] = await Promise.all([
    generateShoppingArticle(shoppingData),
    generateShoppingCaption(shoppingData),
  ]);
  console.log('[shopping] Artigo e legenda gerados.');

  const today = new Date().toISOString().slice(0, 10);
  const news = {
    title:   `${categoria.label}: os produtos mais vendidos no Google Shopping hoje`,
    source:  FONTE_SHOPPING,
    summary: `Análise dos produtos mais vendidos em "${categoria.label}" no Google Shopping brasileiro (${today}).`,
    link:    `categoria:${categoria.id}|shopping|${today}`,
  };

  return { news, caption, artigo, shoppingData, categoria };
}

module.exports = { runShopping, FONTE_SHOPPING };

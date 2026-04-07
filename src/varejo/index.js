require('dotenv').config();
const { getCategoriaParaDia, CATEGORIAS } = require('./categorias');
const { fetchVarejoTrends }               = require('./fetchVarejoTrends');
const { generateVarejoArticle, generateVarejoCaption } = require('./generateVarejoArticle');
const { supabase } = require('../supabaseClient');

const FONTE_VAREJO = 'Google Trends Varejo';

// Verifica se já existe um post desta categoria nos últimos 30 dias
async function categoriaJaPostadaRecente(categoriaId) {
  const limite = new Date();
  limite.setDate(limite.getDate() - 30);

  const { data } = await supabase
    .from('noticias')
    .select('id')
    .eq('fonte', FONTE_VAREJO)
    .ilike('url_original', `%categoria:${categoriaId}%`)
    .gte('publicado_em', limite.toISOString())
    .limit(1);

  return data && data.length > 0;
}

// Escolhe a categoria do dia, pulando as já postadas nos últimos 30 dias
async function escolherCategoria() {
  const diaBase = new Date().getDate();

  for (let offset = 0; offset < CATEGORIAS.length; offset++) {
    const dia = ((diaBase - 1 + offset) % CATEGORIAS.length) + 1;
    const cat = getCategoriaParaDia(dia);

    const jaPostada = await categoriaJaPostadaRecente(cat.id);
    if (!jaPostada) return cat;

    console.log(`[varejo] Categoria "${cat.label}" já postada recentemente, pulando...`);
  }

  console.warn('[varejo] Todas as categorias foram postadas nos últimos 30 dias. Reiniciando ciclo.');
  return getCategoriaParaDia(new Date().getDate());
}

async function runVarejo() {
  console.log('[varejo] Iniciando post de varejo. Período: últimos 90 dias');

  // 1. Escolher categoria do dia
  const categoria = await escolherCategoria();
  console.log(`[varejo] Categoria: "${categoria.label}"`);

  // 2. Buscar dados de tendência (últimos 90 dias)
  const trendData = await fetchVarejoTrends(categoria);
  console.log(`[varejo] Tendências coletadas. Termo principal: "${trendData.mainTerm.keyword}" (${trendData.mainTerm.avgInterest}/100) | Período: ${trendData.period.label}`);

  // 3. Gerar artigo e legenda (sequencial para que a legenda use o artigo)
  const artigo = await generateVarejoArticle(trendData);
  const caption = await generateVarejoCaption(trendData, artigo);
  console.log('[varejo] Artigo e legenda gerados.');

  const news = {
    title:   `${categoria.label}: os produtos mais buscados nos últimos 90 dias`,
    source:  FONTE_VAREJO,
    summary: `Análise do comportamento de busca em "${categoria.label}" no varejo digital brasileiro (${trendData.period.label}).`,
    link:    `categoria:${categoria.id}|periodo:${trendData.period.dateFrom}_${trendData.period.dateTo}`,
  };

  return { news, caption, artigo, trendData, categoria };
}

module.exports = { runVarejo, FONTE_VAREJO };

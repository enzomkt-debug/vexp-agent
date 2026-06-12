// Busca dados de tendência do Google Trends para uma categoria específica.
// Usa google-trends-api (não oficial) como fonte principal,
// com fallback para DataForSEO se credenciais disponíveis.

const { fetchInterestOverTime, fetchRelatedQueries, fetchRelatedTopics } = require('../trendSources/googleTrendsUnofficial');
const { fetchTrendsDataForSEO } = require('../trendSources/dataForSEO');

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

function buildPeriod90Days() {
  const end   = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 90);
  const fmt = (d) => d.toISOString().slice(0, 10);
  return {
    startTime: start,
    endTime:   end,
    dateFrom:  fmt(start),
    dateTo:    fmt(end),
    label:     `${fmt(start)} a ${fmt(end)}`,
  };
}

async function fetchVarejoTrends(categoria) {
  const period = buildPeriod90Days();
  const optsInterest  = { startTime: period.startTime, endTime: period.endTime, geo: 'BR', hl: 'pt-BR', category: 18 };
  const optsRelated   = { startTime: period.startTime, endTime: period.endTime, geo: 'BR', hl: 'pt-BR' };

  let trendTerms = [];
  let source = 'google-trends-api';

  // ── Tenta DataForSEO se credenciais disponíveis ──
  if (process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD) {
    try {
      const { trendTerms: dfsTerms } = await fetchTrendsDataForSEO(categoria.keywords, {
        dateFrom:     period.dateFrom,
        dateTo:       period.dateTo,
        locationCode: 2076,
        languageCode: 'pt',
        categoryCode: 18,
      });

      if (dfsTerms?.length) {
        trendTerms = dfsTerms;
        source = 'DataForSEO';
      }
    } catch (err) {
      console.warn(`[fetchVarejoTrends] DataForSEO falhou: ${err.message}`);
    }
  }

  // ── Fallback: google-trends-api ──
  if (!trendTerms.length) {
    trendTerms = await fetchInterestOverTime(categoria.keywords, optsInterest);
  }

  if (!trendTerms.length) {
    throw new Error(`[fetchVarejoTrends] Nenhum dado de tendência para "${categoria.label}"`);
  }

  // Busca queries e tópicos relacionados para o termo principal
  await delay(1200);
  const mainKeyword = trendTerms[0].keyword;
  const [relatedQueries, relatedTopics] = await Promise.all([
    fetchRelatedQueries(mainKeyword, optsRelated),
    fetchRelatedTopics(mainKeyword, optsRelated),
  ]);

  // ── Rising queries: o que cresceu ACIMA DO ESPERADO (o dado não-óbvio) ──
  const risingTerms = (relatedQueries.rising || [])
    .filter((q) => q.keyword && q.keyword.toLowerCase() !== mainKeyword.toLowerCase())
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  const topTerms = (relatedQueries.top || [])
    .filter((q) => q.keyword && q.keyword.toLowerCase() !== mainKeyword.toLowerCase())
    .slice(0, 6);

  // ── Drill de segundo nível: pega rising do primeiro rising term ──
  let secondLevelRising = [];
  if (risingTerms.length > 0) {
    await delay(1200);
    try {
      const drill = await fetchRelatedQueries(risingTerms[0].keyword, optsRelated);
      secondLevelRising = (drill.rising || [])
        .filter((q) => q.keyword)
        .slice(0, 4)
        .map((q) => ({ keyword: q.keyword, value: q.value, type: 'rising-L2', parentTerm: risingTerms[0].keyword }));
    } catch (err) {
      console.warn(`[fetchVarejoTrends] Drill L2 falhou: ${err.message}`);
    }
  }

  // ── Busca interesse numérico dos rising terms para comparação ──
  let risingTrends = [];
  const kwsToFetch = risingTerms.slice(0, 5).map((t) => t.keyword);
  if (kwsToFetch.length >= 2) {
    await delay(1200);
    try {
      risingTrends = await fetchInterestOverTime(kwsToFetch, optsInterest);
    } catch (err) {
      console.warn(`[fetchVarejoTrends] Falha ao buscar interesse dos rising terms: ${err.message}`);
    }
  }

  // Mescla: rising com dados numéricos quando disponíveis, breakout quando não
  const specificTrends = risingTerms.map((rt) => {
    const withData = risingTrends.find((t) => t.keyword.toLowerCase() === rt.keyword.toLowerCase());
    return {
      keyword:      rt.keyword,
      value:        rt.value === 9999 ? null : rt.value,
      avgInterest:  withData?.avgInterest ?? null,
      peakInterest: withData?.peakInterest ?? null,
      isBreakout:   rt.value === 9999,
      type:         'rising',
    };
  });

  // Top queries separadas (para contexto de volume, não de surpresa)
  const topSpecific = topTerms.map((t) => ({
    keyword:     t.keyword,
    avgInterest: null,
    isBreakout:  false,
    type:        'top',
  }));

  return {
    categoria,
    period:  { dateFrom: period.dateFrom, dateTo: period.dateTo, label: period.label },
    source,
    terms:   trendTerms,
    mainTerm: {
      keyword:        mainKeyword,
      avgInterest:    trendTerms[0].avgInterest,
      peakInterest:   trendTerms[0].peakInterest,
      weeklyData:     trendTerms[0].weeklyData,
      relatedQueries,
      relatedTopics,
    },
    specificTrends,
    topSpecific,
    secondLevelRising,
  };
}

module.exports = { fetchVarejoTrends };

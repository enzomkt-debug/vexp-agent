require('dotenv').config();
const { fetchTrends }                  = require('./trendSources/index');
const { crossReferenceTrendsWithNews } = require('./trendCrossRef');
const { generateTrendArticle }         = require('./generateTrendArticle');
const { fetchLatestNews }              = require('./fetchNews');

const DEFAULT_SEED_KEYWORDS = [
  'ecommerce brasil',
  'loja virtual',
  'dropshipping',
  'marketplace',
  'pix',
  'shopify brasil',
  'vendas online',
  'mercado livre',
  'trafego pago',
  'meta ads',
];

function resolvePeriod(year, month) {
  const pad   = (n) => String(n).padStart(2, '0');
  const lastDay = new Date(year, month, 0).getDate();
  return {
    startTime: new Date(`${year}-${pad(month)}-01`),
    endTime:   new Date(`${year}-${pad(month)}-${lastDay}`),
    dateFrom:  `${year}-${pad(month)}-01`,
    dateTo:    `${year}-${pad(month)}-${lastDay}`,
  };
}

async function runTrendIntelligence(options = {}) {
  const {
    period       = { year: 2025, month: 4 },
    seedKeywords = DEFAULT_SEED_KEYWORDS,
    topN         = 10,
  } = options;

  const { startTime, endTime, dateFrom, dateTo } = resolvePeriod(period.year, period.month);

  // Env overrides
  const kwEnv = process.env.TREND_SEED_KEYWORDS;
  const keywords = kwEnv ? kwEnv.split(',').map((k) => k.trim()).filter(Boolean) : seedKeywords;

  const periodYear  = Number(process.env.TREND_PERIOD_YEAR  || period.year);
  const periodMonth = Number(process.env.TREND_PERIOD_MONTH || period.month);
  const resolvedN   = Number(process.env.TREND_TOP_N || topN);

  const periodOpts = periodYear !== period.year || periodMonth !== period.month
    ? resolvePeriod(periodYear, periodMonth)
    : { startTime, endTime, dateFrom, dateTo };

  console.log(`[trendIntelligence] Período: ${periodOpts.dateFrom} → ${periodOpts.dateTo}`);
  console.log(`[trendIntelligence] Keywords: ${keywords.join(', ')}`);

  // 1. Fetch trend data (waterfall: oficial → DataForSEO → não oficial)
  const trendTerms = await fetchTrends(keywords, {
    ...periodOpts,
    topN:         resolvedN,
    geo:          'BR',
    hl:           'pt-BR',
    locationCode: 2076,
    languageCode: 'pt',
    categoryCode: 0,
  });

  console.log(`[trendIntelligence] ${trendTerms.length} termos coletados.`);

  // 2. Fetch latest news for cross-reference
  const newsItems = await fetchLatestNews();
  console.log(`[trendIntelligence] ${newsItems.length} notícias disponíveis para cruzamento.`);

  // 3. Cross-reference trends × news
  const ranked = crossReferenceTrendsWithNews(trendTerms, newsItems);
  const best   = ranked[0];

  console.log(`[trendIntelligence] Termo selecionado: "${best.trendTerm}" (score ${best.matchScore.toFixed(1)}, noNewsMatch=${best.noNewsMatch})`);

  // 4. Generate article
  const article = await generateTrendArticle(best);
  console.log('[trendIntelligence] Artigo de tendência gerado com sucesso.');

  return {
    trendTerm:      best.trendTerm,
    trendScore:     best.trendScore,
    peakScore:      best.peakScore,
    matchScore:     best.matchScore,
    relatedQueries: best.relatedQueries,
    relatedTopics:  best.relatedTopics,
    matchedNews:    best.matchedNews,
    noNewsMatch:    best.noNewsMatch,
    article,
    allTerms:       trendTerms.map((t) => ({ keyword: t.keyword, avgInterest: t.avgInterest })),
  };
}

module.exports = { runTrendIntelligence };

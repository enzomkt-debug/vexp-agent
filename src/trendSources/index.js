const { fetchTrendsOfficial }     = require('./googleTrendsOfficial');
const { fetchTrendsDataForSEO }   = require('./dataForSEO');
const { fetchInterestOverTime, fetchRelatedQueries, fetchRelatedTopics } = require('./googleTrendsUnofficial');

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// Normalised shape returned by every source:
// Array<{ keyword, avgInterest, peakInterest, weeklyData, relatedQueries: {top, rising}, relatedTopics: {top, rising} }>

async function enrichWithRelated(trendTerms, options, topN) {
  const top = trendTerms.slice(0, topN);
  for (const term of top) {
    await delay(1200);
    const [rq, rt] = await Promise.all([
      fetchRelatedQueries(term.keyword, options),
      fetchRelatedTopics(term.keyword, options),
    ]);
    term.relatedQueries = rq;
    term.relatedTopics  = rt;
  }
  return top;
}

async function fetchTrends(keywords, options = {}) {
  const {
    startTime    = new Date('2025-04-01'),
    endTime      = new Date('2025-04-30'),
    dateFrom     = '2025-04-01',
    dateTo       = '2025-04-30',
    geo          = 'BR',
    hl           = 'pt-BR',
    locationCode = 2076,
    languageCode = 'pt',
    categoryCode = 0,
    topN         = 10,
  } = options;

  const unofficialOpts = { startTime, endTime, geo, hl };
  const dataForSEOOpts = { dateFrom, dateTo, locationCode, languageCode, categoryCode };

  // ── Source 1: Google Trends official alpha ────────────────────────────────
  if (process.env.GOOGLE_TRENDS_OFFICIAL_KEY) {
    try {
      console.log('[trendSources] Tentando Google Trends oficial...');
      const terms = await fetchTrendsOfficial(keywords, options);
      if (terms?.length) {
        console.log('[trendSources] Fonte: Google Trends oficial');
        return enrichWithRelated(terms, unofficialOpts, topN);
      }
    } catch (err) {
      console.warn(`[trendSources] Google Trends oficial falhou: ${err.message}`);
    }
  }

  // ── Source 2: DataForSEO ──────────────────────────────────────────────────
  if (process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD) {
    try {
      console.log('[trendSources] Tentando DataForSEO...');
      const { trendTerms, relatedQueriesMap, relatedTopicsMap } = await fetchTrendsDataForSEO(keywords, dataForSEOOpts);
      if (trendTerms?.length) {
        console.log('[trendSources] Fonte: DataForSEO');
        const top = trendTerms.slice(0, topN).map((t) => ({
          ...t,
          relatedQueries: relatedQueriesMap[t.keyword] || { top: [], rising: [] },
          relatedTopics:  relatedTopicsMap[t.keyword]  || { top: [], rising: [] },
        }));
        return top;
      }
    } catch (err) {
      console.warn(`[trendSources] DataForSEO falhou: ${err.message}`);
    }
  }

  // ── Source 3: google-trends-api (unofficial, always available) ───────────
  console.log('[trendSources] Usando google-trends-api (não oficial)...');
  const trendTerms = await fetchInterestOverTime(keywords, unofficialOpts);
  if (!trendTerms.length) {
    throw new Error('[trendSources] Todas as fontes falharam. Nenhum dado de tendência disponível.');
  }

  console.log('[trendSources] Fonte: google-trends-api (não oficial)');
  return enrichWithRelated(trendTerms, unofficialOpts, topN);
}

module.exports = { fetchTrends };

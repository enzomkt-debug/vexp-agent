const axios = require('axios');

const BASE_URL = 'https://api.dataforseo.com/v3/keywords_data/google_trends/explore/live';

function getAuthHeader() {
  const login    = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  return `Basic ${Buffer.from(`${login}:${password}`).toString('base64')}`;
}

async function fetchTrendsDataForSEO(keywords, {
  dateFrom      = '2025-04-01',
  dateTo        = '2025-04-30',
  locationCode  = 2076,  // Brazil
  languageCode  = 'pt',
  categoryCode  = 0,
}) {
  const payload = [{
    keywords,
    location_code:  locationCode,
    language_code:  languageCode,
    date_from:      dateFrom,
    date_to:        dateTo,
    type:           'web',
    ...(categoryCode ? { category_code: categoryCode } : {}),
  }];

  let response;
  try {
    response = await axios.post(BASE_URL, payload, {
      headers: {
        'Content-Type': 'application/json',
        Authorization:  getAuthHeader(),
      },
      timeout: 20000,
    });
  } catch (err) {
    throw new Error(`[dataForSEO] HTTP error: ${err.message}`);
  }

  const task = response.data?.tasks?.[0];
  if (!task || task.status_code !== 20000) {
    throw new Error(`[dataForSEO] Task failed: ${task?.status_message || 'unknown error'}`);
  }

  const result = task.result?.[0];
  if (!result) throw new Error('[dataForSEO] Empty result');

  // Parse interest over time per keyword
  const interestMap = {};
  for (const item of result.items || []) {
    for (const point of item.data || []) {
      for (const kv of point.values || []) {
        if (!interestMap[kv.keyword]) interestMap[kv.keyword] = [];
        interestMap[kv.keyword].push(kv.value);
      }
    }
  }

  const trendTerms = keywords.map((kw) => {
    const values = interestMap[kw] || [];
    const avgInterest  = values.length ? Math.round(values.reduce((s, v) => s + v, 0) / values.length) : 0;
    const peakInterest = values.length ? Math.max(...values) : 0;
    return { keyword: kw, avgInterest, peakInterest, weeklyData: [] };
  }).filter((t) => t.avgInterest > 0)
    .sort((a, b) => b.avgInterest - a.avgInterest);

  // Parse related queries and topics (returned per keyword in DataForSEO)
  const relatedQueriesMap  = {};
  const relatedTopicsMap   = {};

  for (const item of result.related_queries || []) {
    const kw = item.keyword;
    relatedQueriesMap[kw] = {
      top:    (item.top    || []).slice(0, 5).map((q) => ({ query: q.query, value: q.value })),
      rising: (item.rising || []).slice(0, 5).map((q) => ({ query: q.query, value: q.value })),
    };
  }

  for (const item of result.related_topics || []) {
    const kw = item.keyword;
    relatedTopicsMap[kw] = {
      top:    (item.top    || []).slice(0, 5).map((t) => ({ title: t.topic_title || t.topic || '', type: t.topic_type || '', value: t.value })),
      rising: (item.rising || []).slice(0, 5).map((t) => ({ title: t.topic_title || t.topic || '', type: t.topic_type || '', value: t.value })),
    };
  }

  return { trendTerms, relatedQueriesMap, relatedTopicsMap };
}

module.exports = { fetchTrendsDataForSEO };

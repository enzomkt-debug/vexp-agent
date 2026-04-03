const googleTrends = require('google-trends-api');

const DELAY_MS = 1500;
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

function parseInterestOverTime(raw) {
  try {
    const parsed = JSON.parse(raw);
    return parsed?.default?.timelineData || [];
  } catch {
    return [];
  }
}

function parseRelatedQueries(raw) {
  try {
    const parsed = JSON.parse(raw);
    const lists = parsed?.default?.rankedList || [];
    const top = (lists[0]?.rankedKeyword || []).slice(0, 10).map((k) => ({
      keyword: k.query,   // field is "query" in API response
      query:   k.query,
      value:   k.value,
    }));
    const rising = (lists[1]?.rankedKeyword || []).slice(0, 10).map((k) => ({
      keyword: k.query,
      query:   k.query,
      value:   (typeof k.value === 'string' && k.value.toLowerCase().includes('breakout')) ? 9999 : Number(k.value) || 0,
    }));
    return { top, rising };
  } catch {
    return { top: [], rising: [] };
  }
}

function parseRelatedTopics(raw) {
  try {
    const parsed = JSON.parse(raw);
    const lists = parsed?.default?.rankedList || [];
    const top = (lists[0]?.rankedKeyword || []).slice(0, 5).map((k) => ({
      title: k.topic?.title || k.query || '',
      type:  k.topic?.type  || '',
      value: k.value,
    }));
    const rising = (lists[1]?.rankedKeyword || []).slice(0, 5).map((k) => ({
      title: k.topic?.title || k.query || '',
      type:  k.topic?.type  || '',
      value: (typeof k.value === 'string' && k.value.toLowerCase().includes('breakout')) ? 9999 : Number(k.value) || 0,
    }));
    return { top, rising };
  } catch {
    return { top: [], rising: [] };
  }
}

// Splits keywords into batches of max 5 (Google Trends API limit per call)
function chunk(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

async function fetchInterestOverTime(keywords, { startTime, endTime, geo = 'BR', hl = 'pt-BR', category = 18 }) {
  const batches = chunk(keywords, 5);
  const results = [];

  for (const batch of batches) {
    try {
      const raw = await googleTrends.interestOverTime({
        keyword: batch,
        startTime,
        endTime,
        geo,
        hl,
        category,
      });

      const timeline = parseInterestOverTime(raw);
      if (!timeline.length) continue;

      // For each keyword in the batch, extract its series
      batch.forEach((kw, kwIdx) => {
        const values = timeline.map((point) => {
          const val = point.value?.[kwIdx];
          return typeof val === 'number' ? val : 0;
        }).filter((v) => v > 0);

        if (!values.length) return;

        const avgInterest  = Math.round(values.reduce((s, v) => s + v, 0) / values.length);
        const peakInterest = Math.max(...values);

        const weeklyData = timeline.map((point) => ({
          date:  point.formattedAxisTime || '',
          value: point.value?.[kwIdx] ?? 0,
        }));

        results.push({ keyword: kw, avgInterest, peakInterest, weeklyData });
      });
    } catch (err) {
      console.warn(`[googleTrendsUnofficial] Falha no batch [${batch.join(', ')}]: ${err.message}`);
    }

    await delay(DELAY_MS);
  }

  return results.sort((a, b) => b.avgInterest - a.avgInterest);
}

async function fetchRelatedQueries(keyword, { startTime, endTime, geo = 'BR', hl = 'pt-BR', category = 18 }) {
  try {
    const raw = await googleTrends.relatedQueries({ keyword, startTime, endTime, geo, hl, category });
    return parseRelatedQueries(raw);
  } catch (err) {
    console.warn(`[googleTrendsUnofficial] relatedQueries "${keyword}": ${err.message}`);
    return { top: [], rising: [] };
  }
}

async function fetchRelatedTopics(keyword, { startTime, endTime, geo = 'BR', hl = 'pt-BR', category = 18 }) {
  try {
    const raw = await googleTrends.relatedTopics({ keyword, startTime, endTime, geo, hl, category });
    return parseRelatedTopics(raw);
  } catch (err) {
    console.warn(`[googleTrendsUnofficial] relatedTopics "${keyword}": ${err.message}`);
    return { top: [], rising: [] };
  }
}

module.exports = { fetchInterestOverTime, fetchRelatedQueries, fetchRelatedTopics };

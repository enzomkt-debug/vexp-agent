// Crosses trend terms with news items.
// Returns ranked results that have both trend signal and news evidence.

function normalize(str) {
  return (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ');
}

function scoreMatch(trendTerm, newsItems) {
  const termNorm = normalize(trendTerm.keyword);
  const rqTerms  = (trendTerm.relatedQueries?.top || []).map((q) => normalize(q.query));
  const rtTerms  = (trendTerm.relatedTopics?.top  || []).map((t) => normalize(t.title)).filter(Boolean);

  let newsMatchPoints = 0;
  const matchedNews = [];

  for (const item of newsItems) {
    const text = normalize(`${item.title} ${item.summary}`);

    let itemPoints = 0;

    // Direct term match
    if (text.includes(termNorm)) itemPoints += 40;

    // Related queries match
    for (const rq of rqTerms) {
      if (rq && text.includes(rq)) { itemPoints += 15; break; }
    }

    // Related topics match
    for (const rt of rtTerms) {
      if (rt && text.includes(rt)) { itemPoints += 10; break; }
    }

    if (itemPoints > 0) {
      newsMatchPoints = Math.min(newsMatchPoints + itemPoints, 195); // cap
      matchedNews.push(item);
      if (matchedNews.length >= 3) break;
    }
  }

  // 50% trend interest, 50% news signal
  const matchScore = trendTerm.avgInterest * 0.5 + newsMatchPoints * 0.5;

  return { matchedNews, newsMatchPoints, matchScore };
}

function crossReferenceTrendsWithNews(trendTerms, newsItems) {
  const results = trendTerms.map((term) => {
    const { matchedNews, newsMatchPoints, matchScore } = scoreMatch(term, newsItems);
    return {
      trendTerm:      term.keyword,
      trendScore:     term.avgInterest,
      peakScore:      term.peakInterest,
      weeklyData:     term.weeklyData,
      relatedQueries: term.relatedQueries || { top: [], rising: [] },
      relatedTopics:  term.relatedTopics  || { top: [], rising: [] },
      matchedNews,
      newsMatchPoints,
      matchScore,
      noNewsMatch:    matchedNews.length === 0,
    };
  });

  // Sort by matchScore descending
  results.sort((a, b) => b.matchScore - a.matchScore);

  // Prefer results with news evidence; if none exist, return top by trendScore
  const withNews    = results.filter((r) => !r.noNewsMatch);
  const withoutNews = results.filter((r) => r.noNewsMatch);

  return withNews.length ? withNews : withoutNews;
}

module.exports = { crossReferenceTrendsWithNews };

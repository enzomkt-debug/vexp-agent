// Stub for future Google Trends official alpha API.
// Set GOOGLE_TRENDS_OFFICIAL_KEY in .env when access is granted.

async function fetchTrendsOfficial(/* keywords, options */) {
  throw new Error(
    '[googleTrendsOfficial] Not implemented. Set GOOGLE_TRENDS_OFFICIAL_KEY when Google grants alpha access.'
  );
}

module.exports = { fetchTrendsOfficial };

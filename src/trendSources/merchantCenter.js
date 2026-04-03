// Stub for future Google Merchant Center / Shopping Trends integration.
// Set MERCHANT_CENTER_MERCHANT_ID and GOOGLE_SERVICE_ACCOUNT_JSON in .env when available.
// This source provides product popularity and bestseller data (not search interest).

async function fetchMerchantTrends(/* options */) {
  throw new Error(
    '[merchantCenter] Not implemented. Set MERCHANT_CENTER_MERCHANT_ID and GOOGLE_SERVICE_ACCOUNT_JSON to enable.'
  );
}

module.exports = { fetchMerchantTrends };

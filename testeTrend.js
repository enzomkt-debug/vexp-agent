require('dotenv').config();
const { runTrendIntelligence } = require('./src/trendIntelligence');

(async () => {
  console.log('=== TESTE TREND INTELLIGENCE (abril/2025) ===\n');

  try {
    const result = await runTrendIntelligence({
      period:       { year: 2025, month: 4 },
      seedKeywords: ['ecommerce brasil', 'loja virtual', 'dropshipping', 'marketplace', 'pix'],
      topN:         5,
    });

    console.log('\n── Todos os termos coletados ──');
    result.allTerms.forEach((t, i) =>
      console.log(`  ${i + 1}. ${t.keyword} — interesse médio: ${t.avgInterest}/100`)
    );

    console.log('\n── Termo selecionado ──');
    console.log(`  Termo:       ${result.trendTerm}`);
    console.log(`  Score trend: ${result.trendScore}/100 (pico: ${result.peakScore}/100)`);
    console.log(`  Match score: ${result.matchScore.toFixed(1)}`);
    console.log(`  Sem notícia: ${result.noNewsMatch}`);

    if (result.relatedQueries?.top?.length) {
      console.log(`  Buscas rel.: ${result.relatedQueries.top.map(q => q.query).join(', ')}`);
    }
    if (result.relatedTopics?.top?.length) {
      console.log(`  Tópicos:     ${result.relatedTopics.top.map(t => t.title).join(', ')}`);
    }

    if (result.matchedNews.length) {
      console.log('\n── Notícias cruzadas ──');
      result.matchedNews.forEach((n, i) => console.log(`  ${i + 1}. [${n.source}] ${n.title}`));
    }

    console.log('\n── Artigo gerado (primeiros 500 chars) ──');
    console.log(result.article.slice(0, 500) + '...\n');

    console.log('=== TESTE CONCLUÍDO ===');
  } catch (err) {
    console.error('ERRO:', err.message);
    process.exit(1);
  }
})();

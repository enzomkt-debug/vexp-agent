require('dotenv').config();
const { runVarejo } = require('./src/varejo/index');
const { getCategoriaParaDia } = require('./src/varejo/categorias');

(async () => {
  console.log('=== TESTE VAREJO TREND ===\n');

  const hoje = new Date();
  console.log(`Período: últimos 90 dias`);
  console.log(`Categoria do dia (dia ${hoje.getDate()}): ${getCategoriaParaDia(hoje.getDate()).label}\n`);

  try {
    const result = await runVarejo();

    console.log('\n── Resultado ──');
    console.log(`Categoria:   ${result.categoria.label}`);
    console.log(`Período:     ${result.trendData.period.label}`);
    console.log(`Título:      ${result.news.title}`);
    console.log(`\nLegenda:\n${result.caption}`);
    console.log(`\nArtigo (primeiros 600 chars):\n${result.artigo.slice(0, 600)}...`);

    console.log('\n=== TESTE CONCLUÍDO ===');
  } catch (err) {
    console.error('ERRO:', err.message);
    process.exit(1);
  }
})();

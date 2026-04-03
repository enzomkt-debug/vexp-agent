// Teste completo sem publicação real
// Gera notícia, legenda e card visual — publicação bloqueada via TEST_MODE
process.env.TEST_MODE = 'true';
require('dotenv').config();

const { fetchLatestNews } = require('./src/fetchNews');
const { generateCaption } = require('./src/generateCaption');
const { generateImage } = require('./src/generateImage');
const { postToInstagram } = require('./src/postInstagram');

(async () => {
  console.log('=== TESTE COMPLETO (TEST_MODE=true) ===\n');

  // 1. Buscar notícia + filtrar com Claude
  console.log('[1/4] Buscando e filtrando notícias...');
  const items = await fetchLatestNews();
  if (!items.length) {
    console.error('Nenhuma notícia encontrada. Verifique os feeds RSS.');
    process.exit(1);
  }

  let news, caption;
  for (const item of items) {
    const candidate = await generateCaption(item);
    if (candidate.trim() === 'IRRELEVANTE') {
      console.log(`      [SKIP] Autopromocional: "${item.title}"`);
      continue;
    }
    news = item;
    caption = candidate;
    break;
  }

  if (!news) {
    console.error('Nenhuma notícia adequada encontrada.');
    process.exit(1);
  }

  console.log(`      Título: ${news.title}`);
  console.log(`      Fonte:  ${news.source}\n`);

  // 2. Legenda já gerada no loop acima
  console.log('[2/4] Legenda gerada com Claude...');
  console.log(`      Legenda:\n${caption}\n`);

  // 3. Gerar imagem
  console.log('[3/4] Gerando card visual...');
  const imageResult = await generateImage(news);
  console.log(`      Salvo em: ${imageResult.filepath}\n`);

  // 4. Simular postagem (bloqueada por TEST_MODE)
  console.log('[4/4] Simulando postagem no Instagram (TEST_MODE — sem publicação real)...');
  const postResult = await postToInstagram({ imagePath: imageResult.filepath, caption });
  console.log(`      postId:   ${postResult.postId}`);
  console.log(`      imageUrl: ${postResult.mediaUrl}\n`);

  console.log('=== TESTE CONCLUÍDO COM SUCESSO ===');
})();

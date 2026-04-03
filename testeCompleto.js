// Teste completo sem publicação real
// Gera notícia, legenda e card visual — publicação bloqueada via TEST_MODE
process.env.TEST_MODE = 'true';
require('dotenv').config();

const { fetchLatestNews } = require('./src/fetchNews');
const { generateCaption } = require('./src/generateCaption');
const { generateArticle } = require('./src/generateArticle');
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
  console.log('[2/5] Legenda gerada com Claude...');
  console.log(`      Legenda:\n${caption}\n`);

  // 3. Gerar artigo completo
  console.log('[3/5] Gerando artigo completo com Claude...');
  const artigo = await generateArticle(news);
  console.log(`      Artigo (primeiros 300 chars):\n${artigo.slice(0, 300)}...\n`);

  // 4. Gerar imagem
  console.log('[4/5] Gerando card visual...');
  const imageResult = await generateImage(news);
  console.log(`      Salvo em: ${imageResult.filepath}\n`);

  // 5. Simular postagem (bloqueada por TEST_MODE)
  console.log('[5/5] Simulando postagem no Instagram (TEST_MODE — sem publicação real)...');
  const postResult = await postToInstagram({ imagePath: imageResult.filepath, caption });
  console.log(`      postId:   ${postResult.postId}`);
  console.log(`      imageUrl: ${postResult.mediaUrl}\n`);

  console.log('=== TESTE CONCLUÍDO COM SUCESSO ===');
})();

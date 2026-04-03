// Teste completo sem publicação real
// Gera notícia, legenda, artigo, card feed e story — publicação bloqueada via TEST_MODE
process.env.TEST_MODE = 'true';
require('dotenv').config();

const { fetchLatestNews } = require('./src/fetchNews');
const { generateCaption } = require('./src/generateCaption');
const { generateArticle } = require('./src/generateArticle');
const { generateImage, gerarStory } = require('./src/generateImage');
const { postToInstagram, publicarStory } = require('./src/postInstagram');

(async () => {
  console.log('=== TESTE COMPLETO (TEST_MODE=true) ===\n');

  // 1. Buscar notícia + filtrar com Claude
  console.log('[1/6] Buscando e filtrando notícias...');
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
  console.log('[2/6] Legenda gerada com Claude...');
  console.log(`      Legenda:\n${caption}\n`);

  // 3. Gerar artigo completo
  console.log('[3/6] Gerando artigo completo com Claude...');
  const artigo = await generateArticle(news);
  console.log(`      Artigo (primeiros 300 chars):\n${artigo.slice(0, 300)}...\n`);

  // 4. Gerar imagens feed + story em paralelo
  console.log('[4/6] Gerando card feed + story...');
  const [imageResult, storyResult] = await Promise.all([
    generateImage(news),
    gerarStory(news),
  ]);
  console.log(`      Feed:  ${imageResult.filepath}`);
  console.log(`      Story: ${storyResult.filepath}\n`);

  // 5. Simular postagem feed (bloqueada por TEST_MODE)
  console.log('[5/6] Simulando postagem do feed no Instagram (TEST_MODE)...');
  const postResult = await postToInstagram({ imagePath: imageResult.filepath, caption });
  console.log(`      postId:   ${postResult.postId}`);
  console.log(`      imageUrl: ${postResult.mediaUrl}\n`);

  // 6. Simular postagem do story (bloqueada por TEST_MODE)
  console.log('[6/6] Simulando postagem do story no Instagram (TEST_MODE)...');
  const linkUrl = `https://vendaexponencial.com.br/artigo.html?id=test-id`;
  const storyPost = await publicarStory(storyResult.filepath, linkUrl);
  console.log(`      postId:   ${storyPost.postId}`);
  console.log(`      imageUrl: ${storyPost.mediaUrl}`);
  console.log(`      linkUrl:  ${linkUrl}\n`);

  console.log('=== TESTE CONCLUÍDO COM SUCESSO ===');
})();

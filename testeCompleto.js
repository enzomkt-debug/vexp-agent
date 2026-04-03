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

  // 1. Buscar notícia
  console.log('[1/4] Buscando notícias...');
  const items = await fetchLatestNews();
  if (!items.length) {
    console.error('Nenhuma notícia encontrada. Verifique os feeds RSS.');
    process.exit(1);
  }
  const news = items[0];
  console.log(`      Título: ${news.title}`);
  console.log(`      Fonte:  ${news.source}\n`);

  // 2. Gerar legenda
  console.log('[2/4] Gerando legenda com Claude...');
  const caption = await generateCaption(news);
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

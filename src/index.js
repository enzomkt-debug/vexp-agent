require('dotenv').config();
const cron = require('node-cron');
const fs = require('fs');
const { fetchLatestNews } = require('./fetchNews');
const { generateCaption } = require('./generateCaption');
const { generateImage } = require('./generateImage');
const { postToInstagram } = require('./postInstagram');
const { logPost, wasPostedToday } = require('./supabaseClient');

const TEST_MODE = process.env.TEST_MODE === 'true';

// Horários de postagem: 09:00, 13:00, 18:00 (fuso Brasília = UTC-3)
// No Railway (UTC), os horários ficam: 12:00, 16:00, 21:00
const SCHEDULE_TIMES = ['0 12 * * *', '0 16 * * *', '0 21 * * *'];

async function runPost() {
  console.log(`\n[${new Date().toISOString()}] Iniciando ciclo de postagem... TEST_MODE=${TEST_MODE}`);

  let news;
  let caption;
  try {
    const items = await fetchLatestNews();
    if (!items.length) {
      console.warn('[runPost] Nenhuma notícia encontrada.');
      return;
    }

    for (const item of items) {
      const alreadyPosted = !TEST_MODE && (await wasPostedToday(item.title));
      if (alreadyPosted) continue;

      const candidate = await generateCaption(item);
      if (candidate.trim() === 'IRRELEVANTE') {
        console.warn(`[runPost] Notícia rejeitada pelo Claude (autopromocional): "${item.title}"`);
        continue;
      }

      news = item;
      caption = candidate;
      break;
    }

    if (!news) {
      console.warn('[runPost] Nenhuma notícia adequada encontrada.');
      return;
    }
  } catch (err) {
    console.error('[runPost] Erro ao buscar/filtrar notícias:', err.message);
    return;
  }

  console.log(`[runPost] Notícia selecionada: "${news.title}"`);
  console.log('[runPost] Legenda gerada com sucesso.');

  let imageResult;
  try {
    imageResult = await generateImage(news);
    console.log(`[runPost] Imagem gerada: ${imageResult.filename}`);
  } catch (err) {
    console.error('[runPost] Erro ao gerar imagem:', err.message);
    if (!TEST_MODE) {
      await logPost({ title: news.title, source: news.source, caption, status: 'error', error: `image: ${err.message}` });
    }
    return;
  }

  let postResult;
  try {
    postResult = await postToInstagram({ imagePath: imageResult.filepath, caption });
    if (!TEST_MODE) {
      console.log(`[runPost] Post publicado! ID: ${postResult.postId}`);
    }
  } catch (err) {
    console.error('[runPost] Erro ao publicar no Instagram:', err.message);
    if (!TEST_MODE) {
      await logPost({
        title: news.title,
        source: news.source,
        caption,
        imageUrl: imageResult.filepath,
        status: 'error',
        error: `post: ${err.message}`,
      });
    }
    return;
  }

  if (!TEST_MODE) {
    await logPost({
      title: news.title,
      source: news.source,
      imageUrl: postResult.mediaUrl,
      caption,
      status: 'success',
    });
  }

  // Clean up local image file
  try {
    fs.unlinkSync(imageResult.filepath);
  } catch (_) {}

  console.log('[runPost] Ciclo concluído com sucesso.');
}

// Register all cron jobs
for (const schedule of SCHEDULE_TIMES) {
  cron.schedule(schedule, runPost, { timezone: 'UTC' });
  console.log(`[cron] Agendado: ${schedule} UTC`);
}

console.log(`✅ vexp-agent iniciado. TEST_MODE=${TEST_MODE}. Aguardando horários agendados (09h, 13h e 18h BRT)...`);

if (process.env.RUN_ON_START === 'true') {
  runPost();
}

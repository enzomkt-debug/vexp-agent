require('dotenv').config();
const cron = require('node-cron');
const fs = require('fs');
const { fetchLatestNews } = require('./fetchNews');
const { generateCaption } = require('./generateCaption');
const { generateArticle } = require('./generateArticle');
const { generateImage } = require('./generateImage');
const { postToInstagram } = require('./postInstagram');
const { salvarNoticia, marcarPostado, jaPostadoHoje } = require('./supabaseClient');

const TEST_MODE = process.env.TEST_MODE === 'true';

// Horários de postagem: 09:00, 13:00, 18:00 (fuso Brasília = UTC-3)
// No Railway (UTC), os horários ficam: 12:00, 16:00, 21:00
const SCHEDULE_TIMES = ['0 12 * * *', '0 16 * * *', '0 21 * * *'];

async function runPost() {
  console.log(`\n[${new Date().toISOString()}] Iniciando ciclo de postagem... TEST_MODE=${TEST_MODE}`);

  // 1. Buscar e filtrar notícias
  let news, caption;
  try {
    const items = await fetchLatestNews();
    if (!items.length) {
      console.warn('[runPost] Nenhuma notícia encontrada.');
      return;
    }

    for (const item of items) {
      // Dedup por URL (Supabase)
      if (!TEST_MODE && item.link && await jaPostadoHoje(item.link)) {
        console.log(`[runPost] Já postada hoje: "${item.title}"`);
        continue;
      }

      // Filtro de qualidade via Claude
      const candidate = await generateCaption(item);
      if (candidate.trim() === 'IRRELEVANTE') {
        console.warn(`[runPost] Rejeitada (autopromocional): "${item.title}"`);
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

  // 2. Gerar artigo completo
  let artigo;
  try {
    artigo = await generateArticle(news);
    console.log('[runPost] Artigo gerado com sucesso.');
  } catch (err) {
    console.error('[runPost] Erro ao gerar artigo:', err.message);
    artigo = null;
  }

  // 3. Gerar imagem
  let imageResult;
  try {
    imageResult = await generateImage(news);
    console.log(`[runPost] Imagem gerada: ${imageResult.filename}`);
  } catch (err) {
    console.error('[runPost] Erro ao gerar imagem:', err.message);
    return;
  }

  // 4. Publicar no Instagram (sobe imagem ao GitHub internamente)
  let postResult;
  try {
    postResult = await postToInstagram({ imagePath: imageResult.filepath, caption });
    if (!TEST_MODE) console.log(`[runPost] Post publicado! ID: ${postResult.postId}`);
  } catch (err) {
    console.error('[runPost] Erro ao publicar no Instagram:', err.message);
    return;
  }

  // 5. Salvar no Supabase
  if (!TEST_MODE) {
    try {
      const registro = await salvarNoticia({
        titulo:            news.title,
        fonte:             news.source,
        url_original:      news.link,
        imagem_url:        null,
        imagem_github:     postResult.mediaUrl,
        legenda_instagram: caption,
        artigo_completo:   artigo,
      });
      if (registro?.id) await marcarPostado(registro.id);
    } catch (err) {
      console.error('[runPost] Erro ao salvar no Supabase:', err.message);
    }
  }

  // Clean up local image
  try { fs.unlinkSync(imageResult.filepath); } catch (_) {}

  console.log('[runPost] Ciclo concluído com sucesso.');
}

// Register cron jobs
for (const schedule of SCHEDULE_TIMES) {
  cron.schedule(schedule, runPost, { timezone: 'UTC' });
  console.log(`[cron] Agendado: ${schedule} UTC`);
}

console.log(`✅ vexp-agent iniciado. TEST_MODE=${TEST_MODE}. Aguardando horários agendados (09h, 13h e 18h BRT)...`);

if (process.env.RUN_ON_START === 'true') {
  runPost();
}

module.exports = { runPost };

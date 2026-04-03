require('dotenv').config();
const cron = require('node-cron');
const fs = require('fs');
const { fetchLatestNews } = require('./fetchNews');
const { generateCaption } = require('./generateCaption');
const { generateArticle } = require('./generateArticle');
const { generateImage, gerarStory } = require('./generateImage');
const { postToInstagram, publicarStory } = require('./postInstagram');
const { salvarNoticia, marcarPostado, jaPostadoHoje } = require('./supabaseClient');

const TEST_MODE = process.env.TEST_MODE === 'true';
const PORTAL_BASE = 'https://vendaexponencial.com.br';

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
      if (!TEST_MODE && item.link && await jaPostadoHoje(item.link)) {
        console.log(`[runPost] Já postada hoje: "${item.title}"`);
        continue;
      }

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

  // 3. Gerar imagem feed + story em paralelo
  let imageResult, storyResult;
  try {
    [imageResult, storyResult] = await Promise.all([
      generateImage(news),
      gerarStory(news),
    ]);
    console.log(`[runPost] Feed: ${imageResult.filename} | Story: ${storyResult.filename}`);
  } catch (err) {
    console.error('[runPost] Erro ao gerar imagens:', err.message);
    return;
  }

  // 4. Publicar post no feed
  let postResult;
  try {
    postResult = await postToInstagram({ imagePath: imageResult.filepath, caption });
    if (!TEST_MODE) console.log(`[runPost] Feed publicado! ID: ${postResult.postId}`);
  } catch (err) {
    console.error('[runPost] Erro ao publicar feed:', err.message);
    try { fs.unlinkSync(storyResult.filepath); } catch (_) {}
    return;
  }

  // 5. Salvar no Supabase
  let registro;
  if (!TEST_MODE) {
    try {
      registro = await salvarNoticia({
        titulo:            news.title,
        fonte:             news.source,
        url_original:      news.link,
        imagem_url:        null,
        imagem_github:     postResult.mediaUrl,
        legenda_instagram: caption,
        artigo_completo:   artigo,
      });
      if (registro?.id) await marcarPostado(registro.id);
      console.log(`[runPost] Salvo no Supabase. ID: ${registro?.id}`);
    } catch (err) {
      console.error('[runPost] Erro ao salvar no Supabase:', err.message);
    }
  }

  // 6. Publicar story com link para o artigo
  const artigoId = registro?.id;
  const linkUrl = artigoId ? `${PORTAL_BASE}/artigo.html?id=${artigoId}` : null;
  try {
    const storyPost = await publicarStory(storyResult.filepath, linkUrl);
    if (!TEST_MODE) console.log(`[runPost] Story publicado! ID: ${storyPost.postId}`);
  } catch (err) {
    console.error('[runPost] Erro ao publicar story:', err.message);
  }

  // Clean up local files
  try { fs.unlinkSync(imageResult.filepath); } catch (_) {}
  try { fs.unlinkSync(storyResult.filepath); } catch (_) {}

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

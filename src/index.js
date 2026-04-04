require('dotenv').config();
const http = require('http');
const cron = require('node-cron');
const fs = require('fs');

// ─── HANDLERS GLOBAIS DE ERRO ───
process.on('uncaughtException', (err) => {
  console.error(`[FATAL] uncaughtException: ${err.message}`, err.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error(`[FATAL] unhandledRejection:`, reason);
  process.exit(1);
});

process.on('SIGTERM', () => {
  console.log('[INFO] SIGTERM recebido — encerrando gracefully...');
  process.exit(0);
});

// ─── HEALTHCHECK HTTP ───
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() }));
  } else {
    res.writeHead(404);
    res.end();
  }
}).listen(PORT, () => {
  console.log(`[healthcheck] HTTP server escutando na porta ${PORT}`);
});
const { fetchLatestNews } = require('./fetchNews');
const { generateCaption } = require('./generateCaption');
const { generateArticle } = require('./generateArticle');
const { generateImage, gerarStory } = require('./generateImage');
const { postToInstagram, publicarStory } = require('./postInstagram');
const { salvarNoticia, marcarPostado, atualizarImagemGithub, jaFoiPostado } = require('./supabaseClient');
const { runTrendIntelligence } = require('./trendIntelligence');
const { runVarejo }                                    = require('./varejo/index');
const { generateVarejoFeedImage, generateVarejoStoryImage } = require('./varejo/generateVarejoImage');
const { runShopping } = require('./shopping/index');
const { generateShoppingFeedImage, generateShoppingStoryImage } = require('./shopping/generateShoppingImage');

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
      if (!TEST_MODE && item.link && await jaFoiPostado(item.link)) {
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
      generateImage(news, artigo),
      gerarStory(news, artigo),
    ]);
    console.log(`[runPost] Feed: ${imageResult.filename} | Story: ${storyResult.filename}`);
  } catch (err) {
    console.error('[runPost] Erro ao gerar imagens:', err.message);
    return;
  }

  // 4. Salvar no Supabase (independente do Instagram)
  let registro;
  if (!TEST_MODE) {
    try {
      registro = await salvarNoticia({
        titulo:            news.title,
        fonte:             news.source,
        url_original:      news.link,
        imagem_url:        null,
        imagem_github:     imageResult.githubUrl || null,
        legenda_instagram: caption,
        artigo_completo:   artigo,
      });
      if (registro?.id) await marcarPostado(registro.id);
      console.log(`[runPost] Salvo no Supabase. ID: ${registro?.id}`);
    } catch (err) {
      console.error('[runPost] Erro ao salvar no Supabase:', err.message);
    }
  }

  // 5. Publicar post no feed
  const artigoId = registro?.id;
  const linkUrl = artigoId ? `${PORTAL_BASE}/artigo.html?id=${artigoId}` : null;
  let postResult;
  try {
    postResult = await postToInstagram({ imagePath: imageResult.filepath, caption, linkUrl });
    if (!TEST_MODE) {
      console.log(`[runPost] Feed publicado! ID: ${postResult.postId}`);
      await atualizarImagemGithub(registro?.id, postResult.mediaUrl);
    }
  } catch (err) {
    console.error('[runPost] Erro ao publicar feed (site não afetado):', err.message);
  }

  // 6. Publicar story com link para o artigo
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

async function runVarejoPost() {
  console.log(`\n[${new Date().toISOString()}] Iniciando ciclo VAREJO... TEST_MODE=${TEST_MODE}`);

  // 1. Lógica de varejo: escolhe categoria, busca trends, gera artigo + caption
  let varejoResult;
  try {
    varejoResult = await runVarejo();
  } catch (err) {
    console.error('[runVarejoPost] Erro ao executar varejo:', err.message);
    return;
  }

  const { news, caption, artigo, categoria, refYear, mesNome } = varejoResult;
  console.log(`[runVarejoPost] Categoria: "${categoria.label}" | Ref: ${mesNome}/${refYear}`);

  // 2. Gerar imagens com template exclusivo de varejo
  let imageResult, storyResult;
  try {
    [imageResult, storyResult] = await Promise.all([
      generateVarejoFeedImage(varejoResult.trendData, varejoResult.news.title),
      generateVarejoStoryImage(varejoResult.trendData, varejoResult.news.title),
    ]);
    console.log(`[runVarejoPost] Feed: ${imageResult.filename} | Story: ${storyResult.filename}`);
  } catch (err) {
    console.error('[runVarejoPost] Erro ao gerar imagens:', err.message);
    return;
  }

  // 3. Salvar no Supabase (independente do Instagram)
  let registro;
  if (!TEST_MODE) {
    try {
      registro = await salvarNoticia({
        titulo:            news.title,
        fonte:             news.source,
        url_original:      news.link,
        imagem_url:        null,
        imagem_github:     imageResult.githubUrl || null,
        legenda_instagram: caption,
        artigo_completo:   artigo,
      });
      if (registro?.id) await marcarPostado(registro.id);
      console.log(`[runVarejoPost] Salvo no Supabase. ID: ${registro?.id}`);
    } catch (err) {
      console.error('[runVarejoPost] Erro ao salvar no Supabase:', err.message);
    }
  }

  // 4. Publicar feed
  const artigoId = registro?.id;
  const linkUrl  = artigoId ? `${PORTAL_BASE}/artigo.html?id=${artigoId}` : null;
  let postResult;
  try {
    postResult = await postToInstagram({ imagePath: imageResult.filepath, caption, linkUrl });
    if (!TEST_MODE) {
      console.log(`[runVarejoPost] Feed publicado! ID: ${postResult.postId}`);
      await atualizarImagemGithub(registro?.id, postResult.mediaUrl);
    }
  } catch (err) {
    console.error('[runVarejoPost] Erro ao publicar feed (site não afetado):', err.message);
  }

  // 5. Publicar story
  try {
    const storyPost = await publicarStory(storyResult.filepath, linkUrl);
    if (!TEST_MODE) console.log(`[runVarejoPost] Story publicado! ID: ${storyPost.postId}`);
  } catch (err) {
    console.error('[runVarejoPost] Erro ao publicar story:', err.message);
  }

  try { fs.unlinkSync(imageResult.filepath); } catch (_) {}
  try { fs.unlinkSync(storyResult.filepath); } catch (_) {}

  console.log('[runVarejoPost] Ciclo de varejo concluído.');
}

async function runShoppingPost() {
  console.log(`\n[${new Date().toISOString()}] Iniciando ciclo SHOPPING... TEST_MODE=${TEST_MODE}`);

  // 1. Lógica de shopping: escolhe categoria, busca produtos, gera artigo + caption
  let shoppingResult;
  try {
    shoppingResult = await runShopping();
  } catch (err) {
    console.error('[runShoppingPost] Erro ao executar shopping:', err.message);
    return;
  }

  const { news, caption, artigo, categoria } = shoppingResult;
  console.log(`[runShoppingPost] Categoria: "${categoria.label}"`);

  // 2. Gerar imagens com template exclusivo de shopping
  let imageResult, storyResult;
  try {
    [imageResult, storyResult] = await Promise.all([
      generateShoppingFeedImage(shoppingResult.shoppingData, shoppingResult.news.title),
      generateShoppingStoryImage(shoppingResult.shoppingData, shoppingResult.news.title),
    ]);
    console.log(`[runShoppingPost] Feed: ${imageResult.filename} | Story: ${storyResult.filename}`);
  } catch (err) {
    console.error('[runShoppingPost] Erro ao gerar imagens:', err.message);
    return;
  }

  // 3. Salvar no Supabase (independente do Instagram)
  let registro;
  if (!TEST_MODE) {
    try {
      registro = await salvarNoticia({
        titulo:            news.title,
        fonte:             news.source,
        url_original:      news.link,
        imagem_url:        null,
        imagem_github:     imageResult.githubUrl || null,
        legenda_instagram: caption,
        artigo_completo:   artigo,
      });
      if (registro?.id) await marcarPostado(registro.id);
      console.log(`[runShoppingPost] Salvo no Supabase. ID: ${registro?.id}`);
    } catch (err) {
      console.error('[runShoppingPost] Erro ao salvar no Supabase:', err.message);
    }
  }

  // 4. Publicar feed
  const artigoId = registro?.id;
  const linkUrl  = artigoId ? `${PORTAL_BASE}/artigo.html?id=${artigoId}` : null;
  let postResult;
  try {
    postResult = await postToInstagram({ imagePath: imageResult.filepath, caption, linkUrl });
    if (!TEST_MODE) {
      console.log(`[runShoppingPost] Feed publicado! ID: ${postResult.postId}`);
      await atualizarImagemGithub(registro?.id, postResult.mediaUrl);
    }
  } catch (err) {
    console.error('[runShoppingPost] Erro ao publicar feed (site não afetado):', err.message);
  }

  // 5. Publicar story
  try {
    const storyPost = await publicarStory(storyResult.filepath, linkUrl);
    if (!TEST_MODE) console.log(`[runShoppingPost] Story publicado! ID: ${storyPost.postId}`);
  } catch (err) {
    console.error('[runShoppingPost] Erro ao publicar story:', err.message);
  }

  try { fs.unlinkSync(imageResult.filepath); } catch (_) {}
  try { fs.unlinkSync(storyResult.filepath); } catch (_) {}

  console.log('[runShoppingPost] Ciclo de shopping concluído.');
}

// Register cron jobs — pipeline principal
for (const schedule of SCHEDULE_TIMES) {
  cron.schedule(schedule, () => runPost().catch(err => console.error(`[cron] Erro em runPost:`, err.message)), { timezone: 'UTC' });
  console.log(`[cron] Agendado (news): ${schedule} UTC`);
}

// Post diário de varejo: 18:00 UTC = 15:00 BRT
const VAREJO_SCHEDULE = '0 18 * * *';
cron.schedule(VAREJO_SCHEDULE, () => runVarejoPost().catch(err => console.error(`[cron] Erro em runVarejoPost:`, err.message)), { timezone: 'UTC' });
console.log(`[cron] Agendado (varejo): ${VAREJO_SCHEDULE} UTC`);

// Post diário de shopping: 20:00 UTC = 17:00 BRT
const SHOPPING_SCHEDULE = '0 20 * * *';
cron.schedule(SHOPPING_SCHEDULE, () => runShoppingPost().catch(err => console.error(`[cron] Erro em runShoppingPost:`, err.message)), { timezone: 'UTC' });
console.log(`[cron] Agendado (shopping): ${SHOPPING_SCHEDULE} UTC`);

console.log(`✅ vexp-agent iniciado. TEST_MODE=${TEST_MODE}. Aguardando horários agendados (09h, 13h e 18h BRT + varejo 15h BRT)...`);

if (process.env.RUN_ON_START === 'true') {
  runPost();
}

if (process.env.RUN_VAREJO_ON_START === 'true') {
  runVarejoPost();
}

if (process.env.RUN_SHOPPING_ON_START === 'true') {
  runShoppingPost();
}

async function runTrendPost() {
  console.log(`\n[${new Date().toISOString()}] Iniciando ciclo de TREND POST... TEST_MODE=${TEST_MODE}`);

  // 1. Coleta de tendências + cruzamento com notícias + geração de artigo
  let trendResult;
  try {
    trendResult = await runTrendIntelligence();
  } catch (err) {
    console.error('[runTrendPost] Erro no trendIntelligence:', err.message);
    return;
  }

  // Monta um objeto news-like para reusar o pipeline de imagem/post
  const news = trendResult.matchedNews[0] || {
    title:   trendResult.trendTerm,
    source:  'Google Trends',
    summary: '',
    link:    '',
  };
  const artigo = trendResult.article;

  // 2. Gerar legenda
  let caption;
  try {
    caption = await generateCaption({
      ...news,
      title: `Tendência: ${trendResult.trendTerm} (interesse ${trendResult.trendScore}/100 em abril/2025)`,
    });
    if (caption.trim() === 'IRRELEVANTE') caption = `📈 ${trendResult.trendTerm} foi um dos termos mais buscados no ecommerce em abril de 2025.\n\n#vendaexponencial #ecommerce #tendencias`;
  } catch (err) {
    console.error('[runTrendPost] Erro ao gerar caption:', err.message);
    caption = `📈 ${trendResult.trendTerm}\n\n#vendaexponencial #ecommerce`;
  }

  // 3. Gerar imagens feed + story
  let imageResult, storyResult;
  try {
    [imageResult, storyResult] = await Promise.all([
      generateImage(news, artigo),
      gerarStory(news, artigo),
    ]);
    console.log(`[runTrendPost] Feed: ${imageResult.filename} | Story: ${storyResult.filename}`);
  } catch (err) {
    console.error('[runTrendPost] Erro ao gerar imagens:', err.message);
    return;
  }

  // 4. Salvar no Supabase ANTES de publicar (garante artigo no site independente do Instagram)
  let registro;
  if (!TEST_MODE) {
    try {
      registro = await salvarNoticia({
        titulo:            news.title,
        fonte:             news.source,
        url_original:      news.link || null,
        imagem_url:        null,
        imagem_github:     imageResult.githubUrl || null,
        legenda_instagram: caption,
        artigo_completo:   artigo,
      });
      console.log(`[runTrendPost] Salvo no Supabase. ID: ${registro?.id}`);
    } catch (err) {
      console.error('[runTrendPost] Erro ao salvar no Supabase:', err.message);
    }
  }

  // 5. Publicar feed
  const artigoId = registro?.id;
  const linkUrl  = artigoId ? `${PORTAL_BASE}/artigo.html?id=${artigoId}` : null;
  let postResult;
  try {
    postResult = await postToInstagram({ imagePath: imageResult.filepath, caption, linkUrl });
    if (!TEST_MODE) {
      console.log(`[runTrendPost] Feed publicado! ID: ${postResult.postId}`);
      if (registro?.id) {
        await marcarPostado(registro.id);
        await atualizarImagemGithub(registro.id, postResult.mediaUrl);
      }
    }
  } catch (err) {
    console.error('[runTrendPost] Erro ao publicar feed:', err.message);
    try { fs.unlinkSync(storyResult.filepath); } catch (_) {}
    return;
  }

  // 6. Publicar story
  try {
    const storyPost = await publicarStory(storyResult.filepath, linkUrl);
    if (!TEST_MODE) console.log(`[runTrendPost] Story publicado! ID: ${storyPost.postId}`);
  } catch (err) {
    console.error('[runTrendPost] Erro ao publicar story:', err.message);
  }

  try { fs.unlinkSync(imageResult.filepath); } catch (_) {}
  try { fs.unlinkSync(storyResult.filepath); } catch (_) {}

  console.log('[runTrendPost] Ciclo de tendência concluído.');
}

module.exports = { runPost, runTrendPost, runVarejoPost, runShoppingPost };

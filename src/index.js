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
  } else if (req.method === 'POST' && req.url === '/post-manual') {
    const apiKey = req.headers['x-api-key'];
    if (apiKey !== process.env.MANUAL_POST_API_KEY) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      let payload;
      try { payload = JSON.parse(body); } catch (_) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
        return;
      }
      const { tema, url } = payload;
      const temaTipo = typeof tema === 'string' && tema.trim();
      const urlTipo  = typeof url  === 'string' && url.trim();
      if (!temaTipo && !urlTipo) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Informe ao menos "tema" ou "url"' }));
        return;
      }
      res.writeHead(202, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'accepted', tema: temaTipo || urlTipo }));
      runManualPost(temaTipo || null, urlTipo || null).catch(err => console.error('[post-manual] Erro:', err.message));
    });
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
const { salvarNoticia, marcarPostado, atualizarImagemGithub, jaFoiPostado, buscarTitulosRecentes } = require('./supabaseClient');
const { isAssuntoDuplicado } = require('./dedupAssunto');
const { subirImagemGithub } = require('./utils');
const { runTrendIntelligence } = require('./trendIntelligence');
const { execFile } = require('child_process');
const path = require('path');
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

    const titulosRecentes = TEST_MODE ? [] : await buscarTitulosRecentes(30, 50);

    for (const item of items) {
      if (!TEST_MODE && item.link && await jaFoiPostado(item.link)) {
        console.log(`[runPost] Já postada hoje: "${item.title}"`);
        continue;
      }

      if (!TEST_MODE && titulosRecentes.length) {
        const dup = await isAssuntoDuplicado(item.title, titulosRecentes);
        if (dup.duplicado) {
          console.log(`[runPost] Assunto já coberto (${dup.motivo}): "${item.title}"`);
          continue;
        }
      }

      const candidate = await generateCaption(item);
      if (candidate.trim() === 'IRRELEVANTE') {
        console.warn(`[runPost] Rejeitada (autopromocional): "${item.title}"`);
        continue;
      }

      news = item;
      caption = candidate;
      titulosRecentes.unshift(item.title);
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

  // 4. Upload das imagens para o GitHub (antes de salvar no Supabase)
  let feedGithubUrl, storyGithubUrl;
  try {
    [feedGithubUrl, storyGithubUrl] = await Promise.all([
      subirImagemGithub(imageResult.filepath),
      subirImagemGithub(storyResult.filepath),
    ]);
    console.log(`[runPost] GitHub: feed=${feedGithubUrl}`);
  } catch (err) {
    console.error('[runPost] Erro ao subir imagens para GitHub:', err.message);
  }

  // 5. Salvar no Supabase com imagem_github já definida
  let registro;
  if (!TEST_MODE) {
    try {
      registro = await salvarNoticia({
        titulo:            news.title,
        fonte:             news.source,
        url_original:      news.link,
        imagem_url:        null,
        imagem_github:     feedGithubUrl || null,
        legenda_instagram: caption,
        artigo_completo:   artigo,
      });
      if (registro?.id) await marcarPostado(registro.id);
      console.log(`[runPost] Salvo no Supabase. ID: ${registro?.id}`);
    } catch (err) {
      console.error('[runPost] Erro ao salvar no Supabase:', err.message);
    }
  }

  // 6. Publicar post no feed (imagem já no GitHub, sem re-upload)
  const artigoId = registro?.id;
  const linkUrl = artigoId ? `${PORTAL_BASE}/artigo.html?id=${artigoId}` : null;
  let postResult;
  try {
    postResult = await postToInstagram({ imageUrl: feedGithubUrl, caption, linkUrl });
    if (!TEST_MODE) console.log(`[runPost] Feed publicado! ID: ${postResult.postId}`);
  } catch (err) {
    console.error('[runPost] Erro ao publicar feed (site não afetado):', err.message);
  }

  // 7. Publicar story com link para o artigo
  try {
    const storyPost = await publicarStory(null, linkUrl, storyGithubUrl);
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

  const { news, caption, artigo, categoria } = varejoResult;
  console.log(`[runVarejoPost] Categoria: "${categoria.label}"`);

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

  // 3. Upload das imagens para o GitHub (antes de salvar no Supabase)
  let feedGithubUrlV, storyGithubUrlV;
  try {
    [feedGithubUrlV, storyGithubUrlV] = await Promise.all([
      subirImagemGithub(imageResult.filepath),
      subirImagemGithub(storyResult.filepath),
    ]);
    console.log(`[runVarejoPost] GitHub: feed=${feedGithubUrlV}`);
  } catch (err) {
    console.error('[runVarejoPost] Erro ao subir imagens para GitHub:', err.message);
    return;
  }

  if (!feedGithubUrlV) {
    console.error('[runVarejoPost] URL da imagem não obtida — abortando para não salvar artigo sem imagem.');
    return;
  }

  // 4. Salvar no Supabase com imagem_github já definida
  let registro;
  if (!TEST_MODE) {
    try {
      registro = await salvarNoticia({
        titulo:            news.title,
        fonte:             news.source,
        url_original:      news.link,
        imagem_url:        null,
        imagem_github:     feedGithubUrlV || null,
        legenda_instagram: caption,
        artigo_completo:   artigo,
      });
      if (registro?.id) await marcarPostado(registro.id);
      console.log(`[runVarejoPost] Salvo no Supabase. ID: ${registro?.id}`);
    } catch (err) {
      console.error('[runVarejoPost] Erro ao salvar no Supabase:', err.message);
    }
  }

  // 5. Publicar feed (imagem já no GitHub, sem re-upload)
  const artigoId = registro?.id;
  const linkUrl  = artigoId ? `${PORTAL_BASE}/artigo.html?id=${artigoId}` : null;
  let postResult;
  try {
    postResult = await postToInstagram({ imageUrl: feedGithubUrlV, caption, linkUrl });
    if (!TEST_MODE) console.log(`[runVarejoPost] Feed publicado! ID: ${postResult.postId}`);
  } catch (err) {
    console.error('[runVarejoPost] Erro ao publicar feed (site não afetado):', err.message);
  }

  // 6. Publicar story
  try {
    const storyPost = await publicarStory(null, linkUrl, storyGithubUrlV);
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

  // 3. URLs do GitHub já obtidas dentro de generateShoppingFeedImage/StoryImage
  //    Evita double upload que causaria 409 garantido
  const feedGithubUrlS  = imageResult.githubUrl;
  const storyGithubUrlS = storyResult.githubUrl;
  console.log(`[runShoppingPost] GitHub: feed=${feedGithubUrlS} | story=${storyGithubUrlS}`);

  // 4. Salvar no Supabase com imagem_github já definida
  let registro;
  if (!TEST_MODE) {
    try {
      registro = await salvarNoticia({
        titulo:            news.title,
        fonte:             news.source,
        url_original:      news.link,
        imagem_url:        null,
        imagem_github:     feedGithubUrlS || null,
        legenda_instagram: caption,
        artigo_completo:   artigo,
      });
      if (registro?.id) await marcarPostado(registro.id);
      console.log(`[runShoppingPost] Salvo no Supabase. ID: ${registro?.id}`);
    } catch (err) {
      console.error('[runShoppingPost] Erro ao salvar no Supabase:', err.message);
    }
  }

  // 5. Publicar feed (imagem já no GitHub, sem re-upload)
  const artigoId = registro?.id;
  const linkUrl  = artigoId ? `${PORTAL_BASE}/artigo.html?id=${artigoId}` : null;
  let postResult;
  try {
    postResult = await postToInstagram({ imageUrl: feedGithubUrlS, caption, linkUrl });
    if (!TEST_MODE) console.log(`[runShoppingPost] Feed publicado! ID: ${postResult.postId}`);
  } catch (err) {
    console.error('[runShoppingPost] Erro ao publicar feed (site não afetado):', err.message);
  }

  // 6. Publicar story
  try {
    const storyPost = await publicarStory(null, linkUrl, storyGithubUrlS);
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

// Sitemap diário: 03:00 UTC = meia-noite BRT
cron.schedule('0 3 * * *', () => {
  execFile('node', ['scripts/generateSitemap.js'], { cwd: path.join(__dirname, '..') }, (err, stdout, stderr) => {
    if (err) console.error('[cron] Erro ao gerar sitemap:', err.message);
    else console.log('[cron] Sitemap atualizado.', stdout.trim());
  });
}, { timezone: 'UTC' });
console.log('[cron] Agendado (sitemap): 0 3 * * * UTC');

// Post diário de varejo: 18:00 UTC = 15:00 BRT
const VAREJO_SCHEDULE = '0 18 * * *';
cron.schedule(VAREJO_SCHEDULE, () => runVarejoPost().catch(err => console.error(`[cron] Erro em runVarejoPost:`, err.message)), { timezone: 'UTC' });
console.log(`[cron] Agendado (varejo): ${VAREJO_SCHEDULE} UTC`);

// Post diário de shopping: 20:00 UTC = 17:00 BRT
const SHOPPING_SCHEDULE = '0 20 * * *';
cron.schedule(SHOPPING_SCHEDULE, () => runShoppingPost().catch(err => console.error(`[cron] Erro em runShoppingPost:`, err.message)), { timezone: 'UTC' });
console.log(`[cron] Agendado (shopping): ${SHOPPING_SCHEDULE} UTC`);

// Post diário de trends: 22:00 UTC = 19:00 BRT
const TREND_SCHEDULE = '0 22 * * *';
cron.schedule(TREND_SCHEDULE, () => runTrendPost().catch(err => console.error(`[cron] Erro em runTrendPost:`, err.message)), { timezone: 'UTC' });
console.log(`[cron] Agendado (trend): ${TREND_SCHEDULE} UTC`);

console.log(`✅ vexp-agent iniciado. TEST_MODE=${TEST_MODE}. Aguardando horários agendados (09h, 13h e 18h BRT + varejo 15h BRT + shopping 17h BRT + trend 19h BRT)...`);

if (process.env.RUN_ON_START === 'true') {
  runPost().catch(err => console.error('[on-start] Erro em runPost:', err.message));
}

if (process.env.RUN_VAREJO_ON_START === 'true') {
  console.log('[on-start] RUN_VAREJO_ON_START ativo — disparando runVarejoPost...');
  runVarejoPost().catch(err => console.error('[on-start] Erro em runVarejoPost:', err.message));
}

if (process.env.RUN_SHOPPING_ON_START === 'true') {
  console.log('[on-start] RUN_SHOPPING_ON_START ativo — disparando runShoppingPost...');
  runShoppingPost().catch(err => console.error('[on-start] Erro em runShoppingPost:', err.message));
}

if (process.env.RUN_TREND_ON_START === 'true') {
  console.log('[on-start] RUN_TREND_ON_START ativo — disparando runTrendPost...');
  runTrendPost().catch(err => console.error('[on-start] Erro em runTrendPost:', err.message));
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
    const _now = new Date();
    const _mesAno = _now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }); // ex: "abril de 2026"
    const _mesAbrev = `${_now.toLocaleDateString('pt-BR', { month: 'long' })}/${_now.getFullYear()}`; // ex: "abril/2026"
    caption = await generateCaption({
      ...news,
      title: `Tendência: ${trendResult.trendTerm} (interesse ${trendResult.trendScore}/100 em ${_mesAbrev})`,
    });
    if (caption.trim() === 'IRRELEVANTE') caption = `📈 ${trendResult.trendTerm} foi um dos termos mais buscados no ecommerce em ${_mesAno}.\n\n#vendaexponencial #ecommerce #tendencias`;
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

  // 4. Upload das imagens para o GitHub (antes de salvar no Supabase)
  let feedGithubUrlT, storyGithubUrlT;
  try {
    [feedGithubUrlT, storyGithubUrlT] = await Promise.all([
      subirImagemGithub(imageResult.filepath),
      subirImagemGithub(storyResult.filepath),
    ]);
    console.log(`[runTrendPost] GitHub: feed=${feedGithubUrlT}`);
  } catch (err) {
    console.error('[runTrendPost] Erro ao subir imagens para GitHub:', err.message);
  }

  // 5. Salvar no Supabase com imagem_github já definida
  let registro;
  if (!TEST_MODE) {
    try {
      registro = await salvarNoticia({
        titulo:            news.title,
        fonte:             news.source,
        url_original:      news.link || null,
        imagem_url:        null,
        imagem_github:     feedGithubUrlT || null,
        legenda_instagram: caption,
        artigo_completo:   artigo,
      });
      if (registro?.id) await marcarPostado(registro.id);
      console.log(`[runTrendPost] Salvo no Supabase. ID: ${registro?.id}`);
    } catch (err) {
      console.error('[runTrendPost] Erro ao salvar no Supabase:', err.message);
    }
  }

  // 6. Publicar feed (imagem já no GitHub, sem re-upload)
  const artigoId = registro?.id;
  const linkUrl  = artigoId ? `${PORTAL_BASE}/artigo.html?id=${artigoId}` : null;
  let postResult;
  try {
    postResult = await postToInstagram({ imageUrl: feedGithubUrlT, caption, linkUrl });
    if (!TEST_MODE) console.log(`[runTrendPost] Feed publicado! ID: ${postResult.postId}`);
  } catch (err) {
    console.error('[runTrendPost] Erro ao publicar feed (site não afetado):', err.message);
  }

  // 7. Publicar story
  try {
    const storyPost = await publicarStory(null, linkUrl, storyGithubUrlT);
    if (!TEST_MODE) console.log(`[runTrendPost] Story publicado! ID: ${storyPost.postId}`);
  } catch (err) {
    console.error('[runTrendPost] Erro ao publicar story:', err.message);
  }

  try { fs.unlinkSync(imageResult.filepath); } catch (_) {}
  try { fs.unlinkSync(storyResult.filepath); } catch (_) {}

  console.log('[runTrendPost] Ciclo de tendência concluído.');
}

async function runManualPost(tema, url = null) {
  console.log(`\n[${new Date().toISOString()}] Iniciando POST MANUAL: tema="${tema}" url="${url}"`);

  // Se URL fornecida, faz fetch e extrai conteúdo
  let conteudoUrl = null;
  let tituloFinal = tema;
  if (url) {
    try {
      const axios = require('axios');
      const { data: html } = await axios.get(url, {
        timeout: 15000,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; vexp-agent/1.0)' },
      });
      if (!tituloFinal) {
        const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        if (m) tituloFinal = m[1].trim();
      }
      conteudoUrl = html
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 5000);
      console.log(`[runManualPost] Conteúdo extraído da URL (${conteudoUrl.length} chars).`);
    } catch (err) {
      console.error('[runManualPost] Erro ao buscar URL:', err.message);
    }
  }

  const news = {
    title:   tituloFinal || url,
    source:  url ? new URL(url).hostname : 'Manual',
    summary: '',
    link:    url || '',
    pubDate: new Date().toISOString(),
  };

  let caption;
  try {
    caption = await generateCaption(news);
    if (caption.trim() === 'IRRELEVANTE') caption = `📊 ${news.title}\n\n#vendaexponencial #ecommerce #varejo`;
  } catch (err) {
    console.error('[runManualPost] Erro ao gerar caption:', err.message);
    caption = `📊 ${news.title}\n\n#vendaexponencial #ecommerce`;
  }

  let artigo;
  try {
    artigo = await generateArticle(news, conteudoUrl);
    console.log('[runManualPost] Artigo gerado.');
  } catch (err) {
    console.error('[runManualPost] Erro ao gerar artigo:', err.message);
    artigo = null;
  }

  let imageResult, storyResult;
  try {
    [imageResult, storyResult] = await Promise.all([
      generateImage(news, artigo),
      gerarStory(news, artigo),
    ]);
    console.log(`[runManualPost] Feed: ${imageResult.filename} | Story: ${storyResult.filename}`);
  } catch (err) {
    console.error('[runManualPost] Erro ao gerar imagens:', err.message);
    return;
  }

  let feedGithubUrl, storyGithubUrl;
  try {
    [feedGithubUrl, storyGithubUrl] = await Promise.all([
      subirImagemGithub(imageResult.filepath),
      subirImagemGithub(storyResult.filepath),
    ]);
    console.log(`[runManualPost] GitHub: feed=${feedGithubUrl}`);
  } catch (err) {
    console.error('[runManualPost] Erro ao subir imagens:', err.message);
  }

  let registro;
  if (!TEST_MODE) {
    try {
      registro = await salvarNoticia({
        titulo:            news.title,
        fonte:             news.source,
        url_original:      null,
        imagem_url:        null,
        imagem_github:     feedGithubUrl || null,
        legenda_instagram: caption,
        artigo_completo:   artigo,
      });
      if (registro?.id) await marcarPostado(registro.id);
      console.log(`[runManualPost] Salvo no Supabase. ID: ${registro?.id}`);
    } catch (err) {
      console.error('[runManualPost] Erro ao salvar no Supabase:', err.message);
    }
  }

  const artigoId = registro?.id;
  const linkUrl  = artigoId ? `${PORTAL_BASE}/artigo.html?id=${artigoId}` : null;
  try {
    const postResult = await postToInstagram({ imageUrl: feedGithubUrl, caption, linkUrl });
    if (!TEST_MODE) console.log(`[runManualPost] Feed publicado! ID: ${postResult.postId}`);
  } catch (err) {
    console.error('[runManualPost] Erro ao publicar feed:', err.message);
  }

  try {
    const storyPost = await publicarStory(null, linkUrl, storyGithubUrl);
    if (!TEST_MODE) console.log(`[runManualPost] Story publicado! ID: ${storyPost.postId}`);
  } catch (err) {
    console.error('[runManualPost] Erro ao publicar story:', err.message);
  }

  try { fs.unlinkSync(imageResult.filepath); } catch (_) {}
  try { fs.unlinkSync(storyResult.filepath); } catch (_) {}

  console.log('[runManualPost] Post manual concluído.');
}

module.exports = { runPost, runTrendPost, runVarejoPost, runShoppingPost, runManualPost };

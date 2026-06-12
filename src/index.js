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
const { generateLinkedinCaption } = require('./generateLinkedinCaption');
const { translateTitle } = require('./translateTitle');
const { runVarejo }                                    = require('./varejo/index');
const { generateVarejoFeedImage, generateVarejoStoryImage } = require('./varejo/generateVarejoImage');
const { publishStaticPage } = require('./generateStaticPage');
const { gerarSlug } = require('./supabaseClient');
const { runLinkedinCarousel } = require('./linkedin/index');
const { generateCarouselImages } = require('./linkedin/generateCarouselImages');
const { postLinkedinCarousel } = require('./postLinkedinCarousel');

const TEST_MODE = process.env.TEST_MODE === 'true';
const PORTAL_BASE = 'https://vendaexponencial.com.br';

// Horários de postagem: 09:00, 13:00, 18:00, 19:00 (fuso Brasília = UTC-3)
// No Railway (UTC), os horários ficam: 12:00, 16:00, 21:00, 22:00
const SCHEDULE_TIMES = ['0 12 * * *', '0 16 * * *', '0 21 * * *', '0 22 * * *'];

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

  // Garantir título em português do Brasil (fontes internacionais publicam em inglês)
  try {
    news.title = await translateTitle(news.title);
    console.log(`[runPost] Título em pt-BR: "${news.title}"`);
  } catch (err) {
    console.error('[runPost] Erro ao traduzir título:', err.message);
  }

  // 2. Gerar artigo completo
  let artigo;
  try {
    artigo = await generateArticle(news);
    console.log('[runPost] Artigo gerado com sucesso.');
  } catch (err) {
    console.error('[runPost] Erro ao gerar artigo:', err.message);
    artigo = null;
  }

  // 3. Gerar imagem feed + story + legenda LinkedIn em paralelo
  let imageResult, storyResult, legendaLinkedin;
  try {
    [imageResult, storyResult, legendaLinkedin] = await Promise.all([
      generateImage(news, artigo),
      gerarStory(news, artigo),
      generateLinkedinCaption({
        titulo: news.title,
        fonte: news.source,
        url_fonte: news.link,
        artigo_completo: artigo,
      }),
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
    return;
  }

  if (!feedGithubUrl || !storyGithubUrl) {
    console.error('[runPost] URL da imagem não obtida — abortando...');
    return;
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
        legenda_linkedin:  legendaLinkedin,
        artigo_completo:   artigo,
      });
      if (registro?.id) await marcarPostado(registro.id);
      console.log(`[runPost] Salvo no Supabase. ID: ${registro?.id}`);
    } catch (err) {
      console.error('[runPost] Erro ao salvar no Supabase:', err.message);
    }
  }

  // 6. Publicar página estática do artigo
  const slugPost = registro?.slug || gerarSlug(news.title);
  const linkUrl = `${PORTAL_BASE}/artigos/${slugPost}.html`;
  if (registro) {
    try {
      await publishStaticPage({
        titulo: news.title,
        slug: slugPost,
        fonte: news.source,
        artigo_completo: artigo,
        imagem_github: feedGithubUrl,
        publicado_em: registro.publicado_em || new Date().toISOString(),
      });
    } catch (err) { console.error('[runPost] Erro ao publicar página estática:', err.message); }
  }

  // 7. Publicar post no feed (imagem já no GitHub, sem re-upload)
  let postResult;
  try {
    postResult = await postToInstagram({ imageUrl: feedGithubUrl, caption, linkUrl, linkedinCaption: legendaLinkedin });
    if (!TEST_MODE) console.log(`[runPost] Feed publicado! ID: ${postResult.postId}`);
  } catch (err) {
    console.error('[runPost] Erro ao publicar feed (site não afetado):', err.message);
  }

  // 8. Publicar story com link para o artigo
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

  // 2. Gerar imagens com template exclusivo de varejo + legenda LinkedIn em paralelo
  let imageResult, storyResult, legendaLinkedin;
  try {
    [imageResult, storyResult, legendaLinkedin] = await Promise.all([
      generateVarejoFeedImage(varejoResult.trendData, varejoResult.news.title),
      generateVarejoStoryImage(varejoResult.trendData, varejoResult.news.title),
      generateLinkedinCaption({
        titulo: news.title,
        fonte: news.source,
        url_fonte: news.link,
        artigo_completo: artigo,
      }),
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
        legenda_linkedin:  legendaLinkedin,
        artigo_completo:   artigo,
      });
      if (registro?.id) await marcarPostado(registro.id);
      console.log(`[runVarejoPost] Salvo no Supabase. ID: ${registro?.id}`);
    } catch (err) {
      console.error('[runVarejoPost] Erro ao salvar no Supabase:', err.message);
    }
  }

  // 5. Publicar página estática
  const slugVarejo = registro?.slug || gerarSlug(news.title);
  const linkUrl  = `${PORTAL_BASE}/artigos/${slugVarejo}.html`;
  if (registro) {
    try {
      await publishStaticPage({
        titulo: news.title, slug: slugVarejo, fonte: news.source,
        artigo_completo: artigo, imagem_github: feedGithubUrlV,
        publicado_em: registro.publicado_em || new Date().toISOString(),
      });
    } catch (err) { console.error('[runVarejoPost] Erro ao publicar página estática:', err.message); }
  }

  // 6. Publicar feed (imagem já no GitHub, sem re-upload)
  let postResult;
  try {
    postResult = await postToInstagram({ imageUrl: feedGithubUrlV, caption, linkUrl, linkedinCaption: legendaLinkedin });
    if (!TEST_MODE) console.log(`[runVarejoPost] Feed publicado! ID: ${postResult.postId}`);
  } catch (err) {
    console.error('[runVarejoPost] Erro ao publicar feed (site não afetado):', err.message);
  }

  // 7. Publicar story
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

// Carrossel de LinkedIn: 21:00 UTC = 18:00 BRT, dias úteis (seg-sex)
const LINKEDIN_CAROUSEL_SCHEDULE = '0 21 * * 1-5';
cron.schedule(LINKEDIN_CAROUSEL_SCHEDULE, () => runLinkedinCarouselPost().catch(err => console.error(`[cron] Erro em runLinkedinCarouselPost:`, err.message)), { timezone: 'UTC' });
console.log(`[cron] Agendado (carrossel LinkedIn): ${LINKEDIN_CAROUSEL_SCHEDULE} UTC`);

console.log(`✅ vexp-agent iniciado. TEST_MODE=${TEST_MODE}. Aguardando horários agendados (09h, 13h, 18h e 19h BRT + varejo 15h BRT + carrossel LinkedIn 18h BRT dias úteis)...`);

if (process.env.RUN_ON_START === 'true') {
  runPost().catch(err => console.error('[on-start] Erro em runPost:', err.message));
}

if (process.env.RUN_VAREJO_ON_START === 'true') {
  console.log('[on-start] RUN_VAREJO_ON_START ativo — disparando runVarejoPost...');
  runVarejoPost().catch(err => console.error('[on-start] Erro em runVarejoPost:', err.message));
}

if (process.env.RUN_LINKEDIN_CAROUSEL_ON_START === 'true') {
  console.log('[on-start] RUN_LINKEDIN_CAROUSEL_ON_START ativo — disparando runLinkedinCarouselPost...');
  runLinkedinCarouselPost().catch(err => console.error('[on-start] Erro em runLinkedinCarouselPost:', err.message));
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

  // Garantir título em português do Brasil (matchedNews pode vir de fonte internacional)
  try {
    news.title = await translateTitle(news.title);
  } catch (err) {
    console.error('[runTrendPost] Erro ao traduzir título:', err.message);
  }

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

  // 3. Gerar imagens feed + story + legenda LinkedIn em paralelo
  let imageResult, storyResult, legendaLinkedin;
  try {
    [imageResult, storyResult, legendaLinkedin] = await Promise.all([
      generateImage(news, artigo),
      gerarStory(news, artigo),
      generateLinkedinCaption({
        titulo: news.title,
        fonte: news.source,
        url_fonte: news.link,
        artigo_completo: artigo,
      }),
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
        legenda_linkedin:  legendaLinkedin,
        artigo_completo:   artigo,
      });
      if (registro?.id) await marcarPostado(registro.id);
      console.log(`[runTrendPost] Salvo no Supabase. ID: ${registro?.id}`);
    } catch (err) {
      console.error('[runTrendPost] Erro ao salvar no Supabase:', err.message);
    }
  }

  // 6. Publicar página estática
  const slugTrend = registro?.slug || gerarSlug(news.title);
  const linkUrl  = `${PORTAL_BASE}/artigos/${slugTrend}.html`;
  if (registro) {
    try {
      await publishStaticPage({
        titulo: news.title, slug: slugTrend, fonte: news.source,
        artigo_completo: artigo, imagem_github: feedGithubUrlT,
        publicado_em: registro.publicado_em || new Date().toISOString(),
      });
    } catch (err) { console.error('[runTrendPost] Erro ao publicar página estática:', err.message); }
  }

  // 7. Publicar feed (imagem já no GitHub, sem re-upload)
  let postResult;
  try {
    postResult = await postToInstagram({ imageUrl: feedGithubUrlT, caption, linkUrl, linkedinCaption: legendaLinkedin });
    if (!TEST_MODE) console.log(`[runTrendPost] Feed publicado! ID: ${postResult.postId}`);
  } catch (err) {
    console.error('[runTrendPost] Erro ao publicar feed (site não afetado):', err.message);
  }

  // 8. Publicar story
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

  // Garantir título em português do Brasil (título extraído de URL pode estar em inglês)
  try {
    news.title = await translateTitle(news.title);
  } catch (err) {
    console.error('[runManualPost] Erro ao traduzir título:', err.message);
  }

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

  let imageResult, storyResult, legendaLinkedin;
  try {
    [imageResult, storyResult, legendaLinkedin] = await Promise.all([
      generateImage(news, artigo),
      gerarStory(news, artigo),
      generateLinkedinCaption({
        titulo: news.title,
        fonte: news.source,
        url_fonte: news.link,
        artigo_completo: artigo,
      }),
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
        legenda_linkedin:  legendaLinkedin,
        artigo_completo:   artigo,
      });
      if (registro?.id) await marcarPostado(registro.id);
      console.log(`[runManualPost] Salvo no Supabase. ID: ${registro?.id}`);
    } catch (err) {
      console.error('[runManualPost] Erro ao salvar no Supabase:', err.message);
    }
  }

  // Publicar página estática
  const slugManual = registro?.slug || gerarSlug(news.title);
  const linkUrl  = `${PORTAL_BASE}/artigos/${slugManual}.html`;
  if (registro) {
    try {
      await publishStaticPage({
        titulo: news.title, slug: slugManual, fonte: news.source,
        artigo_completo: artigo, imagem_github: feedGithubUrl,
        publicado_em: registro.publicado_em || new Date().toISOString(),
      });
    } catch (err) { console.error('[runManualPost] Erro ao publicar página estática:', err.message); }
  }

  process.stdout.write(`[runManualPost] Iniciando feed post. feedGithubUrl=${feedGithubUrl}\n`);
  try {
    const postResult = await postToInstagram({ imageUrl: feedGithubUrl, caption, linkUrl, linkedinCaption: legendaLinkedin });
    if (!TEST_MODE) console.log(`[runManualPost] Feed publicado! ID: ${postResult.postId}`);
  } catch (err) {
    console.error('[runManualPost] Erro ao publicar feed:', err.message);
  }

  process.stdout.write(`[runManualPost] Iniciando story post. storyGithubUrl=${storyGithubUrl}\n`);
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

async function runLinkedinCarouselPost() {
  console.log(`\n[${new Date().toISOString()}] Iniciando ciclo CARROSSEL LINKEDIN... TEST_MODE=${TEST_MODE}`);

  // 1. Seleciona tema forte (filtro nota >= 7), gera artigo e conteúdo dos slides
  let resultado;
  try {
    resultado = await runLinkedinCarousel();
  } catch (err) {
    console.error('[runLinkedinCarouselPost] Erro na seleção/conteúdo:', err.message);
    return;
  }
  if (!resultado) {
    console.log('[runLinkedinCarouselPost] Nenhum tema forte hoje — ciclo pulado.');
    return;
  }
  const { news, artigo, content } = resultado;
  console.log(`[runLinkedinCarouselPost] Tema: "${news.title}" | slides: ${content.slides.length + 2}`);

  // 2. Renderiza os slides
  let imagens;
  try {
    imagens = await generateCarouselImages(content);
    console.log(`[runLinkedinCarouselPost] ${imagens.length} slides renderizados.`);
  } catch (err) {
    console.error('[runLinkedinCarouselPost] Erro ao renderizar slides:', err.message);
    return;
  }

  // 3. Upload de todos os slides para o GitHub (SEQUENCIAL — uploads paralelos
  //    geram commits concorrentes e disparam 409 no contents API)
  let urls = [];
  try {
    for (const img of imagens) {
      urls.push(await subirImagemGithub(img.filepath));
    }
  } catch (err) {
    console.error('[runLinkedinCarouselPost] Erro ao subir slides para GitHub:', err.message);
    return;
  }
  if (urls.some((u) => !u)) {
    console.error('[runLinkedinCarouselPost] Algum slide sem URL — abortando.');
    return;
  }

  // 4. Persistir registro (reusa schema existente: legenda_linkedin + capa como imagem_github)
  let registro;
  if (!TEST_MODE) {
    try {
      registro = await salvarNoticia({
        titulo:            news.title,
        fonte:             news.source,
        url_original:      news.link || null,
        imagem_url:        null,
        imagem_github:     urls[0] || null,
        legenda_instagram: null,
        legenda_linkedin:  content.legenda,
        artigo_completo:   artigo,
      });
      console.log(`[runLinkedinCarouselPost] Salvo no Supabase. ID: ${registro?.id}`);
    } catch (err) {
      console.error('[runLinkedinCarouselPost] Erro ao salvar no Supabase:', err.message);
    }
  }

  // 5. Página estática para dar destino ao link do carrossel
  const slug = registro?.slug || gerarSlug(news.title);
  const linkUrl = `${PORTAL_BASE}/artigos/${slug}.html`;
  if (registro) {
    try {
      await publishStaticPage({
        titulo: news.title, slug, fonte: news.source, artigo_completo: artigo,
        imagem_github: urls[0], publicado_em: registro.publicado_em || new Date().toISOString(),
      });
    } catch (err) { console.error('[runLinkedinCarouselPost] Erro na página estática:', err.message); }
  }

  // 6. Publicar carrossel no LinkedIn
  try {
    const r = await postLinkedinCarousel({
      imageUrls: urls,
      caption: content.legenda || news.title,
      title: content.capa.titulo,
      linkUrl,
    });
    if (!TEST_MODE) console.log(`[runLinkedinCarouselPost] Carrossel publicado! ID: ${r.postId}`);
  } catch (err) {
    console.error('[runLinkedinCarouselPost] Erro ao publicar carrossel:', err.message);
  }

  // 7. Limpeza dos arquivos locais
  for (const img of imagens) { try { fs.unlinkSync(img.filepath); } catch (_) {} }

  console.log('[runLinkedinCarouselPost] Ciclo de carrossel concluído.');
}

module.exports = { runPost, runTrendPost, runVarejoPost, runManualPost, runLinkedinCarouselPost };

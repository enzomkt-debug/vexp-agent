require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');
const { fetchLatestNews } = require('../fetchNews');
const { buscarTitulosRecentes, jaFoiPostado } = require('../supabaseClient');
const { isAssuntoDuplicado } = require('../dedupAssunto');
const { translateTitle } = require('../translateTitle');
const { generateArticle } = require('../generateArticle');
const { generateCarouselContent } = require('./generateCarouselContent');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const TEST_MODE = process.env.TEST_MODE === 'true';

// Nota mínima (0-10) para um tema ser considerado forte o suficiente para carrossel.
const NOTA_MINIMA = 7;

/**
 * Avalia se uma notícia tem substância para virar um bom carrossel.
 * Retorna { aprovado, nota, motivo }.
 */
async function avaliarPotencialCarrossel(news) {
  const prompt = `Você é editor de conteúdo do @vendaexponencial (e-commerce/varejo no Brasil).
Decida se a notícia abaixo rende um CARROSSEL de LinkedIn FORTE (5-7 cards), não um post qualquer.

Um tema MERECE carrossel quando tem PELO MENOS 3 destes:
- dados concretos (números, percentuais, prazos, valores)
- mais de um ângulo ou desdobramento para explorar
- impacto prático claro para lojista/afiliado/marketplace
- algo contraintuitivo, polêmico ou que muda decisão de negócio
- permite ensinar/explicar (não é só um factóide)

NÃO merece quando é: nota institucional, mudança trivial, release promocional,
fofoca de marca, evento sem implicação prática, ou notícia rasa sem dados.

Notícia:
Título: ${news.title}
Fonte: ${news.source}
Resumo: ${news.summary || 'n/d'}

Responda SOMENTE no formato:
NOTA: <0 a 10> | <APROVADO ou REPROVADO> | <justificativa curta>`;

  try {
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 150,
      messages: [{ role: 'user', content: prompt }],
    });
    const resp = (msg.content[0]?.text || '').trim();
    const nota = parseInt((resp.match(/NOTA:\s*(\d+)/i) || [])[1] || '0', 10);
    const aprovado = nota >= NOTA_MINIMA && /APROVADO/i.test(resp) && !/REPROVADO/i.test(resp);
    return { aprovado, nota, motivo: resp };
  } catch (err) {
    console.warn('[avaliarPotencialCarrossel] Erro:', err.message);
    return { aprovado: false, nota: 0, motivo: err.message };
  }
}

/**
 * Seleciona um tema forte, gera o artigo e o conteúdo do carrossel.
 * Retorna { news, artigo, content } ou null se nenhum tema do ciclo for bom o bastante.
 */
async function runLinkedinCarousel() {
  const items = await fetchLatestNews();
  if (!items.length) {
    console.warn('[runLinkedinCarousel] Nenhuma notícia encontrada.');
    return null;
  }

  const recentes = TEST_MODE ? [] : await buscarTitulosRecentes(30, 50);

  let news = null;
  for (const item of items) {
    if (!TEST_MODE && item.link && await jaFoiPostado(item.link)) continue;
    if (!TEST_MODE && recentes.length) {
      const dup = await isAssuntoDuplicado(item.title, recentes);
      if (dup.duplicado) continue;
    }

    const fit = await avaliarPotencialCarrossel(item);
    if (!fit.aprovado) {
      console.log(`[runLinkedinCarousel] Tema fraco p/ carrossel (nota ${fit.nota}): "${item.title}"`);
      continue;
    }
    console.log(`[runLinkedinCarousel] Tema aprovado (nota ${fit.nota}): "${item.title}"`);
    news = item;
    break;
  }

  // Preferência do projeto: pular o ciclo se não houver tema forte (não força carrossel ruim).
  if (!news) {
    console.warn('[runLinkedinCarousel] Nenhum tema forte o bastante hoje — pulando ciclo.');
    return null;
  }

  try { news.title = await translateTitle(news.title); } catch (_) {}

  const artigo = await generateArticle(news);
  const content = await generateCarouselContent({
    titulo: news.title,
    fonte: news.source,
    url_fonte: news.link,
    artigo_completo: artigo,
  });
  if (!content) {
    console.warn('[runLinkedinCarousel] Falha ao gerar conteúdo do carrossel — pulando ciclo.');
    return null;
  }

  return { news, artigo, content };
}

module.exports = { runLinkedinCarousel, avaliarPotencialCarrossel, NOTA_MINIMA };

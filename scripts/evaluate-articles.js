#!/usr/bin/env node
/**
 * evaluate-articles.js
 *
 * Avalia a qualidade de todos os artigos publicados em docs/artigos/*.html.
 *
 * Dimensoes avaliadas:
 *  - SEO: tamanho do <title>, da meta description, presenca de canonical/OG/JSON-LD
 *  - Coerencia: a meta description corresponde ao tema do titulo?
 *  - Conteudo: contagem de palavras do corpo (conteudo "fino" / thin content)
 *  - Idioma: palavras em ingles vazando no texto em PT-BR
 *  - Estrutura: imagem, CTA, headings, data de publicacao valida
 *  - Duplicacao: corpos de texto repetidos entre artigos
 *
 * Saida: relatorio em docs/avaliacao-artigos.md + resumo no console.
 *
 * Uso: node scripts/evaluate-articles.js
 */

const fs = require('fs');
const path = require('path');

const ARTICLES_DIR = path.join(__dirname, '..', 'docs', 'artigos');
const REPORT_PATH = path.join(__dirname, '..', 'docs', 'avaliacao-artigos.md');

// ---- limites usados nas heuristicas ----
const TITLE_MIN = 15;
const TITLE_MAX = 65;          // limite recomendado para o <title> visivel no Google
const DESC_MIN = 70;
const DESC_MAX = 160;          // limite recomendado para meta description
const BODY_MIN_WORDS = 250;    // abaixo disso = thin content
const TITLE_OVERLAP_MIN = 0.15; // sobreposicao minima entre palavras do titulo e da descricao

// palavras em ingles que costumam vazar em textos gerados por IA
const ENGLISH_LEAKS = [
  'forever', 'however', 'therefore', 'overall', 'meanwhile', 'nowadays',
  'indeed', 'moreover', 'furthermore', 'whatever', 'anyway', 'instead',
  'actually', 'basically', 'literally', 'really', 'kind of', 'sort of',
];

// stopwords PT para o calculo de sobreposicao titulo x descricao
const STOPWORDS = new Set([
  'a', 'o', 'as', 'os', 'um', 'uma', 'de', 'do', 'da', 'dos', 'das', 'e',
  'em', 'no', 'na', 'nos', 'nas', 'que', 'por', 'para', 'com', 'sem', 'mais',
  'menos', 'ja', 'sao', 'esta', 'estao', 'ser', 'sua', 'seu', 'como', 'foi',
  'ou', 'se', 'ao', 'aos', 'pelo', 'pela', 'the', 'of', 'to', 'and',
]);

function decodeEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function stripTags(html) {
  return decodeEntities(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function extractMeta(html, name, attr = 'name') {
  const re = new RegExp(`<meta\\s+${attr}=["']${name}["']\\s+content=["']([^"']*)["']`, 'i');
  const m = html.match(re);
  return m ? decodeEntities(m[1]) : null;
}

function tokenize(str) {
  return (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

function overlapRatio(titleWords, descWords) {
  if (!titleWords.length || !descWords.length) return 0;
  const descSet = new Set(descWords);
  const hits = titleWords.filter((w) => descSet.has(w)).length;
  return hits / titleWords.length;
}

function evaluateArticle(file, html) {
  const issues = [];

  // --- titulo ---
  const titleTag = (html.match(/<title>([^<]*)<\/title>/i) || [])[1] || '';
  const title = decodeEntities(titleTag.replace(/\s*—\s*Venda Exponencial\s*$/i, '').trim());
  if (!title) issues.push({ sev: 'erro', msg: 'Sem <title>' });
  else if (title.length < TITLE_MIN) issues.push({ sev: 'aviso', msg: `Titulo curto (${title.length} chars)` });
  else if (title.length > TITLE_MAX) issues.push({ sev: 'info', msg: `Titulo longo para SEO (${title.length} chars)` });

  // --- meta description ---
  const desc = extractMeta(html, 'description') || '';
  if (!desc) issues.push({ sev: 'erro', msg: 'Sem meta description' });
  else if (desc.length < DESC_MIN) issues.push({ sev: 'aviso', msg: `Description curta (${desc.length} chars)` });
  else if (desc.length > DESC_MAX + 5) issues.push({ sev: 'info', msg: `Description longa (${desc.length} chars)` });

  // --- coerencia titulo x description ---
  const overlap = overlapRatio(tokenize(title), tokenize(desc));
  if (title && desc && overlap < TITLE_OVERLAP_MIN) {
    issues.push({ sev: 'erro', msg: `Description nao corresponde ao titulo (overlap ${(overlap * 100).toFixed(0)}%)` });
  }

  // --- corpo ---
  const bodyMatch = html.match(/<div class="article-body">([\s\S]*?)<\/div>\s*(?:<hr|<div class="cta|<\/main)/i);
  const bodyHtml = bodyMatch ? bodyMatch[1] : '';
  const bodyText = stripTags(bodyHtml);
  const wordCount = bodyText ? bodyText.split(/\s+/).length : 0;
  if (wordCount === 0) issues.push({ sev: 'erro', msg: 'Corpo vazio' });
  else if (wordCount < BODY_MIN_WORDS) issues.push({ sev: 'aviso', msg: `Conteudo fino (${wordCount} palavras)` });

  // --- idioma: vazamento de ingles ---
  const lower = ' ' + bodyText.toLowerCase() + ' ';
  const leaks = ENGLISH_LEAKS.filter((w) => lower.includes(` ${w} `) || lower.includes(` ${w}.`) || lower.includes(` ${w},`));
  if (leaks.length) issues.push({ sev: 'aviso', msg: `Possivel ingles no texto: ${leaks.join(', ')}` });

  // --- estrutura ---
  if (!/class="article-img"/.test(html)) issues.push({ sev: 'aviso', msg: 'Sem imagem do artigo' });
  if (!/class="cta-box"/.test(html)) issues.push({ sev: 'info', msg: 'Sem bloco CTA' });
  if (!/application\/ld\+json/.test(html)) issues.push({ sev: 'aviso', msg: 'Sem JSON-LD (schema.org)' });
  if (!/rel="canonical"/.test(html)) issues.push({ sev: 'aviso', msg: 'Sem canonical' });

  // --- data de publicacao ---
  const dateMatch = html.match(/article:published_time["']\s+content=["']([^"']+)["']/i);
  const pubDate = dateMatch ? new Date(dateMatch[1]) : null;
  if (!pubDate || isNaN(pubDate.getTime())) issues.push({ sev: 'aviso', msg: 'Data de publicacao ausente/invalida' });
  else if (pubDate.getTime() > Date.now() + 24 * 3600 * 1000) issues.push({ sev: 'aviso', msg: 'Data de publicacao no futuro' });

  return {
    file: path.basename(file),
    title,
    desc,
    wordCount,
    overlap,
    bodyText,
    pubDate: pubDate && !isNaN(pubDate.getTime()) ? pubDate.toISOString().slice(0, 10) : null,
    issues,
  };
}

function bodyFingerprint(text) {
  // primeiras 200 chars normalizadas como assinatura de duplicacao
  return text.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 200);
}

function main() {
  const files = fs.readdirSync(ARTICLES_DIR).filter((f) => f.endsWith('.html')).sort();
  const results = files.map((f) => {
    const html = fs.readFileSync(path.join(ARTICLES_DIR, f), 'utf8');
    return evaluateArticle(f, html);
  });

  // --- duplicacao de corpo ---
  const fpMap = new Map();
  for (const r of results) {
    const fp = bodyFingerprint(r.bodyText);
    if (fp.length < 50) continue;
    if (!fpMap.has(fp)) fpMap.set(fp, []);
    fpMap.get(fp).push(r.file);
  }
  const dupes = [...fpMap.values()].filter((arr) => arr.length > 1);
  for (const group of dupes) {
    for (const file of group) {
      const r = results.find((x) => x.file === file);
      r.issues.push({ sev: 'aviso', msg: `Corpo duplicado com ${group.length - 1} outro(s) artigo(s)` });
    }
  }

  // --- agregacoes ---
  const sevOrder = { erro: 0, aviso: 1, info: 2 };
  const total = results.length;
  const withErro = results.filter((r) => r.issues.some((i) => i.sev === 'erro'));
  const withAviso = results.filter((r) => r.issues.some((i) => i.sev === 'aviso'));
  const clean = results.filter((r) => r.issues.length === 0);

  // contagem por tipo de issue (mensagem normalizada)
  const issueCounts = {};
  for (const r of results) {
    for (const i of r.issues) {
      const key = i.msg.replace(/\d+/g, 'N').replace(/:.*/, '').trim();
      issueCounts[key] = issueCounts[key] || { count: 0, sev: i.sev };
      issueCounts[key].count++;
    }
  }
  const avgWords = Math.round(results.reduce((s, r) => s + r.wordCount, 0) / total);

  // --- monta relatorio markdown ---
  const lines = [];
  lines.push('# Avaliacao dos Artigos Publicados');
  lines.push('');
  lines.push(`Gerado em ${new Date().toISOString().slice(0, 10)} a partir de \`docs/artigos/\`.`);
  lines.push('');
  lines.push('## Resumo');
  lines.push('');
  lines.push(`- **Total de artigos:** ${total}`);
  lines.push(`- **Sem problemas:** ${clean.length} (${((clean.length / total) * 100).toFixed(0)}%)`);
  lines.push(`- **Com erros (criticos):** ${withErro.length}`);
  lines.push(`- **Com avisos:** ${withAviso.length}`);
  lines.push(`- **Media de palavras no corpo:** ${avgWords}`);
  lines.push(`- **Grupos de conteudo duplicado:** ${dupes.length}`);
  lines.push('');
  lines.push('## Problemas mais frequentes');
  lines.push('');
  lines.push('| Tipo | Severidade | Ocorrencias |');
  lines.push('| --- | --- | --- |');
  Object.entries(issueCounts)
    .sort((a, b) => b[1].count - a[1].count)
    .forEach(([msg, { count, sev }]) => {
      lines.push(`| ${msg} | ${sev} | ${count} |`);
    });
  lines.push('');

  // top problematicos
  const ranked = results
    .map((r) => ({
      r,
      score: r.issues.reduce((s, i) => s + (3 - sevOrder[i.sev]), 0),
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  lines.push('## Artigos que mais precisam de atencao');
  lines.push('');
  lines.push('| Artigo | Palavras | Problemas |');
  lines.push('| --- | --- | --- |');
  ranked.slice(0, 30).forEach(({ r }) => {
    const probs = r.issues.map((i) => `${i.sev === 'erro' ? '🔴' : i.sev === 'aviso' ? '🟡' : '🔵'} ${i.msg}`).join('; ');
    lines.push(`| ${r.file} | ${r.wordCount} | ${probs} |`);
  });
  lines.push('');

  if (dupes.length) {
    lines.push('## Grupos de conteudo duplicado');
    lines.push('');
    dupes.forEach((group, idx) => {
      lines.push(`**Grupo ${idx + 1}:**`);
      group.forEach((f) => lines.push(`- ${f}`));
      lines.push('');
    });
  }

  lines.push('## Detalhamento completo');
  lines.push('');
  lines.push('| Artigo | Palavras | Overlap titulo/desc | Problemas |');
  lines.push('| --- | --- | --- | --- |');
  results
    .slice()
    .sort((a, b) => a.file.localeCompare(b.file))
    .forEach((r) => {
      const probs = r.issues.length
        ? r.issues.map((i) => `${i.sev === 'erro' ? '🔴' : i.sev === 'aviso' ? '🟡' : '🔵'} ${i.msg}`).join('; ')
        : '✅ ok';
      lines.push(`| ${r.file} | ${r.wordCount} | ${(r.overlap * 100).toFixed(0)}% | ${probs} |`);
    });
  lines.push('');

  fs.writeFileSync(REPORT_PATH, lines.join('\n'), 'utf8');

  // --- resumo no console ---
  console.log(`\nAvaliacao concluida: ${total} artigos`);
  console.log(`  Sem problemas: ${clean.length}`);
  console.log(`  Com erros criticos: ${withErro.length}`);
  console.log(`  Com avisos: ${withAviso.length}`);
  console.log(`  Media de palavras: ${avgWords}`);
  console.log(`  Grupos duplicados: ${dupes.length}`);
  console.log('\nProblemas mais frequentes:');
  Object.entries(issueCounts)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 10)
    .forEach(([msg, { count, sev }]) => console.log(`  [${sev}] ${msg}: ${count}`));
  console.log(`\nRelatorio salvo em: ${path.relative(path.join(__dirname, '..'), REPORT_PATH)}`);
}

main();

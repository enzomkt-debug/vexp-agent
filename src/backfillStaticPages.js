// src/backfillStaticPages.js — Gera páginas estáticas para artigos existentes
require('dotenv').config();
const { supabase } = require('./supabaseClient');
const { publishStaticPage } = require('./generateStaticPage');

async function backfill() {
  console.log('[backfill] Buscando artigos publicados...');

  const { data: artigos, error } = await supabase
    .from('noticias')
    .select('id, titulo, slug, fonte, artigo_completo, imagem_github, publicado_em')
    .not('slug', 'is', null)
    .order('publicado_em', { ascending: false })
    .limit(1000);

  if (error) {
    console.error('[backfill] Erro ao buscar artigos:', error.message);
    process.exit(1);
  }

  console.log(`[backfill] ${artigos.length} artigos encontrados.`);

  for (const artigo of artigos) {
    if (!artigo.slug) {
      console.warn(`[backfill] Artigo ID=${artigo.id} sem slug — pulando.`);
      continue;
    }

    try {
      await publishStaticPage({
        titulo: artigo.titulo,
        slug: artigo.slug,
        fonte: artigo.fonte,
        artigo_completo: artigo.artigo_completo,
        imagem_github: artigo.imagem_github,
        publicado_em: artigo.publicado_em,
      });
      console.log(`  ✓ ${artigo.slug}`);
    } catch (err) {
      console.error(`  ✗ ${artigo.slug}: ${err.message}`);
    }

    // Delay para não exceder rate limit do GitHub API
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log('[backfill] Concluído.');
}

backfill();

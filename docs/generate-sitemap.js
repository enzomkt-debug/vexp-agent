/**
 * Gera sitemap.xml dinamicamente a partir dos slugs do Supabase.
 * Uso: node docs/generate-sitemap.js
 * Requer: SUPABASE_URL e SUPABASE_ANON_KEY no .env da raiz do projeto.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://vendaexponencial.com.br';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function generateSitemap() {
  const { data, error } = await sb
    .from('noticias')
    .select('slug, publicado_em')
    .not('slug', 'is', null)
    .order('publicado_em', { ascending: false })
    .limit(1000);

  if (error) {
    console.error('Erro ao buscar slugs:', error.message);
    process.exit(1);
  }

  const today = new Date().toISOString().split('T')[0];

  const urls = [
    // Página principal
    `  <url>
    <loc>${BASE_URL}/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>`,
    // Artigos
    ...(data || []).map(n => {
      const lastmod = n.publicado_em ? n.publicado_em.split('T')[0] : today;
      return `  <url>
    <loc>${BASE_URL}/artigo/${n.slug}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>`;
    }),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>`;

  const outPath = path.join(__dirname, 'sitemap.xml');
  fs.writeFileSync(outPath, xml, 'utf8');
  console.log(`✅ sitemap.xml gerado com ${(data || []).length + 1} URLs → ${outPath}`);
}

generateSitemap();

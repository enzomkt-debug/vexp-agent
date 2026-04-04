require('dotenv').config();
const axios = require('axios');
const { supabase } = require('../src/supabaseClient');

const BASE_URL = 'https://vendaexponencial.com.br';
const GITHUB_REPO = process.env.GITHUB_REPO;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';
const SITEMAP_PATH = 'docs/sitemap.xml';

function formatDate(iso) {
  return new Date(iso).toISOString().slice(0, 10);
}

async function generateSitemap() {
  // Busca todos os artigos publicados
  const { data: artigos, error } = await supabase
    .from('noticias')
    .select('id, slug, publicado_em')
    .order('publicado_em', { ascending: false });

  if (error) {
    console.error('[sitemap] Erro ao buscar artigos:', error.message);
    process.exit(1);
  }

  const today = formatDate(new Date().toISOString());

  const staticPages = [
    { loc: `${BASE_URL}/`,            lastmod: today,  changefreq: 'daily',   priority: '1.0' },
    { loc: `${BASE_URL}/artigo.html`, lastmod: today,  changefreq: 'never',   priority: '0.3' },
  ];

  const articlePages = (artigos || []).map(a => ({
    loc:        a.slug ? `${BASE_URL}/artigo.html?slug=${a.slug}` : `${BASE_URL}/artigo.html?id=${a.id}`,
    lastmod:    formatDate(a.publicado_em),
    changefreq: 'never',
    priority:   '0.8',
  }));

  const allPages = [...staticPages, ...articlePages];

  const urls = allPages.map(p => `  <url>
    <loc>${p.loc}</loc>
    <lastmod>${p.lastmod}</lastmod>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`).join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;

  // Sobe para o GitHub via Contents API
  const apiUrl = `https://api.github.com/repos/${GITHUB_REPO}/contents/${SITEMAP_PATH}`;

  let sha;
  try {
    const { data } = await axios.get(apiUrl, {
      headers: { Authorization: `token ${GITHUB_TOKEN}` },
    });
    sha = data.sha;
  } catch (_) {}

  const body = {
    message: `chore: atualiza sitemap (${articlePages.length} artigos)`,
    content: Buffer.from(xml).toString('base64'),
    branch: GITHUB_BRANCH,
    ...(sha ? { sha } : {}),
  };

  await axios.put(apiUrl, body, {
    headers: {
      Authorization: `token ${GITHUB_TOKEN}`,
      'Content-Type': 'application/json',
    },
  });

  console.log(`[sitemap] Atualizado com ${articlePages.length} artigos.`);
}

generateSitemap().catch(err => {
  console.error('[sitemap] Erro:', err.message);
  process.exit(1);
});

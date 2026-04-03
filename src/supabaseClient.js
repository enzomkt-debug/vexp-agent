require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function salvarNoticia({ titulo, fonte, url_original, imagem_url, imagem_github, legenda_instagram, artigo_completo }) {
  const { data, error } = await supabase.from('noticias').insert([{
    titulo,
    fonte,
    url_original,
    imagem_url:         imagem_url || null,
    imagem_github:      imagem_github || null,
    legenda_instagram:  legenda_instagram || null,
    artigo_completo:    artigo_completo || null,
    publicado_em:       new Date().toISOString(),
    postado_instagram:  false,
  }]).select().single();

  if (error) console.error('[Supabase] Erro ao salvar notícia:', error.message);
  return data;
}

async function marcarPostado(id) {
  const { error } = await supabase
    .from('noticias')
    .update({ postado_instagram: true })
    .eq('id', id);

  if (error) console.error('[Supabase] Erro ao marcar postado:', error.message);
}

async function buscarUltimasNoticias(limit = 10) {
  const { data, error } = await supabase
    .from('noticias')
    .select('*')
    .order('publicado_em', { ascending: false })
    .limit(limit);

  if (error) console.error('[Supabase] Erro ao buscar notícias:', error.message);
  return data || [];
}

async function jaPostadoHoje(url_original) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { data } = await supabase
    .from('noticias')
    .select('id')
    .eq('url_original', url_original)
    .gte('publicado_em', today.toISOString())
    .limit(1);

  return data && data.length > 0;
}

module.exports = { supabase, salvarNoticia, marcarPostado, buscarUltimasNoticias, jaPostadoHoje };

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

async function logPost({ title, source, imageUrl, caption, status, error }) {
  const { data, err } = await supabase.from('posts').insert([
    {
      title,
      source,
      image_url: imageUrl,
      caption,
      status,
      error: error || null,
      posted_at: new Date().toISOString(),
    },
  ]);
  if (err) console.error('[Supabase] Erro ao logar post:', err.message);
  return data;
}

async function wasPostedToday(title) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { data } = await supabase
    .from('posts')
    .select('id')
    .eq('title', title)
    .gte('posted_at', today.toISOString())
    .limit(1);

  return data && data.length > 0;
}

module.exports = { supabase, logPost, wasPostedToday };

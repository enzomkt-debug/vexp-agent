-- Run this in your Supabase SQL editor to create the posts log table

create table if not exists posts (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  source      text,
  image_url   text,
  caption     text,
  status      text not null,   -- 'success' | 'error'
  error       text,
  posted_at   timestamptz not null default now()
);

-- Index to speed up the "already posted today?" check
create index if not exists posts_title_posted_at_idx on posts (title, posted_at);

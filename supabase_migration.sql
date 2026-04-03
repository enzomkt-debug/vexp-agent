-- Run this in your Supabase SQL editor

create table if not exists noticias (
  id                  uuid primary key default gen_random_uuid(),
  titulo              text not null,
  slug                text unique,
  fonte               text,
  url_original        text,
  imagem_url          text,
  imagem_github       text,
  legenda_instagram   text,
  artigo_completo     text,
  publicado_em        timestamptz not null default now(),
  postado_instagram   boolean not null default false
);

-- Indexes
create index if not exists noticias_url_publicado_idx on noticias (url_original, publicado_em);
create index if not exists noticias_slug_idx on noticias (slug);

-- Add slug column if table already exists
-- ALTER TABLE noticias ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE;
-- CREATE INDEX IF NOT EXISTS noticias_slug_idx ON noticias(slug);

-- RLS policies
alter table noticias enable row level security;

create policy "anon can insert" on noticias
  for insert to anon with check (true);

create policy "anon can select" on noticias
  for select to anon using (true);

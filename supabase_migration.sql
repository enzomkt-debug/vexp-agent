-- Run this in your Supabase SQL editor

create table if not exists noticias (
  id                  uuid primary key default gen_random_uuid(),
  titulo              text not null,
  fonte               text,
  url_original        text,
  imagem_url          text,
  imagem_github       text,
  legenda_instagram   text,
  artigo_completo     text,
  publicado_em        timestamptz not null default now(),
  postado_instagram   boolean not null default false
);

-- Index for daily dedup check
create index if not exists noticias_url_publicado_idx on noticias (url_original, publicado_em);

-- WhatsApp To-Do Agent — Migration inicial
-- Rodar no projeto Supabase: venda-exponencial
-- SQL Editor → colar tudo → Run

CREATE TABLE IF NOT EXISTS todo_messages (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  evolution_id      text        UNIQUE NOT NULL,
  remote_jid        text        NOT NULL,
  is_group          boolean     NOT NULL DEFAULT false,
  group_name        text,
  sender_jid        text        NOT NULL,
  sender_name       text,
  message_type      text        NOT NULL,
  content           text,
  has_media         boolean     NOT NULL DEFAULT false,
  media_caption     text,
  timestamp_ms      bigint      NOT NULL,
  received_at       timestamptz NOT NULL DEFAULT now(),
  processed         boolean     NOT NULL DEFAULT false,
  processed_at      timestamptz
);

CREATE INDEX IF NOT EXISTS idx_todo_messages_processed
  ON todo_messages(processed, timestamp_ms);

CREATE INDEX IF NOT EXISTS idx_todo_messages_remote_jid
  ON todo_messages(remote_jid);

CREATE TABLE IF NOT EXISTS todo_digests (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  generated_at          timestamptz NOT NULL DEFAULT now(),
  window_start          timestamptz NOT NULL,
  window_end            timestamptz NOT NULL,
  messages_processed    integer     NOT NULL,
  items_extracted       integer     NOT NULL,
  claude_input_tokens   integer,
  claude_output_tokens  integer,
  claude_cost_usd       numeric(10, 4),
  sent_to_whatsapp      boolean     NOT NULL DEFAULT false,
  sent_at               timestamptz,
  evolution_message_id  text,
  error                 text
);

CREATE TABLE IF NOT EXISTS todo_items (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  digest_id           uuid        NOT NULL REFERENCES todo_digests(id) ON DELETE CASCADE,
  category            text        NOT NULL,
  title               text        NOT NULL,
  description         text,
  source_jid          text        NOT NULL,
  source_name         text,
  source_message_ids  uuid[]      NOT NULL,
  due_at              timestamptz,
  urgency             text        NOT NULL CHECK (urgency IN ('alta', 'média', 'baixa')),
  is_implicit         boolean     NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_todo_items_digest ON todo_items(digest_id);
CREATE INDEX IF NOT EXISTS idx_todo_items_category ON todo_items(category);

CREATE TABLE IF NOT EXISTS todo_state (
  id              integer     PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  last_digest_at  timestamptz,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

INSERT INTO todo_state (id, last_digest_at)
VALUES (1, now())
ON CONFLICT (id) DO NOTHING;

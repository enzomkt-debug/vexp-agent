# whatsapp-todo-agent

Agente que lê todas as mensagens do WhatsApp pessoal e envia um resumo diário de tarefas às 08:00 BRT.

---

## Checklist de deploy (fazer em ordem)

### Passo 1 — Supabase: criar tabelas (~5 min)

1. Abrir supabase.com → projeto **venda-exponencial**
2. Menu lateral → **SQL Editor**
3. Colar o conteúdo do arquivo `sql/001_init.sql`
4. Clicar em **Run**

---

### Passo 2 — Railway: criar serviço (~15 min)

1. railway.app → **New Project** → **Deploy from GitHub repo** → `whatsapp-todo-agent`
2. Ir em **Variables** e adicionar:

```
SUPABASE_URL              = (Settings → API do projeto venda-exponencial)
SUPABASE_SERVICE_ROLE_KEY = (Settings → API → service_role key)
EVOLUTION_API_URL         = (mesma URL do meli-agent)
EVOLUTION_API_KEY         = (mesma key do meli-agent)
EVOLUTION_INSTANCE        = (mesmo nome de instância do meli-agent)
ANTHROPIC_API_KEY         = (console.anthropic.com → API Keys)
CLAUDE_MODEL              = claude-sonnet-4-6
ENZO_WHATSAPP_NUMBER      = 5511XXXXXXXXX
DIGEST_CRON               = 0 8 * * *
DIGEST_TIMEZONE           = America/Sao_Paulo
LOG_LEVEL                 = info
NODE_ENV                  = production
PORT                      = 3000
```

3. Clicar em **Deploy**

---

### Passo 3 — Webhook na Evolution API (~5 min)

Após o Railway dar a URL do serviço:

```bash
curl -X POST https://SUA_EVOLUTION_URL/webhook/set/NOME_DA_INSTANCIA \
  -H "Content-Type: application/json" \
  -H "apikey: SUA_API_KEY" \
  -d '{"url": "https://SEU_TODO_AGENT.up.railway.app/webhook/messages", "webhook_by_events": false, "events": ["MESSAGES_UPSERT"]}'
```

---

### Passo 4 — Verificar

```bash
curl https://SEU_TODO_AGENT.up.railway.app/health
# {"status":"ok","ts":"..."}
```

O ingestor começa a coletar imediatamente. Primeiro digest real em **1-2 dias**.

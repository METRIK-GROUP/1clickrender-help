# 1clickrender-help

AI support assistant for **1 Click Render** at https://help.1clickrender.com.br.

## What it does

- Public chat (no login) for installation, activation, viewport, and method questions
- Multi-language UI (PT-BR / EN / ES) — KB in PT-BR, translated on the fly
- Image upload + paste (multimodal Gemini Flash)
- Deeplink from the SketchUp/Revit/Archicad plugin with technical context pre-filled
- Daily kaizen cron clusters repeated questions, detects KB gaps, opens GitHub issues
- Admin dashboard at `/admin.html`

## Stack

| Layer | Tech |
|---|---|
| Frontend | Vanilla HTML/JS, GitHub Pages |
| Backend | Supabase Edge Functions (Deno) |
| DB | Postgres + pg_cron |
| LLM | Gemini 2.5 Flash (AI Studio, free tier) |
| Tests | Deno test (unit/integration) + Playwright (E2E) |
| CI/CD | GitHub Actions |

## Local dev

```bash
npm install
supabase start
cp tests/fixtures/kb-cache.json supabase/functions/chat/kb-cache.json
supabase functions serve --env-file supabase/.env.local
deno test --allow-env --allow-read tests/unit/
RUN_INTEGRATION=1 deno test --allow-env --allow-net tests/integration/
npx playwright test
```

## Adding to the KB

1. Create or edit `kb/pt-br/<topic>.md`
2. Commit + push to `main`
3. GitHub Action rebuilds and deploys edge functions automatically

## Roadmap

- [ ] Embed in plugin (Ruby SketchUp / C# Revit / PyQt6 Archicad)
- [ ] Migrate to Vertex AI for privacy compliance once volume validates
- [ ] Notion sync for mobile reading of daily reports

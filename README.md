# 1clickrender-help

AI support assistant for 1 Click Render. Lives at https://help.1clickrender.com.br.

## Stack
- Frontend: vanilla HTML/JS, GitHub Pages
- Backend: Supabase Edge Functions (Deno)
- AI: Gemini 2.5 Flash (AI Studio API)
- DB: Postgres (Supabase)

## Development

See `docs/` for spec and implementation plan.

## Deploy

Pushes to `main` deploy automatically via GitHub Actions:
- Frontend → GitHub Pages
- Edge Functions → Supabase project `1clickrender`

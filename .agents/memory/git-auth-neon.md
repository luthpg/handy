---
name: Git + Auth + Neon Architecture
description: How git operations, GitHub auth, and Neon DB are wired in the IDE
---

## Git (simple-git)
- Routes: GET /git/status, /git/log, /git/diff; POST /git/init, /git/add, /git/commit, /git/push, /git/pull, /git/clone, /git/checkout, /git/remote
- Operates on `user-workspace/` (the user's working directory)
- Push/pull auth: temporarily rewrites remote URL with token embedded (`https://user:token@github.com/...`), restores original URL after

## GitHub Auth
- Two modes: full OAuth flow (needs GITHUB_CLIENT_ID + GITHUB_CLIENT_SECRET) and manual PAT entry
- Routes: GET /auth/github (redirect), GET /auth/github/callback, GET /auth/status, DELETE /auth/github, POST /auth/github/token
- Credentials stored in Neon DB (key: github_token, github_username) with in-memory fallback

## Neon DB (src/lib/db.ts)
- Uses DATABASE_URL env var; gracefully falls back to in-memory Map if not set
- Schema: single table `ide_config (key TEXT PRIMARY KEY, value TEXT, updated_at TIMESTAMPTZ)`
- initDb() called at server startup (non-blocking)
- DATABASE_URL auto-available in Replit env (built-in Postgres)

## Frontend
- GitPanel component in src/components/GitPanel.tsx — calls /api/git/* and /api/auth/* directly via fetch
- Sidebar in IDE.tsx has Files/Git tabs (sidebarTab state)

## Deployment
- Frontend: vercel.json in artifacts/node-ide/; SPA rewrites, static Vite build
- Backend: Dockerfile + fly.toml in artifacts/api-server/; see DEPLOY.md for full instructions
- CORS update needed in app.ts for production Vercel domain

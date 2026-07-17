# Deployment Guide

## Frontend → Vercel

1. **Install Vercel CLI**: `npm i -g vercel`
2. **Build & Deploy**:
   ```bash
   cd artifacts/node-ide
   vercel deploy
   ```
3. **Environment variables** to set in Vercel dashboard:
   - `VITE_API_URL` — your Fly.io backend URL (e.g. `https://node-ide-api.fly.dev`)

> `vercel.json` is already configured for SPA routing.

---

## Backend → Fly.io

### Prerequisites
```bash
brew install flyctl     # macOS
# or: curl -L https://fly.io/install.sh | sh
fly auth login
```

### First deployment
```bash
# Create the app (once)
fly apps create node-ide-api --org personal

# Create a persistent volume for user-workspace
fly volumes create user_workspace --size 1 --region nrt --app node-ide-api

# Set required secrets
fly secrets set SESSION_SECRET="$(openssl rand -hex 32)" --app node-ide-api
fly secrets set DATABASE_URL="<your-neon-connection-string>" --app node-ide-api
fly secrets set GITHUB_CLIENT_ID="<from-github-oauth-app>" --app node-ide-api
fly secrets set GITHUB_CLIENT_SECRET="<from-github-oauth-app>" --app node-ide-api

# Deploy
fly deploy --config artifacts/api-server/fly.toml
```

### Subsequent deploys
```bash
fly deploy --config artifacts/api-server/fly.toml
```

---

## Neon Database

1. Create a project at [neon.tech](https://neon.tech)
2. Copy the **connection string** (format: `postgresql://user:pass@host/db?sslmode=require`)
3. Set it as `DATABASE_URL` in both:
   - Fly.io secrets (see above)
   - Replit environment secrets (for development)

The database schema is created automatically on first startup.

---

## GitHub OAuth App

1. Go to [GitHub → Settings → Developer settings → OAuth Apps](https://github.com/settings/developers)
2. Click **New OAuth App**
3. Set:
   - **Homepage URL**: your Vercel frontend URL
   - **Authorization callback URL**: `https://<your-fly-app>.fly.dev/api/auth/github/callback`
4. Copy **Client ID** and **Client Secret**
5. Set them as `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` in Fly.io secrets

For local dev, add a second OAuth App (or the same app with a second callback URL):
- Callback: `https://<your-replit-dev-domain>/api/auth/github/callback`

---

## CORS Configuration

Update `artifacts/api-server/src/app.ts` to allow your Vercel domain:

```typescript
cors({
  origin: [
    'https://your-app.vercel.app',
    /\.replit\.dev$/,
  ],
  credentials: true,
})
```

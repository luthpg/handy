---
name: WebSocket Terminal Proxy
description: How the terminal WebSocket is routed in the Replit environment
---

The Replit shared proxy at port 80 routes by path (/api → api-server, / → node-ide) but does NOT forward WebSocket upgrade requests for /api/* artifact subpaths — they return 502.

**Solution**: Vite dev server proxy in `artifacts/node-ide/vite.config.ts`:
```ts
proxy: {
  '/terminal': { target: 'http://localhost:8080', ws: true, changeOrigin: true }
}
```
Browser connects to `ws://host/terminal` (root path, handled by Vite), Vite proxies the WS upgrade to api-server:8080/terminal. Works because Vite is the root artifact and its port 80 proxy DOES forward WS.

**Why**: Direct curl to localhost:8080/terminal returns HTTP 101 (server OK), so the issue is the Replit proxy layer only, not the code.

**XTerminal.tsx** builds URL as `ws://host/terminal` (no /api prefix).

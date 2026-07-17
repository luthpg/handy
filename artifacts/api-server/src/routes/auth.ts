/**
 * GitHub OAuth routes.
 *
 * Required environment variables:
 *   GITHUB_CLIENT_ID     – your GitHub OAuth App client ID
 *   GITHUB_CLIENT_SECRET – your GitHub OAuth App client secret
 *
 * Set callback URL in your GitHub OAuth App to:
 *   Development:  https://<your-replit-dev-domain>/api/auth/github/callback
 *   Production:   https://<your-fly-app>.fly.dev/api/auth/github/callback
 */
import { Router } from "express";
import { z } from "zod";
import { saveCredentials, getCredentials, clearCredentials } from "../lib/gitService.js";
import { logger } from "../lib/logger.js";

const router = Router();

const CLIENT_ID = process.env["GITHUB_CLIENT_ID"] ?? "";
const CLIENT_SECRET = process.env["GITHUB_CLIENT_SECRET"] ?? "";
const SCOPES = "repo,user:email";

// GET /auth/github → redirect to GitHub
router.get("/auth/github", (_req, res) => {
  if (!CLIENT_ID) {
    return res.status(501).json({ error: "GITHUB_CLIENT_ID not configured" });
  }
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    scope: SCOPES,
    allow_signup: "true",
  });
  res.redirect(`https://github.com/login/oauth/authorize?${params}`);
});

// GET /auth/github/callback
router.get("/auth/github/callback", async (req, res) => {
  const code = req.query.code as string;
  if (!code) return res.status(400).send("Missing code");
  if (!CLIENT_ID || !CLIENT_SECRET) {
    return res.status(501).send("GitHub OAuth not configured");
  }

  try {
    // Exchange code for token
    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, code }),
    });
    const tokenData = (await tokenRes.json()) as { access_token?: string; error?: string };

    if (!tokenData.access_token) {
      logger.error({ error: tokenData.error }, "GitHub OAuth token exchange failed");
      return res.status(400).send(`GitHub OAuth error: ${tokenData.error ?? "unknown"}`);
    }

    const token = tokenData.access_token;

    // Fetch GitHub username
    const userRes = await fetch("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
    });
    const userData = (await userRes.json()) as { login?: string };
    const username = userData.login ?? "github-user";

    await saveCredentials(token, username);
    logger.info({ username }, "GitHub OAuth connected");

    // Redirect back to the IDE (root path)
    res.redirect("/?github=connected");
  } catch (err) {
    logger.error({ err }, "GitHub OAuth callback error");
    res.status(500).send("OAuth error");
  }
});

// GET /auth/status
router.get("/auth/status", async (_req, res) => {
  const { token, username } = await getCredentials();
  res.json({
    githubConnected: !!token,
    githubUsername: username ?? null,
    githubOAuthConfigured: !!CLIENT_ID,
  });
});

// DELETE /auth/github
router.delete("/auth/github", async (_req, res) => {
  await clearCredentials();
  res.json({ ok: true });
});

// POST /auth/github/token  (manual PAT entry — alternative to OAuth)
const TokenSchema = z.object({
  token: z.string().min(1),
  username: z.string().min(1),
});
router.post("/auth/github/token", async (req, res) => {
  try {
    const { token, username } = TokenSchema.parse(req.body);

    // Verify the token works
    const verifyRes = await fetch("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!verifyRes.ok) {
      return res.status(401).json({ error: "Invalid GitHub token" });
    }

    await saveCredentials(token, username);
    res.json({ ok: true, username });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;

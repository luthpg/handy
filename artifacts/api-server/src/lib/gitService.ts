/**
 * Git operations for the IDE workspace.
 * Uses simple-git to run git commands in user-workspace/.
 * GitHub credentials are stored via db.ts (Neon or in-memory).
 */
import { simpleGit, SimpleGit } from "simple-git";
import path from "path";
import { getConfig, setConfig, deleteConfig } from "./db.js";
import { logger } from "./logger.js";

const WORKSPACE_DIR = path.resolve(process.cwd(), "user-workspace");

function git(): SimpleGit {
  return simpleGit(WORKSPACE_DIR);
}

// ── Credentials ─────────────────────────────────────────────────────────────

export async function getCredentials(): Promise<{ token: string | null; username: string | null }> {
  const [token, username] = await Promise.all([
    getConfig("github_token"),
    getConfig("github_username"),
  ]);
  return { token, username };
}

export async function saveCredentials(token: string, username: string): Promise<void> {
  await Promise.all([
    setConfig("github_token", token),
    setConfig("github_username", username),
  ]);
}

export async function clearCredentials(): Promise<void> {
  await Promise.all([
    deleteConfig("github_token"),
    deleteConfig("github_username"),
  ]);
}

/** Injects a GitHub token into an HTTPS URL for authentication. */
function injectToken(url: string, username: string, token: string): string {
  if (url.startsWith("https://github.com/")) {
    return url.replace("https://", `https://${encodeURIComponent(username)}:${encodeURIComponent(token)}@`);
  }
  return url;
}

// ── Repository status ────────────────────────────────────────────────────────

export async function isRepo(): Promise<boolean> {
  try {
    return await git().checkIsRepo();
  } catch {
    return false;
  }
}

export async function getStatus() {
  const g = git();
  const [status, branches] = await Promise.all([
    g.status(),
    g.branch().catch(() => null),
  ]);
  return {
    isRepo: true,
    branch: status.current,
    tracking: status.tracking,
    ahead: status.ahead,
    behind: status.behind,
    staged: status.staged,
    modified: status.modified,
    created: status.created,
    deleted: status.deleted,
    renamed: status.renamed.map((r) => r.to),
    not_added: status.not_added,
    branches: branches?.all ?? [],
  };
}

export async function getLog(limit = 20) {
  const result = await git().log({ maxCount: limit });
  return result.all.map((c) => ({
    hash: c.hash,
    date: c.date,
    message: c.message,
    author: c.author_name,
  }));
}

export async function getDiff(file?: string): Promise<string> {
  const g = git();
  if (file) return g.diff([file]);
  return g.diff();
}

export async function getDiffStaged(): Promise<string> {
  return git().diff(["--staged"]);
}

// ── Mutating operations ──────────────────────────────────────────────────────

export async function gitInit(): Promise<void> {
  const g = git();
  await g.init();
  try {
    await g.raw(["checkout", "-b", "main"]);
  } catch {
    // already on a branch
  }
  logger.info("Initialised git repo in workspace");
}

export async function gitAdd(files: string[]): Promise<void> {
  await git().add(files.length > 0 ? files : ["."]);
}

export async function gitCommit(
  message: string,
  authorName?: string,
  authorEmail?: string,
): Promise<{ hash: string; branch: string | null; message: string }> {
  const g = git();
  if (authorName) await g.addConfig("user.name", authorName, false, "local");
  if (authorEmail) await g.addConfig("user.email", authorEmail, false, "local");
  const result = await g.commit(message);
  return { hash: result.commit, branch: result.branch, message: result.summary.changes + " change(s)" };
}

export async function gitPush(remote = "origin", branch = "main"): Promise<void> {
  const g = git();
  const { token, username } = await getCredentials();

  if (token && username) {
    // Temporarily rewrite the remote URL to include auth, push, then restore
    let originalUrl: string | null = null;
    try {
      originalUrl = (await g.remote(["get-url", remote])).trim();
      const authUrl = injectToken(originalUrl, username, token);
      await g.remote(["set-url", remote, authUrl]);
      await g.push(remote, branch);
    } finally {
      if (originalUrl) {
        await g.remote(["set-url", remote, originalUrl]).catch(() => {});
      }
    }
  } else {
    await g.push(remote, branch);
  }
}

export async function gitPull(remote = "origin", branch = "main"): Promise<void> {
  const g = git();
  const { token, username } = await getCredentials();

  if (token && username) {
    let originalUrl: string | null = null;
    try {
      originalUrl = (await g.remote(["get-url", remote])).trim();
      const authUrl = injectToken(originalUrl, username, token);
      await g.remote(["set-url", remote, authUrl]);
      await g.pull(remote, branch);
    } finally {
      if (originalUrl) {
        await g.remote(["set-url", remote, originalUrl]).catch(() => {});
      }
    }
  } else {
    await g.pull(remote, branch);
  }
}

export async function gitClone(url: string): Promise<void> {
  const { token, username } = await getCredentials();
  let cloneUrl = url;
  if (token && username) {
    cloneUrl = injectToken(url, username, token);
  }
  // Clone into workspace directory directly (uses "." as target)
  await simpleGit(WORKSPACE_DIR).clone(cloneUrl, WORKSPACE_DIR, ["--no-local"]).catch(async () => {
    // If workspace is not empty, clone into a subdirectory
    const name = url.split("/").pop()?.replace(/\.git$/, "") ?? "repo";
    await simpleGit().clone(cloneUrl, path.join(WORKSPACE_DIR, name));
  });
}

export async function gitCheckout(branch: string, create: boolean): Promise<void> {
  const g = git();
  if (create) {
    await g.checkoutLocalBranch(branch);
  } else {
    await g.checkout(branch);
  }
}

export async function gitAddRemote(name: string, url: string): Promise<void> {
  await git().addRemote(name, url);
}

export async function gitSetRemote(name: string, url: string): Promise<void> {
  const g = git();
  try {
    await g.remote(["set-url", name, url]);
  } catch {
    await g.addRemote(name, url);
  }
}

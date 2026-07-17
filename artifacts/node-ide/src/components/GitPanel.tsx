import { useState, useEffect, useCallback } from 'react';
import {
  GitBranch, GitCommit, Upload, Download, RefreshCw,
  GitMerge, Check, X, Plus, Settings, ExternalLink, AlertCircle
} from 'lucide-react';

const API = '/api';

// ── Types ────────────────────────────────────────────────────────────────────

interface GitStatus {
  isRepo: boolean;
  branch?: string;
  tracking?: string;
  ahead?: number;
  behind?: number;
  staged?: string[];
  modified?: string[];
  created?: string[];
  deleted?: string[];
  not_added?: string[];
}

interface GitCommitEntry {
  hash: string;
  date: string;
  message: string;
  author: string;
}

interface AuthStatus {
  githubConnected: boolean;
  githubUsername: string | null;
  githubOAuthConfigured: boolean;
}

// ── Fetch helpers ─────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusBadge({ count, label, color }: { count: number; label: string; color: string }) {
  if (count === 0) return null;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded ${color} font-mono`}>
      {count} {label}
    </span>
  );
}

function FileChip({ path, type }: { path: string; type: 'staged' | 'modified' | 'new' | 'deleted' }) {
  const colors: Record<string, string> = {
    staged: 'text-green-400',
    modified: 'text-yellow-400',
    new: 'text-blue-400',
    deleted: 'text-red-400',
  };
  const letters: Record<string, string> = { staged: 'S', modified: 'M', new: 'A', deleted: 'D' };
  return (
    <div className="flex items-center gap-2 px-3 py-1 hover:bg-secondary/40 rounded text-xs group cursor-default">
      <span className={`font-bold shrink-0 ${colors[type]}`}>{letters[type]}</span>
      <span className="text-foreground/80 truncate font-mono">{path}</span>
    </div>
  );
}

// ── Main GitPanel ─────────────────────────────────────────────────────────────

export function GitPanel() {
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [log, setLog] = useState<GitCommitEntry[]>([]);
  const [auth, setAuth] = useState<AuthStatus | null>(null);

  const [commitMsg, setCommitMsg] = useState('');
  const [remoteUrl, setRemoteUrl] = useState('');
  const [showRemote, setShowRemote] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [showPat, setShowPat] = useState(false);
  const [patInput, setPatInput] = useState('');
  const [patUsername, setPatUsername] = useState('');

  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  const setOp = (key: string, v: boolean) => setLoading(l => ({ ...l, [key]: v }));

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const [s, a] = await Promise.all([
        apiFetch<GitStatus>('/git/status'),
        apiFetch<AuthStatus>('/auth/status'),
      ]);
      setStatus(s);
      setAuth(a);
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const loadLog = useCallback(async () => {
    const entries = await apiFetch<GitCommitEntry[]>('/git/log?limit=15');
    setLog(entries);
    setShowLog(true);
  }, []);

  // ── Git operations ────────────────────────────────────────────────────────

  const op = async (key: string, fn: () => Promise<void>) => {
    setOp(key, true);
    setError(null);
    try {
      await fn();
      await refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setOp(key, false);
    }
  };

  const handleInit = () => op('init', () => apiFetch('/git/init', { method: 'POST' }));

  const handleStageAll = () =>
    op('add', () => apiFetch('/git/add', { method: 'POST', body: JSON.stringify({ files: [] }) }));

  const handleCommit = () => {
    if (!commitMsg.trim()) return;
    op('commit', async () => {
      await apiFetch('/git/commit', { method: 'POST', body: JSON.stringify({ message: commitMsg }) });
      setCommitMsg('');
    });
  };

  const handlePush = () => op('push', () => apiFetch('/git/push', { method: 'POST', body: JSON.stringify({}) }));
  const handlePull = () => op('pull', () => apiFetch('/git/pull', { method: 'POST', body: JSON.stringify({}) }));

  const handleSetRemote = () =>
    op('remote', async () => {
      await apiFetch('/git/remote', {
        method: 'POST',
        body: JSON.stringify({ name: 'origin', url: remoteUrl, action: 'set' }),
      });
      setShowRemote(false);
    });

  const handlePatSave = () =>
    op('pat', async () => {
      await apiFetch('/auth/github/token', {
        method: 'POST',
        body: JSON.stringify({ token: patInput, username: patUsername }),
      });
      setPatInput('');
      setPatUsername('');
      setShowPat(false);
    });

  const handleDisconnect = () =>
    op('disconnect', () => apiFetch('/auth/github', { method: 'DELETE' }));

  // ── Render ────────────────────────────────────────────────────────────────

  const spin = (key: string) => loading[key];

  const allChanges = [
    ...(status?.staged?.map(f => ({ path: f, type: 'staged' as const })) ?? []),
    ...(status?.modified?.map(f => ({ path: f, type: 'modified' as const })) ?? []),
    ...(status?.created?.map(f => ({ path: f, type: 'new' as const })) ?? []),
    ...(status?.deleted?.map(f => ({ path: f, type: 'deleted' as const })) ?? []),
    ...(status?.not_added?.map(f => ({ path: f, type: 'new' as const })) ?? []),
  ];

  const totalChanges = allChanges.length;

  return (
    <div className="flex flex-col h-full overflow-y-auto text-sm">
      {/* Header */}
      <div className="h-10 px-3 flex items-center justify-between border-b border-border shrink-0 select-none">
        <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground uppercase tracking-wider">
          <GitBranch size={13} />
          <span>Source Control</span>
        </div>
        <button
          onClick={refresh}
          className="p-1 hover:bg-secondary rounded text-muted-foreground hover:text-foreground transition-colors"
          title="Refresh"
        >
          <RefreshCw size={13} className={spin('refresh') ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="flex-1 flex flex-col gap-0 overflow-y-auto">
        {/* Error */}
        {error && (
          <div className="mx-3 mt-2 p-2 bg-destructive/10 border border-destructive/30 rounded text-xs text-destructive flex gap-2">
            <AlertCircle size={13} className="shrink-0 mt-0.5" />
            <span className="break-all">{error}</span>
          </div>
        )}

        {/* Not a git repo */}
        {status && !status.isRepo && (
          <div className="p-4 text-center">
            <GitCommit size={32} className="mx-auto mb-3 text-muted-foreground/40" />
            <p className="text-xs text-muted-foreground mb-3">Not a git repository</p>
            <button
              onClick={handleInit}
              disabled={spin('init')}
              className="px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-60"
            >
              {spin('init') ? 'Initialising…' : 'Init Repository'}
            </button>
          </div>
        )}

        {/* Repo UI */}
        {status?.isRepo && (
          <>
            {/* Branch & sync info */}
            <div className="px-3 py-2 border-b border-border flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground truncate">
                <GitBranch size={12} />
                <span className="text-foreground font-semibold truncate">{status.branch ?? 'HEAD'}</span>
                {status.tracking && (
                  <span className="text-muted-foreground/60 truncate">→ {status.tracking}</span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {(status.ahead ?? 0) > 0 && (
                  <span className="text-[10px] bg-primary/20 text-primary px-1 rounded">↑{status.ahead}</span>
                )}
                {(status.behind ?? 0) > 0 && (
                  <span className="text-[10px] bg-yellow-500/20 text-yellow-400 px-1 rounded">↓{status.behind}</span>
                )}
              </div>
            </div>

            {/* Commit area */}
            <div className="px-3 py-2 border-b border-border flex flex-col gap-2">
              <textarea
                value={commitMsg}
                onChange={(e) => setCommitMsg(e.target.value)}
                placeholder="Commit message…"
                className="w-full resize-none bg-input border border-border rounded px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-ring min-h-[56px] font-mono placeholder:text-muted-foreground/50"
                rows={3}
              />
              <div className="flex gap-2">
                <button
                  onClick={handleStageAll}
                  disabled={spin('add') || totalChanges === 0}
                  className="flex-1 py-1.5 text-xs bg-secondary text-foreground rounded hover:bg-secondary/80 disabled:opacity-50 flex items-center justify-center gap-1"
                  title="Stage all changes"
                >
                  <Plus size={12} />
                  Stage All
                </button>
                <button
                  onClick={handleCommit}
                  disabled={spin('commit') || !commitMsg.trim()}
                  className="flex-1 py-1.5 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-1"
                >
                  <Check size={12} />
                  {spin('commit') ? 'Committing…' : 'Commit'}
                </button>
              </div>
            </div>

            {/* Push / Pull */}
            <div className="px-3 py-2 border-b border-border flex gap-2">
              <button
                onClick={handlePull}
                disabled={spin('pull')}
                className="flex-1 py-1.5 text-xs border border-border rounded hover:bg-secondary disabled:opacity-50 flex items-center justify-center gap-1 text-muted-foreground hover:text-foreground"
              >
                <Download size={12} />
                {spin('pull') ? 'Pulling…' : 'Pull'}
              </button>
              <button
                onClick={handlePush}
                disabled={spin('push')}
                className="flex-1 py-1.5 text-xs border border-border rounded hover:bg-secondary disabled:opacity-50 flex items-center justify-center gap-1 text-muted-foreground hover:text-foreground"
              >
                <Upload size={12} />
                {spin('push') ? 'Pushing…' : 'Push'}
              </button>
            </div>

            {/* Changes list */}
            {totalChanges > 0 ? (
              <div className="py-2">
                <div className="px-3 py-1 flex items-center gap-2 text-[10px] text-muted-foreground uppercase tracking-wider font-bold">
                  Changes
                  <StatusBadge count={totalChanges} label="" color="bg-primary/20 text-primary" />
                </div>
                {allChanges.map((f, i) => (
                  <FileChip key={i} path={f.path} type={f.type} />
                ))}
              </div>
            ) : (
              <div className="px-3 py-3 text-xs text-muted-foreground/60 italic">
                No changes
              </div>
            )}

            {/* Set Remote */}
            <div className="px-3 py-2 border-t border-border">
              <button
                onClick={() => setShowRemote(!showRemote)}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                <GitMerge size={12} />
                Set remote URL
              </button>
              {showRemote && (
                <div className="mt-2 flex gap-2">
                  <input
                    value={remoteUrl}
                    onChange={(e) => setRemoteUrl(e.target.value)}
                    placeholder="https://github.com/user/repo.git"
                    className="flex-1 bg-input border border-border rounded px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-ring font-mono placeholder:text-muted-foreground/40"
                  />
                  <button
                    onClick={handleSetRemote}
                    disabled={spin('remote') || !remoteUrl.trim()}
                    className="px-2 py-1 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50"
                  >
                    Save
                  </button>
                </div>
              )}
            </div>

            {/* Commit log */}
            <div className="px-3 py-2 border-t border-border">
              <button
                onClick={showLog ? () => setShowLog(false) : loadLog}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                <GitCommit size={12} />
                {showLog ? 'Hide log' : 'Show commit log'}
              </button>
              {showLog && log.length > 0 && (
                <div className="mt-2 flex flex-col gap-1">
                  {log.map((c) => (
                    <div key={c.hash} className="flex flex-col gap-0.5 py-1.5 border-b border-border/50 last:border-0">
                      <span className="text-xs text-foreground/90 truncate">{c.message}</span>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                        <span className="font-mono">{c.hash.slice(0, 7)}</span>
                        <span>{c.author}</span>
                        <span>{new Date(c.date).toLocaleDateString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* GitHub Auth section */}
        {auth && (
          <div className="px-3 py-3 border-t border-border mt-auto">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold mb-2 flex items-center gap-1">
              <Settings size={10} />
              GitHub
            </div>
            {auth.githubConnected ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs text-green-400">
                  <Check size={12} />
                  <span>{auth.githubUsername}</span>
                </div>
                <button
                  onClick={handleDisconnect}
                  className="text-[10px] text-muted-foreground hover:text-destructive flex items-center gap-1"
                >
                  <X size={10} />
                  Disconnect
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {auth.githubOAuthConfigured && (
                  <a
                    href="/api/auth/github"
                    className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs bg-foreground text-background rounded hover:opacity-90"
                  >
                    <ExternalLink size={12} />
                    Connect GitHub (OAuth)
                  </a>
                )}
                <button
                  onClick={() => setShowPat(!showPat)}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  {showPat ? 'Cancel' : 'Enter Personal Access Token'}
                </button>
                {showPat && (
                  <div className="flex flex-col gap-1.5 mt-1">
                    <input
                      value={patUsername}
                      onChange={(e) => setPatUsername(e.target.value)}
                      placeholder="GitHub username"
                      className="w-full bg-input border border-border rounded px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-ring"
                    />
                    <input
                      type="password"
                      value={patInput}
                      onChange={(e) => setPatInput(e.target.value)}
                      placeholder="ghp_xxxxxxxxxxxx"
                      className="w-full bg-input border border-border rounded px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-ring font-mono"
                    />
                    <button
                      onClick={handlePatSave}
                      disabled={spin('pat') || !patInput || !patUsername}
                      className="px-3 py-1 text-xs bg-primary text-primary-foreground rounded disabled:opacity-50"
                    >
                      {spin('pat') ? 'Saving…' : 'Save Token'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

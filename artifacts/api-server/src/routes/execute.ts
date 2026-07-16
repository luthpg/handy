import { Router, type IRouter } from "express";
import { spawn } from "child_process";
import path from "path";
import fs from "fs/promises";
import { ExecuteCodeBody } from "@workspace/api-zod";

const router: IRouter = Router();

const WORKSPACE_DIR = path.resolve(process.cwd(), "user-workspace");
const EXECUTION_TIMEOUT_MS = 15000;

function safePath(filePath: string): string {
  const resolved = path.resolve(WORKSPACE_DIR, filePath);
  if (!resolved.startsWith(WORKSPACE_DIR + path.sep) && resolved !== WORKSPACE_DIR) {
    throw new Error("Invalid path");
  }
  return resolved;
}

// POST /execute
router.post("/execute", async (req, res) => {
  const parsed = ExecuteCodeBody.parse(req.body);
  let absPath: string;
  try {
    absPath = safePath(parsed.filePath);
  } catch {
    res.status(400).json({ error: "Invalid file path" });
    return;
  }

  try {
    await fs.access(absPath);
  } catch {
    res.status(404).json({ error: "File not found" });
    return;
  }

  const startTime = Date.now();

  const result = await new Promise<{
    stdout: string;
    stderr: string;
    exitCode: number;
  }>((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;

    const child = spawn("node", [absPath], {
      cwd: WORKSPACE_DIR,
      env: {
        ...process.env,
        NODE_PATH: path.join(WORKSPACE_DIR, "node_modules"),
      },
      timeout: EXECUTION_TIMEOUT_MS,
    });

    if (parsed.stdin) {
      child.stdin.write(parsed.stdin);
      child.stdin.end();
    }

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
      // Cap output to 100KB
      if (stdout.length > 100_000) {
        stdout = stdout.slice(0, 100_000) + "\n[output truncated]";
        child.kill();
      }
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
      if (stderr.length > 100_000) {
        stderr = stderr.slice(0, 100_000) + "\n[output truncated]";
        child.kill();
      }
    });

    child.on("close", (code, signal) => {
      if (settled) return;
      settled = true;
      let exitCode = code ?? 1;
      if (signal === "SIGTERM" || signal === "SIGKILL") {
        stderr += `\n[Process killed: timeout after ${EXECUTION_TIMEOUT_MS / 1000}s]`;
        exitCode = 124;
      }
      resolve({ stdout, stderr, exitCode });
    });

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      resolve({ stdout, stderr: stderr + "\n" + err.message, exitCode: 1 });
    });

    // Fallback timeout
    setTimeout(() => {
      if (!settled) {
        settled = true;
        try { child.kill("SIGKILL"); } catch {}
        resolve({
          stdout,
          stderr: stderr + `\n[Timed out after ${EXECUTION_TIMEOUT_MS / 1000}s]`,
          exitCode: 124,
        });
      }
    }, EXECUTION_TIMEOUT_MS + 1000);
  });

  res.json({
    ...result,
    durationMs: Date.now() - startTime,
  });
});

export default router;

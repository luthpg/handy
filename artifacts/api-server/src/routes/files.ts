import { Router, type IRouter } from "express";
import fs from "fs/promises";
import { Stats } from "fs";
import path from "path";
import {
  CreateFileBody,
  UpdateFileBody,
  RenameFileBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

const WORKSPACE_DIR = path.resolve(process.cwd(), "user-workspace");

async function ensureWorkspaceDir() {
  await fs.mkdir(WORKSPACE_DIR, { recursive: true });
}

function safePath(filePath: string): string {
  // Only allow simple filenames (no directory traversal)
  if (!filePath || /[/\\]/.test(filePath) || filePath === ".." || filePath.startsWith(".")) {
    throw new Error("Invalid path");
  }
  return path.resolve(WORKSPACE_DIR, filePath);
}

function toEntry(filePath: string, stat: Stats) {
  return {
    path: path.basename(filePath),
    name: path.basename(filePath),
    size: Number(stat.size),
    updatedAt: stat.mtime.toISOString(),
  };
}

// GET /files
router.get("/files", async (_req, res) => {
  await ensureWorkspaceDir();

  const entries = await fs.readdir(WORKSPACE_DIR).catch(() => [] as string[]);
  if (entries.length === 0) {
    const samplePath = path.join(WORKSPACE_DIR, "hello.js");
    await fs.writeFile(
      samplePath,
      `// Hello from Node.js IDE!\nconsole.log("Hello, world!");\nconsole.log("Current time:", new Date().toISOString());\n`,
    );
  }

  const allEntries = await fs.readdir(WORKSPACE_DIR).catch(() => [] as string[]);
  const files: Array<{ path: string; name: string; size: number; updatedAt: string }> = [];
  for (const name of allEntries) {
    const full = path.join(WORKSPACE_DIR, name);
    try {
      const stat = await fs.stat(full);
      if (stat.isFile()) {
        files.push(toEntry(full, stat));
      }
    } catch {
      // skip
    }
  }
  res.json(files);
});

// POST /files
router.post("/files", async (req, res) => {
  await ensureWorkspaceDir();
  const parsed = CreateFileBody.parse(req.body);
  let absPath: string;
  try {
    absPath = safePath(parsed.path);
  } catch {
    res.status(400).json({ error: "Invalid file path" });
    return;
  }

  try {
    await fs.access(absPath);
    res.status(409).json({ error: "File already exists" });
    return;
  } catch {
    // does not exist — good
  }

  await fs.writeFile(absPath, parsed.content ?? "");
  const stat = await fs.stat(absPath);
  res.status(201).json(toEntry(absPath, stat));
});

// POST /files/:filePath/rename  (must be before GET /files/:filePath)
router.post("/files/:filePath/rename", async (req, res) => {
  let absPath: string;
  try {
    absPath = safePath(req.params.filePath);
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

  const parsed = RenameFileBody.parse(req.body);
  let newAbsPath: string;
  try {
    newAbsPath = safePath(parsed.newPath);
  } catch {
    res.status(400).json({ error: "Invalid destination path" });
    return;
  }

  try {
    await fs.access(newAbsPath);
    res.status(409).json({ error: "Destination already exists" });
    return;
  } catch {
    // good
  }

  await fs.rename(absPath, newAbsPath);
  const stat = await fs.stat(newAbsPath);
  res.json(toEntry(newAbsPath, stat));
});

// GET /files/:filePath
router.get("/files/:filePath", async (req, res) => {
  let absPath: string;
  try {
    absPath = safePath(req.params.filePath);
  } catch {
    res.status(400).json({ error: "Invalid file path" });
    return;
  }

  try {
    const content = await fs.readFile(absPath, "utf-8");
    res.json({ path: req.params.filePath, content });
  } catch {
    res.status(404).json({ error: "File not found" });
  }
});

// PUT /files/:filePath
router.put("/files/:filePath", async (req, res) => {
  let absPath: string;
  try {
    absPath = safePath(req.params.filePath);
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

  const parsed = UpdateFileBody.parse(req.body);
  await fs.writeFile(absPath, parsed.content);
  const stat = await fs.stat(absPath);
  res.json(toEntry(absPath, stat));
});

// DELETE /files/:filePath
router.delete("/files/:filePath", async (req, res) => {
  let absPath: string;
  try {
    absPath = safePath(req.params.filePath);
  } catch {
    res.status(400).json({ error: "Invalid file path" });
    return;
  }

  try {
    await fs.unlink(absPath);
    res.json({ path: req.params.filePath, deleted: true });
  } catch {
    res.status(404).json({ error: "File not found" });
  }
});

export default router;

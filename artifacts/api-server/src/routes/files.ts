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
  if (!filePath) {
    throw new Error("Invalid path");
  }
  const resolved = path.resolve(WORKSPACE_DIR, filePath);
  // 解決された絶対パスが WORKSPACE_DIR の中にあることを保証（ディレクトリトラバーサル対策）
  if (!resolved.startsWith(WORKSPACE_DIR + path.sep) && resolved !== WORKSPACE_DIR) {
    throw new Error("Invalid path");
  }
  return resolved;
}

function toEntry(filePath: string, stat: Stats) {
  return {
    path: path.basename(filePath),
    name: path.basename(filePath),
    size: Number(stat.size),
    updatedAt: stat.mtime.toISOString(),
  };
}

// ディレクトリ階層を考慮して相対パスを含めたアセット一覧を返す
async function getFilesRecursively(dir: string, baseDir: string): Promise<any[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: any[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(baseDir, fullPath);

    if (entry.isFile()) {
      const stat = await fs.stat(fullPath);
      files.push({
        path: relativePath,
        name: entry.name,
        size: Number(stat.size),
        updatedAt: stat.mtime.toISOString(),
      });
    } else if (entry.isDirectory() && entry.name !== "node_modules" && !entry.name.startsWith(".")) {
      // サブディレクトリ内も再帰的に走査（不要なシステムフォルダは除外）
      const subFiles = await getFilesRecursively(fullPath, baseDir);
      files.push(...subFiles);
    }
  }
  return files;
}

// GET /files
router.get("/files", async (_req, res) => {
  await ensureWorkspaceDir();
  try {
    const files = await getFilesRecursively(WORKSPACE_DIR, WORKSPACE_DIR);
    res.json(files);
  } catch (err) {
    res.status(500).json({ error: "Failed to read workspace" });
  }
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

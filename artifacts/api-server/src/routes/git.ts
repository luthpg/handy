import { Router } from "express";
import { z } from "zod";
import {
  isRepo,
  getStatus,
  getLog,
  getDiff,
  getDiffStaged,
  gitInit,
  gitAdd,
  gitCommit,
  gitPush,
  gitPull,
  gitClone,
  gitCheckout,
  gitAddRemote,
  gitSetRemote,
} from "../lib/gitService.js";

const router = Router();

function wrap(fn: (req: any, res: any) => Promise<void>) {
  return async (req: any, res: any) => {
    try {
      await fn(req, res);
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      res.status(500).json({ error: msg });
    }
  };
}

// GET /git/status
router.get("/git/status", wrap(async (_req, res) => {
  const repoExists = await isRepo();
  if (!repoExists) {
    return res.json({ isRepo: false });
  }
  const status = await getStatus();
  res.json(status);
}));

// GET /git/log
router.get("/git/log", wrap(async (req, res) => {
  const limit = Number(req.query.limit) || 20;
  const repoExists = await isRepo();
  if (!repoExists) return res.json([]);
  const log = await getLog(limit);
  res.json(log);
}));

// GET /git/diff
router.get("/git/diff", wrap(async (req, res) => {
  const file = req.query.file as string | undefined;
  const staged = req.query.staged === "true";
  const repoExists = await isRepo();
  if (!repoExists) return res.json({ diff: "" });
  const diff = staged ? await getDiffStaged() : await getDiff(file);
  res.json({ diff });
}));

// POST /git/init
router.post("/git/init", wrap(async (_req, res) => {
  await gitInit();
  res.json({ ok: true });
}));

// POST /git/add
const AddSchema = z.object({
  files: z.array(z.string()).default([]),
});
router.post("/git/add", wrap(async (req, res) => {
  const { files } = AddSchema.parse(req.body);
  await gitAdd(files);
  res.json({ ok: true });
}));

// POST /git/commit
const CommitSchema = z.object({
  message: z.string().min(1),
  authorName: z.string().optional(),
  authorEmail: z.string().optional(),
});
router.post("/git/commit", wrap(async (req, res) => {
  const { message, authorName, authorEmail } = CommitSchema.parse(req.body);
  const result = await gitCommit(message, authorName, authorEmail);
  res.json(result);
}));

// POST /git/push
const PushSchema = z.object({
  remote: z.string().default("origin"),
  branch: z.string().default("main"),
});
router.post("/git/push", wrap(async (req, res) => {
  const { remote, branch } = PushSchema.parse(req.body);
  await gitPush(remote, branch);
  res.json({ ok: true });
}));

// POST /git/pull
const PullSchema = z.object({
  remote: z.string().default("origin"),
  branch: z.string().default("main"),
});
router.post("/git/pull", wrap(async (req, res) => {
  const { remote, branch } = PullSchema.parse(req.body);
  await gitPull(remote, branch);
  res.json({ ok: true });
}));

// POST /git/clone
const CloneSchema = z.object({
  url: z.string().url(),
});
router.post("/git/clone", wrap(async (req, res) => {
  const { url } = CloneSchema.parse(req.body);
  await gitClone(url);
  res.json({ ok: true });
}));

// POST /git/checkout
const CheckoutSchema = z.object({
  branch: z.string().min(1),
  create: z.boolean().default(false),
});
router.post("/git/checkout", wrap(async (req, res) => {
  const { branch, create } = CheckoutSchema.parse(req.body);
  await gitCheckout(branch, create);
  res.json({ ok: true });
}));

// POST /git/remote
const RemoteSchema = z.object({
  name: z.string().default("origin"),
  url: z.string(),
  action: z.enum(["add", "set"]).default("set"),
});
router.post("/git/remote", wrap(async (req, res) => {
  const { name, url, action } = RemoteSchema.parse(req.body);
  if (action === "add") {
    await gitAddRemote(name, url);
  } else {
    await gitSetRemote(name, url);
  }
  res.json({ ok: true });
}));

export default router;

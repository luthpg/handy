import { Router, type IRouter } from "express";
import ts from "typescript";
import { GetTsCompletionsBody, GetTsDiagnosticsBody } from "@workspace/api-zod";
import { tsService } from "../lib/tsService.js";

const router: IRouter = Router();

// POST /ts/completions
router.post("/ts/completions", (req, res) => {
  const { filePath, content, position } = GetTsCompletionsBody.parse(req.body);

  let completions: ReturnType<typeof tsService.getCompletions>;
  try {
    completions = tsService.getCompletions(filePath, content, position);
  } catch {
    res.json({ items: [] });
    return;
  }

  if (!completions) {
    res.json({ items: [] });
    return;
  }

  const items = completions.entries.slice(0, 200).map((e) => ({
    label: e.name,
    kind: e.kind as string,
    sortText: e.sortText,
    detail: null as string | null,
    documentation: null as string | null,
  }));

  res.json({ items });
});

// POST /ts/diagnostics
router.post("/ts/diagnostics", (req, res) => {
  const { filePath, content } = GetTsDiagnosticsBody.parse(req.body);

  let diags: ReturnType<typeof tsService.getDiagnostics>;
  try {
    diags = tsService.getDiagnostics(filePath, content);
  } catch {
    res.json({ items: [] });
    return;
  }

  const items = diags
    .filter((d) => d.start !== undefined && d.length !== undefined)
    .map((d) => ({
      from: d.start as number,
      to: (d.start as number) + (d.length as number),
      severity: d.category === ts.DiagnosticCategory.Error
        ? "error"
        : d.category === ts.DiagnosticCategory.Warning
        ? "warning"
        : "info",
      message: ts.flattenDiagnosticMessageText(d.messageText, "\n"),
    }));

  res.json({ items });
});

export default router;

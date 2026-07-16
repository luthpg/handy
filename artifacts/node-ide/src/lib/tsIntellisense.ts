import {
  autocompletion,
  type CompletionContext,
  type CompletionResult,
  type Completion,
} from "@codemirror/autocomplete";
import { linter, type Diagnostic } from "@codemirror/lint";
import type { EditorView } from "@codemirror/view";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// Map TypeScript ScriptElementKind to CodeMirror completion type
function kindToType(kind: string): Completion["type"] {
  if (kind.includes("function") || kind.includes("method")) return "function";
  if (kind.includes("property") || kind.includes("getter") || kind.includes("setter")) return "property";
  if (kind.includes("class")) return "class";
  if (kind.includes("interface") || kind.includes("type")) return "interface";
  if (kind.includes("module") || kind.includes("namespace")) return "namespace";
  if (kind.includes("keyword")) return "keyword";
  if (kind.includes("enum")) return "enum";
  return "variable";
}

/**
 * Creates CodeMirror 6 extensions for TypeScript IntelliSense.
 * @param getFilePath  A function that returns the currently open file path.
 *                     Using a getter avoids stale closures without recreating extensions.
 */
export function createTsExtensions(getFilePath: () => string) {
  // ---- Autocomplete ----
  const tsCompletionSource = async (
    ctx: CompletionContext,
  ): Promise<CompletionResult | null> => {
    const filePath = getFilePath();
    if (!filePath) return null;

    // Trigger on: word chars, dot member access, or explicit request
    const word = ctx.matchBefore(/[\w$]+/);
    const dotBefore = ctx.matchBefore(/\.\s*[\w$]*/);
    if (!word && !dotBefore && !ctx.explicit) return null;

    const content = ctx.state.doc.toString();
    const position = ctx.pos;

    try {
      const res = await fetch(`${BASE}/api/ts/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filePath, content, position }),
        signal: AbortSignal.timeout(4000),
      });
      if (!res.ok) return null;

      const data = (await res.json()) as {
        items: Array<{ label: string; kind: string; sortText: string }>;
      };
      if (!data.items.length) return null;

      // Start of the current word token
      const from = word ? word.from : position;

      return {
        from,
        options: data.items.map((item) => ({
          label: item.label,
          type: kindToType(item.kind),
          // Boost items whose sortText starts with digits (TypeScript surfaces these first)
          boost: /^[0-9]/.test(item.sortText) ? 1 : 0,
        })),
        validFor: /^[\w$]*$/,
      };
    } catch {
      return null;
    }
  };

  // ---- Linter ----
  const tsDiagnosticSource = async (view: EditorView): Promise<Diagnostic[]> => {
    const filePath = getFilePath();
    if (!filePath) return [];

    const content = view.state.doc.toString();

    try {
      const res = await fetch(`${BASE}/api/ts/diagnostics`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filePath, content }),
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) return [];

      const data = (await res.json()) as {
        items: Array<{
          from: number;
          to: number;
          severity: string;
          message: string;
        }>;
      };
      const docLen = view.state.doc.length;

      return data.items.map((item) => ({
        from: Math.max(0, Math.min(item.from, docLen)),
        to: Math.max(0, Math.min(item.to, docLen)),
        severity: (item.severity as "error" | "warning" | "info") || "error",
        message: item.message,
      }));
    } catch {
      return [];
    }
  };

  return [
    autocompletion({
      override: [tsCompletionSource],
      maxRenderedOptions: 60,
      activateOnTyping: true,
      closeOnBlur: false,
    }),
    linter(tsDiagnosticSource, { delay: 900 }),
  ];
}

import ts from "typescript";
import path from "path";
import { createRequire } from "module";

const _require = createRequire(import.meta.url);
const WORKSPACE_DIR = path.resolve(process.cwd(), "user-workspace");

// Find @types/node directory (provides Node.js built-in type definitions)
function findTypesNodeDir(): string {
  try {
    const pkg = _require.resolve("@types/node/package.json");
    return path.dirname(pkg);
  } catch {
    return "";
  }
}

// Find TypeScript's own lib directory (lib.es2022.d.ts etc.)
function findTsLibDir(): string {
  try {
    const tsMain = _require.resolve("typescript");
    return path.dirname(tsMain);
  } catch {
    return path.dirname(ts.sys.getExecutingFilePath());
  }
}

const TYPES_NODE_DIR = findTypesNodeDir();
const TS_LIB_DIR = findTsLibDir();

// Collect @types/node .d.ts files once at startup
let typeFiles: string[] = [];
if (TYPES_NODE_DIR) {
  try {
    typeFiles = ts.sys.readDirectory(TYPES_NODE_DIR, [".d.ts"], [], []);
  } catch {}
}

// Shared document registry (reduces memory when multiple files are tracked)
const registry = ts.createDocumentRegistry();

interface CacheEntry {
  service: ts.LanguageService;
  content: string;
  version: number;
}

class TSService {
  private cache = new Map<string, CacheEntry>();

  private absPath(filePath: string): string {
    return path.resolve(WORKSPACE_DIR, filePath);
  }

  private getOrCreate(filePath: string, content: string): CacheEntry {
    let entry = this.cache.get(filePath);
    if (!entry) {
      entry = this.createEntry(filePath, content);
      this.cache.set(filePath, entry);
    } else if (entry.content !== content) {
      entry.content = content;
      entry.version++;
    }
    return entry;
  }

  private createEntry(filePath: string, initialContent: string): CacheEntry {
    const abs = this.absPath(filePath);
    const entry: CacheEntry = { content: initialContent, version: 0, service: null as unknown as ts.LanguageService };

    const host: ts.LanguageServiceHost = {
      getScriptFileNames: () => [abs, ...typeFiles],
      getScriptVersion: (fn) => (fn === abs ? String(entry.version) : "1"),
      getScriptSnapshot: (fn) => {
        if (fn === abs) return ts.ScriptSnapshot.fromString(entry.content);
        const text = ts.sys.readFile(fn);
        return text !== undefined ? ts.ScriptSnapshot.fromString(text) : undefined;
      },
      getCurrentDirectory: () => WORKSPACE_DIR,
      getCompilationSettings: (): ts.CompilerOptions => ({
        allowJs: true,
        checkJs: true,
        strict: false,
        noImplicitAny: false,
        noEmit: true,
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
        moduleResolution: ts.ModuleResolutionKind.Node10,
      }),
      getDefaultLibFileName: (options) =>
        path.join(TS_LIB_DIR, ts.getDefaultLibFileName(options)),
      fileExists: ts.sys.fileExists,
      readFile: ts.sys.readFile,
      readDirectory: ts.sys.readDirectory,
      directoryExists: ts.sys.directoryExists,
      getDirectories: ts.sys.getDirectories,
    };

    entry.service = ts.createLanguageService(host, registry);
    return entry;
  }

  getCompletions(filePath: string, content: string, position: number) {
    const entry = this.getOrCreate(filePath, content);
    return entry.service.getCompletionsAtPosition(this.absPath(filePath), position, {
      includeCompletionsWithInsertText: true,
      includeCompletionsForModuleExports: true,
    });
  }

  getDiagnostics(filePath: string, content: string): ts.Diagnostic[] {
    const entry = this.getOrCreate(filePath, content);
    const abs = this.absPath(filePath);
    return [
      ...entry.service.getSyntacticDiagnostics(abs),
      ...entry.service.getSemanticDiagnostics(abs),
    ] as ts.Diagnostic[];
  }
}

export const tsService = new TSService();

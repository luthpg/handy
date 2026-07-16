import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { oneDark } from '@codemirror/theme-one-dark';
import { createTsExtensions } from '@/lib/tsIntellisense';
import { Play, Trash2, Edit2, Terminal, Menu, X, File as FileIcon, FilePlus, Check } from 'lucide-react';
import { useListFiles, getListFilesQueryKey, useReadFile, getReadFileQueryKey, useCreateFile, useUpdateFile, useDeleteFile, useRenameFile } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import XTerminal, { type XTerminalHandle } from '@/components/XTerminal';

export function IDE() {
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [terminalHeight, setTerminalHeight] = useState(240);
  const [isTerminalVisible, setIsTerminalVisible] = useState(true);
  const terminalRef = useRef<XTerminalHandle>(null);
  
  const queryClient = useQueryClient();
  
  // Queries
  const { data: files = [], isLoading: loadingFiles } = useListFiles({ query: { queryKey: getListFilesQueryKey() } });
  
  // Handlers
  const handleFileSelect = useCallback((path: string) => {
    setActiveFile(path);
    if (window.innerWidth < 768) {
      setSidebarOpen(false); // auto-close on mobile
    }
  }, []);

  const sortedFiles = useMemo(() => {
    return [...files].sort((a, b) => a.path.localeCompare(b.path));
  }, [files]);

  return (
    <div className="h-[100dvh] w-full flex flex-col bg-background text-foreground overflow-hidden">
      {/* Top Header */}
      <header className="h-12 border-b border-border flex items-center px-3 justify-between shrink-0 bg-card select-none">
        <div className="flex items-center gap-3 overflow-hidden">
          <button 
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1.5 -ml-1.5 hover:bg-secondary rounded text-muted-foreground hover:text-foreground transition-colors"
          >
            {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
          
          <div className="flex items-center text-sm font-mono truncate">
            {activeFile ? (
              <>
                <span className="text-muted-foreground mr-2">~/</span>
                <span className="text-accent truncate font-medium">{activeFile}</span>
              </>
            ) : (
              <span className="text-muted-foreground italic">No file open</span>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {activeFile && (activeFile.endsWith('.js') || activeFile.endsWith('.ts')) && (
            <RunButton
              filePath={activeFile}
              onRun={(cmd) => {
                setIsTerminalVisible(true);
                terminalRef.current?.send(cmd);
              }}
            />
          )}
        </div>
      </header>

      {/* Main Workspace */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Sidebar Panel */}
        <div 
          className={`absolute md:relative z-20 h-full bg-card border-r border-border transition-all duration-200 ease-in-out flex flex-col shrink-0
            ${sidebarOpen ? 'w-64 translate-x-0' : 'w-0 -translate-x-full md:translate-x-0 md:w-0'}`}
        >
          {sidebarOpen && (
            <>
              <div className="h-10 px-3 flex items-center justify-between border-b border-border shrink-0 select-none">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Explorer</span>
                <CreateFileButton onSuccess={handleFileSelect} />
              </div>
              <div className="flex-1 overflow-y-auto py-2">
                {loadingFiles ? (
                  <div className="px-4 py-2 text-xs text-muted-foreground">Loading...</div>
                ) : sortedFiles.length === 0 ? (
                  <div className="px-4 py-4 text-center">
                    <p className="text-xs text-muted-foreground mb-3">No files found.</p>
                    <CreateFileButton onSuccess={handleFileSelect} className="mx-auto border border-border px-3 py-1.5 rounded text-xs hover:bg-secondary flex items-center gap-2" text="Create File" />
                  </div>
                ) : (
                  sortedFiles.map(file => (
                    <FileItem 
                      key={file.path} 
                      file={file} 
                      isActive={activeFile === file.path}
                      onClick={() => handleFileSelect(file.path)}
                      onDelete={() => activeFile === file.path && setActiveFile(null)}
                    />
                  ))
                )}
              </div>
            </>
          )}
        </div>

        {/* Sidebar Overlay (Mobile only) */}
        {sidebarOpen && (
          <div 
            className="md:hidden absolute inset-0 bg-black/50 z-10" 
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Editor & Output Container */}
        <div className="flex-1 flex flex-col min-w-0 relative">
          {activeFile ? (
            <EditorPanel filePath={activeFile} />
          ) : (
            <div className="flex-1 flex items-center justify-center bg-[#1e1e1e] text-muted-foreground/50 select-none">
              <div className="text-center">
                <FileIcon size={48} className="mx-auto mb-4 opacity-20" />
                <p>Select a file to start coding</p>
              </div>
            </div>
          )}

          {/* Terminal Panel (Bottom) */}
          <div
            className="border-t border-border flex flex-col shrink-0 relative"
            style={{ height: isTerminalVisible ? terminalHeight : 0 }}
          >
            {isTerminalVisible && (
              <>
                {/* Resize handle */}
                <div
                  className="h-1 absolute top-0 left-0 right-0 cursor-row-resize hover:bg-primary/40 active:bg-primary/60 z-10"
                  onPointerDown={(e) => {
                    e.currentTarget.setPointerCapture(e.pointerId);
                    const startY = e.clientY;
                    const startH = terminalHeight;
                    const onMove = (mv: PointerEvent) => {
                      const newH = Math.max(80, Math.min(window.innerHeight * 0.85, startH - (mv.clientY - startY)));
                      setTerminalHeight(newH);
                    };
                    const onUp = () => {
                      document.removeEventListener('pointermove', onMove);
                      document.removeEventListener('pointerup', onUp);
                    };
                    document.addEventListener('pointermove', onMove);
                    document.addEventListener('pointerup', onUp);
                  }}
                />
                {/* Tab bar */}
                <div className="h-8 px-3 flex items-center justify-between border-b border-border bg-[#1a1a1a] shrink-0 select-none">
                  <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    <Terminal size={13} />
                    <span>Terminal</span>
                  </div>
                  <button
                    onClick={() => setIsTerminalVisible(false)}
                    className="p-1 hover:bg-secondary rounded text-muted-foreground hover:text-foreground transition-colors"
                    title="Hide terminal"
                  >
                    <X size={13} />
                  </button>
                </div>
                {/* xterm.js mount point */}
                <div className="flex-1 overflow-hidden bg-[#0a0a0a]">
                  <XTerminal ref={terminalRef} className="w-full h-full" />
                </div>
              </>
            )}
          </div>

          {/* Floating button to reopen terminal */}
          {!isTerminalVisible && (
            <button
              onClick={() => setIsTerminalVisible(true)}
              className="absolute bottom-4 right-4 bg-secondary border border-border text-foreground px-3 py-2 rounded-full shadow-lg flex items-center gap-2 text-sm font-medium z-20 hover:bg-muted transition-colors"
            >
              <Terminal size={15} />
              <span>Terminal</span>
            </button>
          )}
        </div>
      </div>
      
      <KeyboardToolbar />
    </div>
  );
}

// Subcomponents

function CreateFileButton({ onSuccess, className, text }: { onSuccess: (path: string) => void, className?: string, text?: string }) {
  const [isCreating, setIsCreating] = useState(false);
  const [filename, setFilename] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  
  const queryClient = useQueryClient();
  const createFile = useCreateFile();

  useEffect(() => {
    if (isCreating && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isCreating]);

  const handleCreate = async () => {
    if (!filename.trim()) {
      setIsCreating(false);
      return;
    }
    
    let path = filename.trim();
    if (!path.includes('.')) {
      path += '.js'; // Default to js
    }

    try {
      await createFile.mutateAsync({
        data: { path, content: "// " + path + "\n" }
      });
      queryClient.invalidateQueries({ queryKey: getListFilesQueryKey() });
      setFilename("");
      setIsCreating(false);
      onSuccess(path);
    } catch (error) {
      console.error("Failed to create file", error);
    }
  };

  if (isCreating) {
    return (
      <div className="absolute top-10 left-0 w-full p-2 bg-card border-b border-border z-30 shadow-lg flex gap-2">
        <input 
          ref={inputRef}
          value={filename}
          onChange={(e) => setFilename(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleCreate();
            if (e.key === 'Escape') { setIsCreating(false); setFilename(""); }
          }}
          className="flex-1 bg-input border border-border rounded px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-ring"
          placeholder="filename.js"
        />
        <button onClick={handleCreate} className="bg-primary text-primary-foreground px-2 rounded hover:opacity-90">
          <Check size={16} />
        </button>
        <button onClick={() => { setIsCreating(false); setFilename(""); }} className="bg-secondary text-foreground px-2 rounded hover:opacity-90">
          <X size={16} />
        </button>
      </div>
    );
  }

  return (
    <button 
      onClick={() => setIsCreating(true)}
      className={className || "p-1 hover:bg-secondary rounded text-muted-foreground hover:text-foreground transition-colors"}
    >
      {text ? <>{text}</> : <FilePlus size={16} />}
    </button>
  );
}

function FileItem({ file, isActive, onClick, onDelete }: { file: any, isActive: boolean, onClick: () => void, onDelete: () => void }) {
  const [showActions, setShowActions] = useState(false);
  const deleteFile = useDeleteFile();
  const renameFile = useRenameFile();
  const queryClient = useQueryClient();

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm(`Delete ${file.path}?`)) {
      await deleteFile.mutateAsync({ filePath: file.path });
      queryClient.invalidateQueries({ queryKey: getListFilesQueryKey() });
      onDelete();
    }
  };

  const handleRename = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const newName = prompt(`Rename ${file.name} to:`, file.name);
    if (newName && newName !== file.name) {
      let newPath = file.path.replace(file.name, newName);
      await renameFile.mutateAsync({ filePath: file.path, data: { newPath } });
      queryClient.invalidateQueries({ queryKey: getListFilesQueryKey() });
    }
    setShowActions(false);
  };

  return (
    <div 
      className={`group relative flex items-center justify-between px-3 py-2 cursor-pointer select-none
        ${isActive ? 'bg-primary/10 text-primary border-l-2 border-primary' : 'text-muted-foreground hover:bg-secondary/50 border-l-2 border-transparent'}`}
      onClick={onClick}
      onContextMenu={(e) => { e.preventDefault(); setShowActions(!showActions); }}
    >
      <div className="flex items-center gap-2 overflow-hidden">
        <FileIcon size={14} className={isActive ? 'text-primary' : 'text-muted-foreground/70'} />
        <span className={`text-sm truncate ${isActive ? 'text-accent font-medium' : 'text-foreground'}`}>{file.name}</span>
      </div>
      
      {/* Desktop hover actions or mobile toggle actions */}
      <div className={`flex items-center gap-1 ${showActions ? 'opacity-100' : 'opacity-0 md:group-hover:opacity-100'} transition-opacity`}>
        <button 
          onClick={handleRename}
          className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary rounded"
        >
          <Edit2 size={14} />
        </button>
        <button 
          onClick={handleDelete}
          className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

function EditorPanel({ filePath }: { filePath: string }) {
  const queryClient = useQueryClient();
  const updateFile = useUpdateFile();
  
  const { data: fileData, isLoading } = useReadFile(filePath, { 
    query: { enabled: !!filePath, queryKey: getReadFileQueryKey(filePath) } 
  });
  
  const [content, setContent] = useState("");
  const contentRef = useRef(content);
  const fileRef = useRef(filePath);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Keep a stable ref to current filePath so the TS extensions don't go stale
  const filePathRef = useRef(filePath);
  useEffect(() => { filePathRef.current = filePath; }, [filePath]);

  // Build extensions once; the getter closure keeps filePath current
  const tsExtensions = useMemo(
    () => createTsExtensions(() => filePathRef.current),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const isTypeScript = filePath.endsWith('.ts') || filePath.endsWith('.tsx');
  const hasJsx = filePath.endsWith('.tsx') || filePath.endsWith('.jsx');
  const langExt = useMemo(
    () => javascript({ typescript: isTypeScript || true, jsx: hasJsx }),
    [isTypeScript, hasJsx],
  );

  // Load content when file changes
  useEffect(() => {
    if (fileData && fileRef.current !== filePath) {
      setContent(fileData.content);
      contentRef.current = fileData.content;
      fileRef.current = filePath;
    } else if (fileData && !contentRef.current && fileData.content) {
      setContent(fileData.content);
      contentRef.current = fileData.content;
    }
  }, [fileData, filePath]);

  // Reset when filePath changes so new file data loads
  useEffect(() => {
    fileRef.current = ""; 
    setContent("");
  }, [filePath]);

  const onChange = useCallback((val: string) => {
    setContent(val);
    
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    
    saveTimeoutRef.current = setTimeout(() => {
      if (val !== contentRef.current) {
        updateFile.mutate({ filePath, data: { content: val } }, {
          onSuccess: () => {
            contentRef.current = val;
            queryClient.setQueryData([`/api/files/${filePath}`], { path: filePath, content: val });
          }
        });
      }
    }, 1000);
  }, [filePath, updateFile, queryClient]);

  if (isLoading) {
    return <div className="flex-1 flex items-center justify-center bg-[#1e1e1e] text-muted-foreground text-sm">Loading...</div>;
  }

  return (
    <div className="flex-1 overflow-auto bg-[#1e1e1e] text-[14px] leading-relaxed relative">
      <CodeMirror
        value={content}
        height="100%"
        extensions={[langExt, ...tsExtensions]}
        theme={oneDark}
        onChange={onChange}
        className="h-full cm-editor-wrapper absolute inset-0"
        basicSetup={{
          lineNumbers: true,
          highlightActiveLineGutter: true,
          foldGutter: false,
          dropCursor: false,
          allowMultipleSelections: false,
          indentOnInput: true,
          bracketMatching: true,
          closeBrackets: true,
          autocompletion: false,   // disabled — we provide our own TS-backed autocomplete
          highlightActiveLine: true,
          highlightSelectionMatches: true,
          tabSize: 2,
        }}
      />
    </div>
  );
}

function RunButton({ filePath, onRun }: { filePath: string; onRun: (cmd: string) => void }) {
  const handleRun = () => {
    // Send "node <file>\n" (or "npx ts-node <file>\n" for .ts) into the bash terminal
    const cmd = filePath.endsWith('.ts')
      ? `npx ts-node ${filePath}\n`
      : `node ${filePath}\n`;
    onRun(cmd);
  };

  return (
    <button
      onClick={handleRun}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-bold transition-colors shadow-sm bg-primary text-primary-foreground hover:bg-primary/90"
    >
      <Play size={14} fill="currentColor" />
      <span>Run</span>
    </button>
  );
}

// iOS specific keyboard toolbar
function KeyboardToolbar() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        setIsVisible(true);
      }
    };
    
    const handleFocusOut = () => {
      // Small delay to prevent flickering when moving between focusable elements
      setTimeout(() => {
        if (!document.activeElement || 
            (document.activeElement.tagName !== 'INPUT' && 
             document.activeElement.tagName !== 'TEXTAREA' && 
             !(document.activeElement as HTMLElement).isContentEditable)) {
          setIsVisible(false);
        }
      }, 50);
    };

    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('focusout', handleFocusOut);

    return () => {
      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('focusout', handleFocusOut);
    };
  }, []);

  const insertText = (text: string) => {
    if (text === 'Backspace') {
      document.execCommand('delete');
    } else {
      document.execCommand('insertText', false, text);
    }
  };

  if (!isVisible) return null;

  const symbols = [
    { label: ';', value: ';' },
    { label: '{', value: '{' },
    { label: '}', value: '}' },
    { label: '(', value: '(' },
    { label: ')', value: ')' },
    { label: '[', value: '[' },
    { label: ']', value: ']' },
    { label: '=', value: '=' },
    { label: '.', value: '.' },
    { label: '"', value: '"' },
    { label: "'", value: "'" },
    { label: '//', value: '// ' },
    { label: 'Tab', value: '  ' },
    { label: '←', value: 'Backspace' },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 h-11 bg-[#252526] border-t border-border flex items-center overflow-x-auto z-50 hide-scrollbar shadow-[0_-4px_16px_rgba(0,0,0,0.5)] touch-pan-x env-safe-bottom pb-[env(safe-area-inset-bottom)] pb-[env(keyboard-inset-height,0px)]">
      <div className="flex px-1 min-w-max h-full items-center">
        {symbols.map(sym => (
          <button
            key={sym.label}
            onPointerDown={(e) => {
              e.preventDefault(); // Prevent blur
              insertText(sym.value);
            }}
            className="h-8 min-w-[38px] px-2 mx-0.5 bg-[#3c3c3c] hover:bg-[#505050] active:bg-primary active:text-primary-foreground text-[#cccccc] rounded flex items-center justify-center font-mono text-[15px] font-medium touch-manipulation transition-colors border border-[#444]"
          >
            {sym.label}
          </button>
        ))}
      </div>
    </div>
  );
}


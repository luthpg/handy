import { useEffect, useRef, useImperativeHandle, forwardRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

export interface XTerminalHandle {
  /** Send raw text as keyboard input to the shell */
  send: (text: string) => void;
}

interface XTerminalProps {
  className?: string;
}

function buildWsUrl(): string {
  // Connect via Vite's proxy: /terminal → api-server:8080/terminal
  // This avoids routing through the Replit shared proxy's artifact path splitting,
  // which does not forward WebSocket upgrades for /api/* subpaths.
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/terminal`;
}

const XTerminal = forwardRef<XTerminalHandle, XTerminalProps>(
  ({ className }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const termRef = useRef<Terminal | null>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const fitRef = useRef<FitAddon | null>(null);

    // Expose send() to parent
    useImperativeHandle(ref, () => ({
      send: (text: string) => {
        const ws = wsRef.current;
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "data", data: text }));
        }
      },
    }));

    useEffect(() => {
      if (!containerRef.current) return;

      // --- Create terminal ---
      const term = new Terminal({
        theme: {
          background: "#0a0a0a",
          foreground: "#d4d4d4",
          cursor: "#d4d4d4",
          selectionBackground: "#264f78",
          black: "#1e1e1e",
          brightBlack: "#808080",
          red: "#f44747",
          brightRed: "#f44747",
          green: "#6a9955",
          brightGreen: "#6a9955",
          yellow: "#d7ba7d",
          brightYellow: "#d7ba7d",
          blue: "#569cd6",
          brightBlue: "#569cd6",
          magenta: "#c586c0",
          brightMagenta: "#c586c0",
          cyan: "#4ec9b0",
          brightCyan: "#4ec9b0",
          white: "#d4d4d4",
          brightWhite: "#ffffff",
        },
        fontSize: 13,
        fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
        cursorBlink: true,
        allowProposedApi: true,
        scrollback: 5000,
        convertEol: false,
      });

      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.open(containerRef.current);
      fitAddon.fit();

      termRef.current = term;
      fitRef.current = fitAddon;

      // --- WebSocket ---
      const connect = () => {
        const ws = new WebSocket(buildWsUrl());
        wsRef.current = ws;

        ws.onopen = () => {
          // Send initial size
          const dims = fitAddon.proposeDimensions();
          if (dims) {
            ws.send(
              JSON.stringify({ type: "resize", cols: dims.cols, rows: dims.rows }),
            );
          }
        };

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data as string) as
              | { type: "data"; data: string }
              | { type: "exit"; exitCode: number };
            if (msg.type === "data") {
              term.write(msg.data);
            } else if (msg.type === "exit") {
              term.writeln(`\r\n[Process exited with code ${msg.exitCode}]`);
            }
          } catch {
            term.write(event.data as string);
          }
        };

        ws.onclose = () => {
          term.writeln("\r\n\x1b[33m[Connection closed — reconnecting in 3s…]\x1b[0m");
          setTimeout(connect, 3000);
        };

        ws.onerror = () => {
          ws.close();
        };
      };

      connect();

      // Terminal → WebSocket (keystrokes)
      term.onData((data) => {
        const ws = wsRef.current;
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "data", data }));
        }
      });

      // Resize observer
      const ro = new ResizeObserver(() => {
        try {
          fitAddon.fit();
          const ws = wsRef.current;
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(
              JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }),
            );
          }
        } catch {}
      });
      if (containerRef.current) ro.observe(containerRef.current);

      return () => {
        ro.disconnect();
        wsRef.current?.close();
        term.dispose();
        termRef.current = null;
        fitRef.current = null;
      };
    }, []);

    return (
      <div
        ref={containerRef}
        className={className}
        style={{ width: "100%", height: "100%" }}
      />
    );
  },
);

XTerminal.displayName = "XTerminal";
export default XTerminal;

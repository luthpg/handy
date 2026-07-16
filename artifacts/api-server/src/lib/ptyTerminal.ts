import http from "http";
import { IncomingMessage } from "http";
import { Duplex } from "stream";
import { WebSocketServer, WebSocket, RawData } from "ws";
import pty from "node-pty-prebuilt-multiarch";
import path from "path";
import { logger } from "./logger.js";

const WORKSPACE_DIR = path.resolve(process.cwd(), "user-workspace");

export function createTerminalWss(): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });

  wss.on("connection", (ws: WebSocket) => {
    logger.info("Terminal WebSocket connected");

    const ptyProcess = pty.spawn("bash", ["--login"], {
      name: "xterm-256color",
      cols: 80,
      rows: 24,
      cwd: WORKSPACE_DIR,
      env: {
        ...process.env,
        TERM: "xterm-256color",
        COLORTERM: "truecolor",
        FORCE_COLOR: "3",
      } as Record<string, string>,
    });

    // PTY output → WebSocket
    ptyProcess.onData((data: string) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "data", data }));
      }
    });

    ptyProcess.onExit(({ exitCode }: { exitCode: number }) => {
      logger.info({ exitCode }, "PTY process exited");
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "exit", exitCode }));
        ws.close();
      }
    });

    // WebSocket input → PTY
    ws.on("message", (raw: RawData) => {
      try {
        const msg = JSON.parse(raw.toString()) as
          | { type: "data"; data: string }
          | { type: "resize"; cols: number; rows: number };

        if (msg.type === "data") {
          ptyProcess.write(msg.data);
        } else if (msg.type === "resize") {
          ptyProcess.resize(
            Math.max(2, Math.min(512, msg.cols)),
            Math.max(2, Math.min(256, msg.rows)),
          );
        }
      } catch {
        // ignore malformed messages
      }
    });

    ws.on("close", () => {
      logger.info("Terminal WebSocket closed — killing PTY");
      ptyProcess.kill();
    });

    ws.on("error", (err: Error) => {
      logger.error({ err }, "Terminal WebSocket error");
      ptyProcess.kill();
    });
  });

  return wss;
}

export function attachTerminalUpgrade(
  server: http.Server,
  wss: WebSocketServer,
) {
  server.on(
    "upgrade",
    (req: IncomingMessage, socket: Duplex, head: Buffer) => {
      const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
      if (pathname === "/terminal") {
        wss.handleUpgrade(req, socket, head, (ws: WebSocket) => {
          wss.emit("connection", ws, req);
        });
      } else {
        socket.destroy();
      }
    },
  );
}

import http from "http";
import app from "./app";
import { logger } from "./lib/logger";
import { createTerminalWss, attachTerminalUpgrade } from "./lib/ptyTerminal";
import { initDb } from "./lib/db";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = http.createServer(app);

// Attach WebSocket terminal
const terminalWss = createTerminalWss();
attachTerminalUpgrade(server, terminalWss);

// Init database (non-blocking — app starts even if DB is unavailable)
initDb().catch((err) => logger.error({ err }, "DB init error"));

server.listen(port, (err?: Error) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  logger.info({ port }, "Server listening");
});

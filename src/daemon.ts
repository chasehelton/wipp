import { createLogger } from "./utils/logger.js";
import { loadConfig } from "./config.js";
import { getDb, closeDb } from "./store/db.js";
import { getCopilotClient, stopCopilotClient } from "./copilot/client.js";
import { initOrchestrator, shutdownOrchestrator } from "./copilot/orchestrator.js";
import { startDiscordBot, stopDiscordBot } from "./discord/bot.js";
import { scanAndRegisterRepos } from "./git/repos.js";
import { pruneConversationLog } from "./store/conversations.js";

const log = createLogger("daemon");

let isShuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (isShuttingDown) {
    log.warn("Forced shutdown — exiting immediately");
    process.exit(1);
  }
  isShuttingDown = true;
  log.info(`Received ${signal}, shutting down gracefully`);

  try {
    await stopDiscordBot();
  } catch (err) {
    log.error("Error stopping Discord bot", { error: String(err) });
  }

  try {
    await shutdownOrchestrator();
  } catch (err) {
    log.error("Error shutting down orchestrator", { error: String(err) });
  }

  try {
    await stopCopilotClient();
  } catch (err) {
    log.error("Error stopping Copilot client", { error: String(err) });
  }

  try {
    closeDb();
  } catch (err) {
    log.error("Error closing database", { error: String(err) });
  }

  log.info("Shutdown complete");
  process.exit(0);
}

async function main(): Promise<void> {
  log.info("Starting wipp daemon");

  // 1. Validate configuration
  const config = loadConfig();
  log.info("Configuration loaded", {
    orchestratorModel: config.COPILOT_ORCHESTRATOR_MODEL,
    workerModel: config.COPILOT_WORKER_MODEL,
    maxWorkers: config.MAX_WORKERS,
  });

  // 2. Initialize database
  getDb();
  pruneConversationLog();
  log.info("Database initialized");

  // 3. Scan and register repos
  const repos = scanAndRegisterRepos();
  log.info("Repos scanned", { count: repos.length });

  // 4. Initialize Copilot client
  await getCopilotClient();
  log.info("Copilot client initialized");

  // 5. Initialize orchestrator (wires tools, queue handler, creates session)
  await initOrchestrator();
  log.info("Orchestrator initialized");

  // 6. Start Discord bot (connects to gateway, starts receiving messages)
  await startDiscordBot();
  log.info("Discord bot started");

  log.info("wipp daemon started successfully");
}

// Signal handlers
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

// Unhandled rejections: log but don't crash (like Max)
process.on("unhandledRejection", (reason) => {
  log.error("Unhandled promise rejection", { reason: String(reason) });
});

// Uncaught exceptions: crash (these are unrecoverable)
process.on("uncaughtException", (err) => {
  log.error("Uncaught exception — crashing", { error: err.message, stack: err.stack });
  process.exit(1);
});

main().catch((err) => {
  log.error("Fatal error during startup", { error: String(err) });
  process.exit(1);
});

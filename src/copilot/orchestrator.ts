import { type CopilotSession, approveAll } from "@github/copilot-sdk";
import { getCopilotClient } from "./client.js";
import { buildSystemPrompt } from "./system-prompt.js";
import {
  orchestratorTools,
  setWorkerCallbacks,
  setNotifyCallback,
} from "./tools.js";
import { createStatusHooks } from "./status-hooks.js";
import { workerManager } from "./workers.js";
import { getSkillDirectories } from "./skills.js";
import { loadConfig } from "../config.js";
import { getDb } from "../store/db.js";
import {
  logConversation,
  getRecentConversations,
} from "../store/conversations.js";
import { messageQueue } from "../queue.js";
import { sendProactiveMessage } from "../discord/bot.js";
import { createLogger } from "../utils/logger.js";
import { withRetry } from "../utils/errors.js";

const log = createLogger("orchestrator");

let _session: CopilotSession | null = null;
let _turnCount = 0;

// ---------------------------------------------------------------------------
// Wire worker callbacks to the actual WorkerManager
// ---------------------------------------------------------------------------

function wireCallbacks(): void {
  setWorkerCallbacks({
    create: (repoName, slug, taskDescription, baseBranch) =>
      workerManager.createWorker(repoName, slug, taskDescription, baseBranch),
    send: (workerName, prompt) =>
      workerManager.sendToWorker(workerName, prompt),
    check: (workerName) => workerManager.checkWorker(workerName),
    kill: (workerName) => workerManager.killWorker(workerName),
  });

  setNotifyCallback(async (message) => {
    await sendProactiveMessage(message);
  });
}

// ---------------------------------------------------------------------------
// Session lifecycle
// ---------------------------------------------------------------------------

function shouldRotateSession(): boolean {
  if (!_session) return true;

  const config = loadConfig();
  if (_turnCount >= config.SESSION_MAX_TURNS) {
    log.info("Rotating session: turn limit reached", { turns: _turnCount });
    return true;
  }

  return false;
}

async function createOrchestratorSession(): Promise<void> {
  const config = loadConfig();
  const client = await getCopilotClient();

  // Build context injection from recent conversations
  const recentConversations = getRecentConversations(5);
  const conversationContext =
    recentConversations.length > 0
      ? "\n\n## Recent Conversation History\n" +
        recentConversations
          .reverse()
          .map((c) => `[${c.role}]: ${c.content.slice(0, 500)}`)
          .join("\n")
      : "";

  // Build worker status context
  const activeWorkers = workerManager.getActiveWorkers();
  const workerContext =
    activeWorkers.length > 0
      ? "\n\n## Active Workers\n" +
        activeWorkers
          .map(
            (w) =>
              `- ${w.name} [${w.status}] on ${w.branch}: ${w.taskDescription}`,
          )
          .join("\n")
      : "";

  const systemMessage = buildSystemPrompt() + conversationContext + workerContext;

  // Disconnect previous session if exists
  if (_session) {
    try {
      await _session.disconnect();
    } catch (err) {
      log.warn("Error disconnecting previous session", {
        error: String(err),
      });
    }
  }

  // Create new session
  _session = await client.createSession({
    model: config.COPILOT_ORCHESTRATOR_MODEL,
    systemMessage: { mode: "replace", content: systemMessage },
    tools: orchestratorTools,
    skillDirectories: getSkillDirectories(),
    streaming: true,
    mcpServers: {
      github: {
        type: "http",
        url: "https://api.githubcopilot.com/mcp/",
        headers: { Authorization: `Bearer ${config.GITHUB_TOKEN}` },
        tools: ["*"],
      },
    },
    onPermissionRequest: approveAll,
    hooks: createStatusHooks(),
  });

  _turnCount = 0;

  // Persist session ID
  const db = getDb();
  db.prepare(
    "INSERT OR REPLACE INTO config (key, value) VALUES ('orchestrator_session_id', ?)",
  ).run(_session.sessionId);

  log.info("Created new orchestrator session", {
    model: config.COPILOT_ORCHESTRATOR_MODEL,
    sessionId: _session.sessionId,
    skills: getSkillDirectories().length,
    recentConversations: recentConversations.length,
    activeWorkers: activeWorkers.length,
  });
}

// ---------------------------------------------------------------------------
// Message handling
// ---------------------------------------------------------------------------

async function handleMessage(
  message: string,
  source: string,
): Promise<string> {
  if (shouldRotateSession()) {
    await createOrchestratorSession();
  }

  logConversation("user", message, source);
  _turnCount++;

  try {
    const config = loadConfig();
    const response = await withRetry(async () => {
      const result = await _session!.sendAndWait(
        { prompt: message },
        config.ORCHESTRATOR_TIMEOUT,
      );
      return (
        result?.data?.content ??
        "I processed your request but have no text response."
      );
    });

    logConversation("assistant", response, source);
    return response;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    log.error("Orchestrator error", { error: errMsg });

    // Force rotation on next message
    _session = null;
    _turnCount = 0;

    logConversation("system", `Error: ${errMsg}`, source);
    return `I encountered an error: ${errMsg}\n\nI'll create a fresh session for the next message.`;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function initOrchestrator(): Promise<void> {
  log.info("Initializing orchestrator");

  wireCallbacks();
  messageQueue.setHandler(handleMessage);
  await createOrchestratorSession();

  log.info("Orchestrator initialized and ready");
}

export async function shutdownOrchestrator(): Promise<void> {
  await workerManager.shutdownAll();

  if (_session) {
    try {
      await _session.disconnect();
    } catch (err) {
      log.warn("Error disconnecting orchestrator session", {
        error: String(err),
      });
    }
    _session = null;
  }

  log.info("Orchestrator shut down");
}

export function getOrchestratorStatus(): {
  sessionId: string | null;
  turnCount: number;
  maxTurns: number;
  activeWorkers: number;
} {
  const config = loadConfig();
  return {
    sessionId: _session?.sessionId ?? null,
    turnCount: _turnCount,
    maxTurns: config.SESSION_MAX_TURNS,
    activeWorkers: workerManager.getActiveWorkers().length,
  };
}

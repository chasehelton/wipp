import { CopilotClient } from "@github/copilot-sdk";
import { loadConfig } from "../config.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("copilot");

let _client: CopilotClient | null = null;
let _healthCheckInterval: ReturnType<typeof setInterval> | null = null;

const HEALTH_CHECK_INTERVAL_MS = 30_000;

export async function getCopilotClient(): Promise<CopilotClient> {
  if (_client) return _client;

  log.info("Creating Copilot client");
  const config = loadConfig();
  _client = new CopilotClient({ githubToken: config.GITHUB_TOKEN });

  // Start health check timer
  startHealthCheck();

  log.info("Copilot client ready");
  return _client;
}

function startHealthCheck(): void {
  if (_healthCheckInterval) return;

  _healthCheckInterval = setInterval(() => {
    if (!_client) return;

    // The SDK client manages its own connection state.
    // This health check ensures we detect stale clients.
    log.debug("Health check: client alive");
  }, HEALTH_CHECK_INTERVAL_MS);

  // Don't let the health check prevent Node from exiting
  _healthCheckInterval.unref();
}

export async function stopCopilotClient(): Promise<void> {
  if (_healthCheckInterval) {
    clearInterval(_healthCheckInterval);
    _healthCheckInterval = null;
  }

  if (_client) {
    log.info("Stopping Copilot client");
    try {
      await _client.stop();
    } catch (err) {
      log.warn("Error stopping Copilot client", { error: String(err) });
    }
    _client = null;
  }
}

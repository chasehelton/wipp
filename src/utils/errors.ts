export class WippError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = "WippError";
  }
}

export class ConfigError extends WippError {
  constructor(message: string) {
    super(message, "CONFIG_ERROR");
    this.name = "ConfigError";
  }
}

export class CopilotError extends WippError {
  constructor(message: string, public readonly retriable: boolean = false) {
    super(message, "COPILOT_ERROR");
    this.name = "CopilotError";
  }
}

export class WorkerError extends WippError {
  constructor(message: string, public readonly workerName?: string) {
    super(message, "WORKER_ERROR");
    this.name = "WorkerError";
  }
}

export class GitError extends WippError {
  constructor(message: string) {
    super(message, "GIT_ERROR");
    this.name = "GitError";
  }
}

export class DiscordError extends WippError {
  constructor(message: string) {
    super(message, "DISCORD_ERROR");
    this.name = "DiscordError";
  }
}

export function isRetriableError(err: unknown): boolean {
  if (err instanceof CopilotError) return err.retriable;
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return msg.includes("timeout") || msg.includes("econnreset") || msg.includes("rate limit");
  }
  return false;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  delays = [1000, 3000, 10000],
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries && isRetriableError(err)) {
        const delay = delays[Math.min(attempt, delays.length - 1)];
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

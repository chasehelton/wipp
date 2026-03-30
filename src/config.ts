import { config as loadDotenv } from "dotenv";
import { z } from "zod";
import { ENV_PATH, DEFAULT_REPOS_DIR } from "./paths.js";

// Load ~/.wipp/.env first, then CWD .env as fallback
loadDotenv({ path: ENV_PATH });
loadDotenv(); // CWD .env (doesn't override existing values)

const envSchema = z.object({
  // Required
  DISCORD_BOT_TOKEN: z.string().min(1, "DISCORD_BOT_TOKEN is required"),
  DISCORD_AUTHORIZED_USER_ID: z
    .string()
    .min(1, "DISCORD_AUTHORIZED_USER_ID is required"),
  GITHUB_TOKEN: z.string().min(1, "GITHUB_TOKEN is required"),

  // Optional with defaults
  COPILOT_ORCHESTRATOR_MODEL: z.string().default("claude-opus-4.6"),
  COPILOT_WORKER_MODEL: z.string().default("claude-sonnet-4.6"),
  SESSION_MAX_TURNS: z.coerce.number().int().positive().default(15),
  WORKER_TIMEOUT: z.coerce.number().int().positive().default(600_000),
  MAX_WORKERS: z.coerce.number().int().positive().max(3).default(2),
  REPOS_DIR: z.string().default(DEFAULT_REPOS_DIR),
});

export type Config = z.infer<typeof envSchema>;

let _config: Config | null = null;

export function loadConfig(): Config {
  if (_config) return _config;

  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const errors = result.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid configuration:\n${errors}`);
  }

  _config = result.data;
  return _config;
}

// For testing or reconfiguration
export function resetConfig(): void {
  _config = null;
}

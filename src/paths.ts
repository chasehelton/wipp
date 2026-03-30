// All wipp data lives under ~/.wipp/
// This module resolves paths and ensures directories exist on import.

import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync } from "node:fs";

export const WIPP_HOME = join(homedir(), ".wipp");
export const DB_PATH = join(WIPP_HOME, "wipp.db");
export const ENV_PATH = join(WIPP_HOME, ".env");
export const SKILLS_DIR = join(WIPP_HOME, "skills");
export const SESSIONS_DIR = join(WIPP_HOME, "sessions");

// Default repos directory (overridden by REPOS_DIR env var)
export const DEFAULT_REPOS_DIR = join(homedir(), "repos");

// Ensure directories exist
for (const dir of [WIPP_HOME, SKILLS_DIR, SESSIONS_DIR]) {
  mkdirSync(dir, { recursive: true });
}

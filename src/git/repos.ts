import { readdirSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { getDb } from "../store/db.js";
import { loadConfig } from "../config.js";
import { isGitRepo, getDefaultBranch } from "./worktrees.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("repos");

export interface Repo {
  id: number;
  name: string;
  local_path: string;
  default_branch: string;
  created_at: string;
}

export function getRepoRemoteName(repoPath: string): string {
  try {
    const url = execSync("git remote get-url origin", { cwd: repoPath, encoding: "utf-8" }).trim();
    // Parse owner/repo from git URL (HTTPS or SSH)
    const match = url.match(/[/:]([^/]+)\/([^/.]+?)(?:\.git)?$/);
    return match ? `${match[1]}/${match[2]}` : repoPath;
  } catch {
    return repoPath;
  }
}

export function scanAndRegisterRepos(): Repo[] {
  const config = loadConfig();
  const reposDir = config.REPOS_DIR;
  const db = getDb();
  const registered: Repo[] = [];

  let entries: string[];
  try {
    entries = readdirSync(reposDir);
  } catch {
    log.warn("Repos directory not found", { path: reposDir });
    return [];
  }

  for (const entry of entries) {
    const fullPath = join(reposDir, entry);
    if (!isGitRepo(fullPath)) continue;

    const name = getRepoRemoteName(fullPath);
    const defaultBranch = getDefaultBranch(fullPath);

    const existing = db.prepare("SELECT * FROM repos WHERE local_path = ?").get(fullPath) as Repo | undefined;
    if (existing) {
      registered.push(existing);
      continue;
    }

    const result = db.prepare(
      "INSERT INTO repos (name, local_path, default_branch) VALUES (?, ?, ?)"
    ).run(name, fullPath, defaultBranch);

    const repo = db.prepare("SELECT * FROM repos WHERE id = ?").get(result.lastInsertRowid) as Repo;
    registered.push(repo);
    log.info("Registered repo", { name, path: fullPath, defaultBranch });
  }

  return registered;
}

export function getRepo(id: number): Repo | undefined {
  const db = getDb();
  return db.prepare("SELECT * FROM repos WHERE id = ?").get(id) as Repo | undefined;
}

export function getRepoByName(name: string): Repo | undefined {
  const db = getDb();
  return db.prepare("SELECT * FROM repos WHERE name LIKE ?").get(`%${name}%`) as Repo | undefined;
}

export function getAllRepos(): Repo[] {
  const db = getDb();
  return db.prepare("SELECT * FROM repos ORDER BY name").all() as Repo[];
}

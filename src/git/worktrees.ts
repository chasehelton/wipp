import { execSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { createLogger } from "../utils/logger.js";
import { GitError } from "../utils/errors.js";

const log = createLogger("git");

export interface Worktree {
  path: string;
  branch: string;
  head: string;
  isBare: boolean;
}

function git(args: string, cwd: string): string {
  try {
    return execSync(`git ${args}`, { cwd, encoding: "utf-8", timeout: 30_000 }).trim();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new GitError(`git ${args} failed in ${cwd}: ${msg}`);
  }
}

export function isGitRepo(path: string): boolean {
  try {
    git("rev-parse --git-dir", path);
    return true;
  } catch {
    return false;
  }
}

export function listWorktrees(repoPath: string): Worktree[] {
  if (!isGitRepo(repoPath)) throw new GitError(`Not a git repo: ${repoPath}`);

  const output = git("worktree list --porcelain", repoPath);
  const worktrees: Worktree[] = [];
  let current: Partial<Worktree> = {};

  for (const line of output.split("\n")) {
    if (line.startsWith("worktree ")) {
      if (current.path) worktrees.push(current as Worktree);
      current = { path: line.slice(9), isBare: false };
    } else if (line.startsWith("HEAD ")) {
      current.head = line.slice(5);
    } else if (line.startsWith("branch ")) {
      current.branch = line.slice(7).replace("refs/heads/", "");
    } else if (line === "bare") {
      current.isBare = true;
    } else if (line === "" && current.path) {
      worktrees.push(current as Worktree);
      current = {};
    }
  }
  if (current.path) worktrees.push(current as Worktree);

  return worktrees;
}

export function createWorktree(repoPath: string, slug: string, baseBranch?: string): Worktree {
  if (!isGitRepo(repoPath)) throw new GitError(`Not a git repo: ${repoPath}`);

  const repoName = basename(repoPath);
  const worktreeDir = join(dirname(repoPath), `${repoName}-worktrees`);
  mkdirSync(worktreeDir, { recursive: true });

  const worktreePath = join(worktreeDir, slug);
  const branchName = `wipp/${slug}`;

  if (existsSync(worktreePath)) {
    throw new GitError(`Worktree already exists: ${worktreePath}`);
  }

  // Fetch latest from origin
  try {
    git("fetch origin", repoPath);
  } catch {
    log.warn("Could not fetch from origin", { repoPath });
  }

  // Create worktree with new branch based on base branch or default
  const base = baseBranch ?? getDefaultBranch(repoPath);
  git(`worktree add "${worktreePath}" -b "${branchName}" "origin/${base}"`, repoPath);

  log.info("Created worktree", { path: worktreePath, branch: branchName, base });

  return {
    path: worktreePath,
    branch: branchName,
    head: git("rev-parse HEAD", worktreePath),
    isBare: false,
  };
}

export function removeWorktree(repoPath: string, worktreePath: string, force = false): void {
  if (!isGitRepo(repoPath)) throw new GitError(`Not a git repo: ${repoPath}`);

  const forceFlag = force ? " --force" : "";
  git(`worktree remove "${worktreePath}"${forceFlag}`, repoPath);

  log.info("Removed worktree", { path: worktreePath });
}

export function getDefaultBranch(repoPath: string): string {
  try {
    const ref = git("symbolic-ref refs/remotes/origin/HEAD", repoPath);
    return ref.replace("refs/remotes/origin/", "");
  } catch {
    // Fallback: check if main or master exists
    try {
      git("rev-parse --verify origin/main", repoPath);
      return "main";
    } catch {
      return "master";
    }
  }
}

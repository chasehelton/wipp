import { type CopilotSession, approveAll } from "@github/copilot-sdk";
import { getCopilotClient } from "./client.js";
import { loadConfig } from "../config.js";
import { getDb } from "../store/db.js";
import { createWorktree, removeWorktree } from "../git/worktrees.js";
import { getRepoByName } from "../git/repos.js";
import { createLogger } from "../utils/logger.js";
import { WorkerError } from "../utils/errors.js";

const log = createLogger("workers");

interface ManagedWorker {
  name: string;
  session: CopilotSession;
  repoPath: string;
  worktreePath: string;
  branch: string;
  status: "idle" | "working" | "completed" | "failed";
  taskDescription: string;
  lastOutput: string | null;
  timeoutHandle: ReturnType<typeof setTimeout> | null;
  createdAt: Date;
}

export class WorkerManager {
  private workers = new Map<string, ManagedWorker>();
  private workerCounter = 0;

  async createWorker(
    repoName: string,
    slug: string,
    taskDescription: string,
    baseBranch?: string,
  ): Promise<{ workerName: string; worktreePath: string; branch: string }> {
    const config = loadConfig();

    if (this.workers.size >= config.MAX_WORKERS) {
      throw new WorkerError(
        `Maximum workers (${config.MAX_WORKERS}) reached. Kill a worker first.`,
      );
    }

    const repo = getRepoByName(repoName);
    if (!repo) {
      throw new WorkerError(
        `Repo not found: ${repoName}. Run list_repos to see available repos.`,
        repoName,
      );
    }

    const worktree = createWorktree(
      repo.local_path,
      slug,
      baseBranch ?? repo.default_branch,
    );

    const client = await getCopilotClient();
    const session = await client.createSession({
      model: config.COPILOT_WORKER_MODEL,
      streaming: true,
      infiniteSessions: {
        enabled: true,
        backgroundCompactionThreshold: 0.7,
        bufferExhaustionThreshold: 0.9,
      },
      onPermissionRequest: approveAll,
    });

    const workerName = `worker-${++this.workerCounter}-${slug}`;

    const timeoutHandle = setTimeout(() => {
      log.warn("Worker timed out", { name: workerName });
      void this.killWorker(workerName);
    }, config.WORKER_TIMEOUT);
    timeoutHandle.unref();

    const worker: ManagedWorker = {
      name: workerName,
      session,
      repoPath: repo.local_path,
      worktreePath: worktree.path,
      branch: worktree.branch,
      status: "idle",
      taskDescription,
      lastOutput: null,
      timeoutHandle,
      createdAt: new Date(),
    };

    this.workers.set(workerName, worker);

    const db = getDb();
    db.prepare(
      `INSERT INTO worker_sessions (name, copilot_session_id, repo_path, worktree_path, branch, status, task_description)
       VALUES (?, ?, ?, ?, ?, 'idle', ?)`,
    ).run(
      workerName,
      session.sessionId,
      repo.local_path,
      worktree.path,
      worktree.branch,
      taskDescription,
    );

    log.info("Created worker", {
      name: workerName,
      repo: repoName,
      branch: worktree.branch,
      worktree: worktree.path,
    });

    return { workerName, worktreePath: worktree.path, branch: worktree.branch };
  }

  async sendToWorker(
    workerName: string,
    prompt: string,
  ): Promise<{ sent: boolean }> {
    const worker = this.workers.get(workerName);
    if (!worker)
      throw new WorkerError(`Worker not found: ${workerName}`, workerName);

    worker.status = "working";
    this.updateWorkerDb(workerName, "working");

    // Fire-and-forget — caller polls via checkWorker
    void this.executeWorkerTask(worker, prompt);

    return { sent: true };
  }

  private async executeWorkerTask(
    worker: ManagedWorker,
    prompt: string,
  ): Promise<void> {
    try {
      const fullPrompt = `You are working in the directory: ${worker.worktreePath}\nBranch: ${worker.branch}\n\nTask: ${prompt}`;

      const response = await worker.session.sendAndWait({ prompt: fullPrompt });
      worker.lastOutput = response?.data?.content ?? "No output";
      worker.status = "completed";
      this.updateWorkerDb(worker.name, "completed", worker.lastOutput);

      log.info("Worker completed", { name: worker.name });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      worker.lastOutput = `Error: ${errMsg}`;
      worker.status = "failed";
      this.updateWorkerDb(worker.name, "failed", worker.lastOutput);

      log.error("Worker failed", { name: worker.name, error: errMsg });
    }
  }

  async checkWorker(
    workerName: string,
  ): Promise<{ status: string; lastOutput: string | null }> {
    const worker = this.workers.get(workerName);
    if (!worker) {
      // Check DB for historical / out-of-process workers
      const db = getDb();
      const row = db
        .prepare(
          "SELECT status, last_output FROM worker_sessions WHERE name = ?",
        )
        .get(workerName) as
        | { status: string; last_output: string | null }
        | undefined;
      if (row) return { status: row.status, lastOutput: row.last_output };
      throw new WorkerError(`Worker not found: ${workerName}`, workerName);
    }
    return { status: worker.status, lastOutput: worker.lastOutput };
  }

  async killWorker(workerName: string): Promise<{ killed: boolean }> {
    const worker = this.workers.get(workerName);
    if (!worker)
      throw new WorkerError(`Worker not found: ${workerName}`, workerName);

    if (worker.timeoutHandle) clearTimeout(worker.timeoutHandle);

    try {
      await worker.session.disconnect();
    } catch (err) {
      log.warn("Error disconnecting worker session", {
        name: workerName,
        error: String(err),
      });
    }

    this.updateWorkerDb(workerName, "killed");
    this.workers.delete(workerName);

    log.info("Killed worker", { name: workerName });
    return { killed: true };
  }

  getActiveWorkers(): Array<{
    name: string;
    status: string;
    branch: string;
    taskDescription: string;
    worktreePath: string;
  }> {
    return Array.from(this.workers.values()).map((w) => ({
      name: w.name,
      status: w.status,
      branch: w.branch,
      taskDescription: w.taskDescription,
      worktreePath: w.worktreePath,
    }));
  }

  async shutdownAll(): Promise<void> {
    for (const [name] of this.workers) {
      try {
        await this.killWorker(name);
      } catch (err) {
        log.warn("Error killing worker during shutdown", {
          name,
          error: String(err),
        });
      }
    }
  }

  private updateWorkerDb(
    name: string,
    status: string,
    lastOutput?: string | null,
  ): void {
    const db = getDb();
    if (lastOutput !== undefined) {
      db.prepare(
        "UPDATE worker_sessions SET status = ?, last_output = ?, updated_at = CURRENT_TIMESTAMP WHERE name = ?",
      ).run(status, lastOutput, name);
    } else {
      db.prepare(
        "UPDATE worker_sessions SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE name = ?",
      ).run(status, name);
    }
  }
}

// Singleton
export const workerManager = new WorkerManager();

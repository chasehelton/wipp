import { getDb } from "./db.js";

export interface Task {
  id: number;
  repo_id: number | null;
  github_issue_url: string | null;
  description: string;
  branch: string | null;
  worktree_path: string | null;
  status: string;
  pr_url: string | null;
  worker_name: string | null;
  created_at: string;
  updated_at: string;
}

export function createTask(description: string, repoId?: number, issueUrl?: string): Task {
  const db = getDb();
  const stmt = db.prepare(
    "INSERT INTO tasks (description, repo_id, github_issue_url) VALUES (?, ?, ?)"
  );
  const result = stmt.run(description, repoId ?? null, issueUrl ?? null);
  return db.prepare("SELECT * FROM tasks WHERE id = ?").get(result.lastInsertRowid) as Task;
}

export function updateTaskStatus(id: number, status: string, updates?: Partial<Pick<Task, "branch" | "worktree_path" | "pr_url" | "worker_name">>): void {
  const db = getDb();
  const sets = ["status = ?", "updated_at = CURRENT_TIMESTAMP"];
  const values: unknown[] = [status];

  if (updates) {
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        sets.push(`${key} = ?`);
        values.push(value);
      }
    }
  }

  values.push(id);
  db.prepare(`UPDATE tasks SET ${sets.join(", ")} WHERE id = ?`).run(...values);
}

export function getActiveTasks(): Task[] {
  const db = getDb();
  return db.prepare(
    "SELECT * FROM tasks WHERE status IN ('pending', 'in_progress') ORDER BY created_at DESC"
  ).all() as Task[];
}

export function getTask(id: number): Task | undefined {
  const db = getDb();
  return db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as Task | undefined;
}

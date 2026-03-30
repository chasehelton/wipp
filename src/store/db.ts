import Database from "better-sqlite3";
import { DB_PATH } from "../paths.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("store");

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;

  log.info("Opening database", { path: DB_PATH });
  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");

  createSchema(_db);
  return _db;
}

function createSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS worker_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      copilot_session_id TEXT,
      repo_path TEXT NOT NULL,
      worktree_path TEXT NOT NULL,
      branch TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'idle'
        CHECK(status IN ('idle', 'working', 'completed', 'failed', 'killed')),
      task_description TEXT,
      last_output TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL CHECK(category IN ('preference', 'fact', 'project', 'person', 'routine', 'codebase')),
      content TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'user',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_accessed DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS conversation_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
      content TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'discord',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS repos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      local_path TEXT UNIQUE NOT NULL,
      default_branch TEXT DEFAULT 'main',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      repo_id INTEGER REFERENCES repos(id),
      github_issue_url TEXT,
      description TEXT NOT NULL,
      branch TEXT,
      worktree_path TEXT,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK(status IN ('pending', 'in_progress', 'completed', 'failed', 'cancelled')),
      pr_url TEXT,
      worker_name TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  log.info("Database schema initialized");
}

export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
    log.info("Database closed");
  }
}

import { getDb } from "./db.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("conversations");
const MAX_ENTRIES = 200;

export interface ConversationEntry {
  id: number;
  role: string;
  content: string;
  source: string;
  created_at: string;
}

let insertCount = 0;

export function logConversation(role: "user" | "assistant" | "system", content: string, source = "discord"): void {
  const db = getDb();
  db.prepare(
    "INSERT INTO conversation_log (role, content, source) VALUES (?, ?, ?)"
  ).run(role, content, source);

  insertCount++;
  if (insertCount % 50 === 0) {
    pruneConversationLog();
  }
}

export function getRecentConversations(limit = 10): ConversationEntry[] {
  const db = getDb();
  return db.prepare(
    "SELECT * FROM conversation_log ORDER BY id DESC LIMIT ?"
  ).all(limit) as ConversationEntry[];
}

export function pruneConversationLog(): void {
  const db = getDb();
  const count = (db.prepare("SELECT COUNT(*) as count FROM conversation_log").get() as { count: number }).count;
  if (count > MAX_ENTRIES) {
    const toDelete = count - MAX_ENTRIES;
    db.prepare(
      "DELETE FROM conversation_log WHERE id IN (SELECT id FROM conversation_log ORDER BY id ASC LIMIT ?)"
    ).run(toDelete);
    log.info("Pruned conversation log", { deleted: toDelete, remaining: MAX_ENTRIES });
  }
}

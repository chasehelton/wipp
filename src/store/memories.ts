import { getDb } from "./db.js";

export interface Memory {
  id: number;
  category: string;
  content: string;
  source: string;
  created_at: string;
  last_accessed: string;
}

export function addMemory(category: string, content: string, source = "user"): Memory {
  const db = getDb();
  const stmt = db.prepare(
    "INSERT INTO memories (category, content, source) VALUES (?, ?, ?)"
  );
  const result = stmt.run(category, content, source);
  return db.prepare("SELECT * FROM memories WHERE id = ?").get(result.lastInsertRowid) as Memory;
}

export function searchMemories(query: string, limit = 10): Memory[] {
  const db = getDb();
  return db.prepare(
    "SELECT * FROM memories WHERE content LIKE ? ORDER BY last_accessed DESC LIMIT ?"
  ).all(`%${query}%`, limit) as Memory[];
}

export function getMemorySummary(): string {
  const db = getDb();
  const memories = db.prepare(
    "SELECT category, content FROM memories ORDER BY last_accessed DESC LIMIT 50"
  ).all() as Pick<Memory, "category" | "content">[];

  if (memories.length === 0) return "No memories stored yet.";

  const grouped = new Map<string, string[]>();
  for (const m of memories) {
    const list = grouped.get(m.category) ?? [];
    list.push(m.content);
    grouped.set(m.category, list);
  }

  const lines: string[] = [];
  for (const [category, items] of grouped) {
    lines.push(`[${category}]`);
    for (const item of items) {
      lines.push(`  - ${item}`);
    }
  }
  return lines.join("\n");
}

export function deleteMemory(id: number): boolean {
  const db = getDb();
  const result = db.prepare("DELETE FROM memories WHERE id = ?").run(id);
  return result.changes > 0;
}

export function getAllMemories(): Memory[] {
  const db = getDb();
  return db.prepare("SELECT * FROM memories ORDER BY last_accessed DESC").all() as Memory[];
}

import {
  readdirSync,
  existsSync,
  readFileSync,
  mkdirSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SKILLS_DIR } from "../paths.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("skills");

// Resolve skill directories relative to this file's location in dist/
const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..", "..");
const BUNDLED_SKILLS_DIR = join(PROJECT_ROOT, "skills", "bundled");
const COMMUNITY_SKILLS_DIR = join(PROJECT_ROOT, "skills", "community");

// Global skills shared across agent tools
const GLOBAL_SKILLS_DIR = join(process.env.HOME ?? "~", ".agents", "skills");

export interface SkillInfo {
  name: string;
  location: "bundled" | "project" | "user" | "global";
  path: string;
  description?: string;
}

function parseSkillMd(skillDir: string): string | undefined {
  const skillMdPath = join(skillDir, "SKILL.md");
  if (!existsSync(skillMdPath)) return undefined;

  const content = readFileSync(skillMdPath, "utf-8");
  // Extract description from frontmatter or first paragraph
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (frontmatterMatch) {
    const descMatch = frontmatterMatch[1].match(/description:\s*(.+)/);
    if (descMatch) return descMatch[1].trim();
  }
  // Fallback: first non-heading, non-empty line
  const lines = content.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#") && !trimmed.startsWith("---")) {
      return trimmed.slice(0, 200);
    }
  }
  return undefined;
}

function scanSkillDirectory(
  dir: string,
  location: SkillInfo["location"],
): SkillInfo[] {
  if (!existsSync(dir)) return [];

  const skills: SkillInfo[] = [];
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skillPath = join(dir, entry.name);
      const skillMdPath = join(skillPath, "SKILL.md");
      if (!existsSync(skillMdPath)) continue;

      skills.push({
        name: entry.name,
        location,
        path: skillPath,
        description: parseSkillMd(skillPath),
      });
    }
  } catch (err) {
    log.warn(`Error scanning skill directory: ${dir}`, {
      error: String(err),
    });
  }
  return skills;
}

export function getAllSkills(): SkillInfo[] {
  return [
    ...scanSkillDirectory(BUNDLED_SKILLS_DIR, "bundled"),
    ...scanSkillDirectory(COMMUNITY_SKILLS_DIR, "project"),
    ...scanSkillDirectory(SKILLS_DIR, "user"),
    ...scanSkillDirectory(GLOBAL_SKILLS_DIR, "global"),
  ];
}

export function getSkillDirectories(): string[] {
  const dirs: string[] = [];
  for (const dir of [BUNDLED_SKILLS_DIR, COMMUNITY_SKILLS_DIR, SKILLS_DIR, GLOBAL_SKILLS_DIR]) {
    if (existsSync(dir)) {
      dirs.push(dir);
    }
  }
  return dirs;
}

export function installSkill(slug: string, content: string): string {
  const skillDir = join(COMMUNITY_SKILLS_DIR, slug);
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(join(skillDir, "SKILL.md"), content, "utf-8");
  log.info("Installed skill", { slug, path: skillDir });
  return skillDir;
}

export function uninstallSkill(slug: string): boolean {
  // Check project community dir first, then fall back to user dir
  const communityDir = join(COMMUNITY_SKILLS_DIR, slug);
  if (existsSync(communityDir)) {
    rmSync(communityDir, { recursive: true });
    log.info("Uninstalled skill from community dir", { slug });
    return true;
  }

  const userDir = join(SKILLS_DIR, slug);
  if (existsSync(userDir)) {
    rmSync(userDir, { recursive: true });
    log.info("Uninstalled skill from user dir", { slug });
    return true;
  }

  return false;
}

export interface SkillsShResult {
  name: string;
  slug: string;
  description: string;
  installs: number;
  securityScores?: {
    genAgentTrust?: string;
    socket?: string;
    snyk?: string;
  };
}

export async function searchSkillsSh(
  query: string,
): Promise<SkillsShResult[]> {
  const url = `https://skills.sh/api/search?q=${encodeURIComponent(query)}`;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      log.warn("skills.sh search failed", { status: response.status });
      return [];
    }
    const data = (await response.json()) as { results?: SkillsShResult[] };
    return data.results ?? [];
  } catch (err) {
    log.warn("skills.sh search error", { error: String(err) });
    return [];
  }
}

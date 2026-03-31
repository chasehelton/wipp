import { defineTool } from "@github/copilot-sdk";
import { addMemory, searchMemories, deleteMemory } from "../store/memories.js";
import {
  listWorktrees,
  createWorktree,
  removeWorktree,
} from "../git/worktrees.js";
import { getAllRepos, getRepoByName } from "../git/repos.js";
import {
  getAllSkills,
  searchSkillsSh,
  installSkill,
  uninstallSkill,
} from "./skills.js";
import { linearTools } from "../linear/tools.js";
import { isLinearConfigured } from "../linear/client.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("tools");

// ---------------------------------------------------------------------------
// Worker callbacks — set by WorkerManager when it initializes
// ---------------------------------------------------------------------------

export interface WorkerCallbacks {
  create: (
    repoName: string,
    slug: string,
    taskDescription: string,
    baseBranch?: string,
  ) => Promise<{ workerName: string; worktreePath: string; branch: string }>;
  send: (
    workerName: string,
    prompt: string,
  ) => Promise<{ sent: boolean }>;
  check: (
    workerName: string,
  ) => Promise<{ status: string; lastOutput: string | null }>;
  kill: (workerName: string) => Promise<{ killed: boolean }>;
}

let _workerCallbacks: WorkerCallbacks | null = null;

export function setWorkerCallbacks(callbacks: WorkerCallbacks): void {
  _workerCallbacks = callbacks;
}

// ---------------------------------------------------------------------------
// Notify callback — set when Discord (or another transport) initializes
// ---------------------------------------------------------------------------

let _notifyCallback: ((message: string) => Promise<void>) | null = null;

export function setNotifyCallback(
  callback: (message: string) => Promise<void>,
): void {
  _notifyCallback = callback;
}

// ---------------------------------------------------------------------------
// Memory Tools
// ---------------------------------------------------------------------------

const MEMORY_CATEGORIES = [
  "preference",
  "fact",
  "project",
  "person",
  "routine",
  "codebase",
] as const;

type MemoryCategory = (typeof MEMORY_CATEGORIES)[number];

const rememberTool = defineTool("remember", {
  description:
    "Store a piece of information in long-term memory so it can be recalled later.",
  parameters: {
    type: "object",
    properties: {
      category: {
        type: "string",
        enum: MEMORY_CATEGORIES,
        description:
          "The category of the memory: preference, fact, project, person, routine, or codebase.",
      },
      content: {
        type: "string",
        description: "The content to remember.",
      },
    },
    required: ["category", "content"],
  },
  handler: async (args: { category: MemoryCategory; content: string }) => {
    const memory = addMemory(args.category, args.content, "orchestrator");
    log.info("Memory stored", { id: memory.id, category: args.category });
    return { stored: true, id: memory.id, category: args.category };
  },
});

const recallTool = defineTool("recall", {
  description:
    "Search long-term memory for information matching a query.",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "The search query to find relevant memories.",
      },
      limit: {
        type: "number",
        description: "Maximum number of results to return (default 10).",
      },
    },
    required: ["query"],
  },
  handler: async (args: { query: string; limit?: number }) => {
    const results = searchMemories(args.query, args.limit ?? 10);
    return { count: results.length, memories: results };
  },
});

const forgetTool = defineTool("forget", {
  description: "Delete a memory by its ID.",
  parameters: {
    type: "object",
    properties: {
      id: {
        type: "number",
        description: "The ID of the memory to delete.",
      },
    },
    required: ["id"],
  },
  handler: async (args: { id: number }) => {
    const deleted = deleteMemory(args.id);
    if (deleted) {
      log.info("Memory deleted", { id: args.id });
    }
    return { deleted, id: args.id };
  },
});

// ---------------------------------------------------------------------------
// Worker Tools (stubs — wired via setWorkerCallbacks)
// ---------------------------------------------------------------------------

const createWorkerTool = defineTool("create_worker", {
  description:
    "Create a new Copilot worker in its own git worktree to perform a task autonomously.",
  parameters: {
    type: "object",
    properties: {
      repo_name: {
        type: "string",
        description: "Name of the repository to create the worker in.",
      },
      slug: {
        type: "string",
        description:
          "Short slug used for the worktree branch and directory name.",
      },
      task_description: {
        type: "string",
        description: "A description of the task the worker should perform.",
      },
      base_branch: {
        type: "string",
        description:
          "The branch to base the worktree on (defaults to the repo default branch).",
      },
    },
    required: ["repo_name", "slug", "task_description"],
  },
  handler: async (args: {
    repo_name: string;
    slug: string;
    task_description: string;
    base_branch?: string;
  }) => {
    if (!_workerCallbacks) {
      log.warn("create_worker called but WorkerManager is not initialized");
      return {
        error: "WorkerManager not initialized yet.",
        workerName: null,
        worktreePath: null,
      };
    }
    return _workerCallbacks.create(
      args.repo_name,
      args.slug,
      args.task_description,
      args.base_branch,
    );
  },
});

const sendToWorkerTool = defineTool("send_to_worker", {
  description:
    "Send a prompt to an existing worker (non-blocking). The worker will process it asynchronously.",
  parameters: {
    type: "object",
    properties: {
      worker_name: {
        type: "string",
        description: "The name of the worker to send the prompt to.",
      },
      prompt: {
        type: "string",
        description: "The prompt or instruction to send to the worker.",
      },
    },
    required: ["worker_name", "prompt"],
  },
  handler: async (args: { worker_name: string; prompt: string }) => {
    if (!_workerCallbacks) {
      log.warn("send_to_worker called but WorkerManager is not initialized");
      return { error: "WorkerManager not initialized yet.", sent: false };
    }
    return _workerCallbacks.send(args.worker_name, args.prompt);
  },
});

const checkWorkerTool = defineTool("check_worker", {
  description:
    "Check the current status and last output of a worker.",
  parameters: {
    type: "object",
    properties: {
      worker_name: {
        type: "string",
        description: "The name of the worker to check.",
      },
    },
    required: ["worker_name"],
  },
  handler: async (args: { worker_name: string }) => {
    if (!_workerCallbacks) {
      log.warn("check_worker called but WorkerManager is not initialized");
      return {
        error: "WorkerManager not initialized yet.",
        status: "unknown",
        lastOutput: null,
      };
    }
    return _workerCallbacks.check(args.worker_name);
  },
});

const killWorkerTool = defineTool("kill_worker", {
  description: "Terminate a running worker and clean up its resources.",
  parameters: {
    type: "object",
    properties: {
      worker_name: {
        type: "string",
        description: "The name of the worker to kill.",
      },
    },
    required: ["worker_name"],
  },
  handler: async (args: { worker_name: string }) => {
    if (!_workerCallbacks) {
      log.warn("kill_worker called but WorkerManager is not initialized");
      return { error: "WorkerManager not initialized yet.", killed: false };
    }
    return _workerCallbacks.kill(args.worker_name);
  },
});

// ---------------------------------------------------------------------------
// Git Tools
// ---------------------------------------------------------------------------

const gitWorktreeTool = defineTool("git_worktree", {
  description:
    "Manage git worktrees: create a new worktree, list existing worktrees, or remove one.",
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["create", "list", "remove"],
        description: "The worktree action to perform.",
      },
      repo_name: {
        type: "string",
        description: "Name of the repository.",
      },
      slug: {
        type: "string",
        description:
          "Slug for the worktree (required for create and remove).",
      },
      base_branch: {
        type: "string",
        description:
          "Branch to base the new worktree on (optional, for create).",
      },
      force: {
        type: "boolean",
        description:
          "Force removal even if the worktree has changes (optional, for remove).",
      },
    },
    required: ["action", "repo_name"],
  },
  handler: async (args: {
    action: "create" | "list" | "remove";
    repo_name: string;
    slug?: string;
    base_branch?: string;
    force?: boolean;
  }) => {
    const repo = getRepoByName(args.repo_name);
    if (!repo) {
      return { error: `Repository '${args.repo_name}' not found.` };
    }

    switch (args.action) {
      case "list": {
        const worktrees = listWorktrees(repo.local_path);
        return { worktrees };
      }
      case "create": {
        if (!args.slug) {
          return { error: "slug is required for create action." };
        }
        const worktree = createWorktree(
          repo.local_path,
          args.slug,
          args.base_branch,
        );
        log.info("Worktree created", {
          path: worktree.path,
          branch: worktree.branch,
        });
        return { created: true, worktree };
      }
      case "remove": {
        if (!args.slug) {
          return { error: "slug is required for remove action." };
        }
        // Build the worktree path from the slug — mirrors createWorktree convention
        const worktrees = listWorktrees(repo.local_path);
        const target = worktrees.find((w) => w.branch.endsWith(args.slug!));
        if (!target) {
          return {
            error: `No worktree matching slug '${args.slug}' found.`,
          };
        }
        removeWorktree(repo.local_path, target.path, args.force);
        log.info("Worktree removed", { path: target.path });
        return { removed: true, path: target.path };
      }
    }
  },
});

const listReposTool = defineTool("list_repos", {
  description: "List all registered repositories.",
  parameters: {
    type: "object",
    properties: {},
    required: [],
  },
  handler: async () => {
    const repos = getAllRepos();
    return { count: repos.length, repos };
  },
});

// ---------------------------------------------------------------------------
// Notification Tool
// ---------------------------------------------------------------------------

const notifyUserTool = defineTool("notify_user", {
  description:
    "Send a notification message to the user (e.g. via Discord). Use this to confirm actions or report worker progress.",
  parameters: {
    type: "object",
    properties: {
      message: {
        type: "string",
        description: "The message to send to the user.",
      },
    },
    required: ["message"],
  },
  handler: async (args: { message: string }) => {
    if (_notifyCallback) {
      await _notifyCallback(args.message);
      log.info("User notified", { message: args.message });
      return { notified: true };
    }
    log.warn("notify_user called but no notify callback is set", {
      message: args.message,
    });
    return { notified: false, reason: "No notification transport configured." };
  },
});

// ---------------------------------------------------------------------------
// Skills Tools
// ---------------------------------------------------------------------------

const listSkillsTool = defineTool("list_skills", {
  description: "List all installed Copilot skills.",
  parameters: {
    type: "object",
    properties: {},
    required: [],
  },
  handler: async () => {
    const skills = getAllSkills();
    return { count: skills.length, skills };
  },
});

const searchSkillsTool = defineTool("search_skills", {
  description:
    "Search the skills.sh marketplace for Copilot skills matching a query.",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "The search query.",
      },
    },
    required: ["query"],
  },
  handler: async (args: { query: string }) => {
    const results = await searchSkillsSh(args.query);
    return { count: results.length, results };
  },
});

const installSkillTool = defineTool("install_skill", {
  description:
    "Install a Copilot skill. Always notify the user for confirmation via notify_user before calling this tool.",
  parameters: {
    type: "object",
    properties: {
      slug: {
        type: "string",
        description: "The slug identifier of the skill to install.",
      },
      content: {
        type: "string",
        description: "The skill definition content to write.",
      },
    },
    required: ["slug", "content"],
  },
  handler: async (args: { slug: string; content: string }) => {
    const path = installSkill(args.slug, args.content);
    log.info("Skill installed", { slug: args.slug, path });
    return { installed: true, slug: args.slug, path };
  },
});

const uninstallSkillTool = defineTool("uninstall_skill", {
  description: "Uninstall a Copilot skill by its slug.",
  parameters: {
    type: "object",
    properties: {
      slug: {
        type: "string",
        description: "The slug identifier of the skill to uninstall.",
      },
    },
    required: ["slug"],
  },
  handler: async (args: { slug: string }) => {
    const removed = uninstallSkill(args.slug);
    if (removed) {
      log.info("Skill uninstalled", { slug: args.slug });
    }
    return { uninstalled: removed, slug: args.slug };
  },
});

// ---------------------------------------------------------------------------
// Export all tools as a single array
// ---------------------------------------------------------------------------

export const orchestratorTools = [
  rememberTool,
  recallTool,
  forgetTool,
  createWorkerTool,
  sendToWorkerTool,
  checkWorkerTool,
  killWorkerTool,
  gitWorktreeTool,
  listReposTool,
  notifyUserTool,
  listSkillsTool,
  searchSkillsTool,
  installSkillTool,
  uninstallSkillTool,
  ...(isLinearConfigured() ? linearTools : []),
];

import EventEmitter from "node:events";
import type { SessionConfig } from "@github/copilot-sdk";
import { createLogger } from "../utils/logger.js";

const log = createLogger("status-hooks");

export const statusEmitter = new EventEmitter();

// Extract the hooks type from SessionConfig
type SessionHooks = NonNullable<SessionConfig["hooks"]>;

// Hook input types (not exported from SDK, so we define the shape we use)
interface ToolHookInput {
  toolName: string;
  toolArgs: unknown;
}

// Worker tools are handled by WorkerManager events with more granular detail
const SKIP_TOOLS = new Set([
  "create_worker",
  "send_to_worker",
  "check_worker",
  "kill_worker",
]);

// Map tool names to human-readable labels
const TOOL_LABELS: Record<string, string> = {
  git_worktree: "Managing worktree",
  list_repos: "Listing repositories",
  remember: "Saving to memory",
  recall: "Searching memory",
  forget: "Removing memory",
  notify_user: "Sending notification",
  list_skills: "Listing skills",
  search_skills: "Searching skills",
  install_skill: "Installing skill",
  uninstall_skill: "Uninstalling skill",
  // Linear tools
  linear_list_teams: "Loading Linear teams",
  linear_list_issues: "Listing Linear issues",
  linear_get_issue: "Reading Linear issue",
  linear_create_issue: "Creating Linear issue",
  linear_update_issue: "Updating Linear issue",
  linear_list_projects: "Listing Linear projects",
  linear_create_project: "Creating Linear project",
};

function getLabelForTool(toolName: string): string | null {
  if (SKIP_TOOLS.has(toolName)) return null;
  if (TOOL_LABELS[toolName]) return TOOL_LABELS[toolName];

  // Handle MCP/GitHub tool names (e.g., "mcp__github__create_pull_request")
  const lower = toolName.toLowerCase();
  if (lower.includes("pull_request") || lower.includes("pull-request"))
    return "Managing pull request";
  if (lower.includes("issue")) return "Working with GitHub issues";
  if (lower.includes("commit")) return "Working with commits";
  if (lower.includes("branch")) return "Managing branches";
  if (lower.includes("search")) return "Searching GitHub";
  if (lower.includes("repository") || lower.includes("repo"))
    return "Checking repository";
  if (lower.includes("file") || lower.includes("content"))
    return "Reading file contents";

  // Unknown tool — skip rather than show raw names
  log.debug("Unknown tool, skipping status", { toolName });
  return null;
}

export function createStatusHooks(): SessionHooks {
  return {
    onPreToolUse: (
      input: ToolHookInput,
      _invocation: { sessionId: string },
    ) => {
      const label = getLabelForTool(input.toolName);
      if (label) {
        statusEmitter.emit("tool:start", {
          toolName: input.toolName,
          label,
        });
      }
      // Return void — don't suppress execution
    },
    onPostToolUse: (
      input: ToolHookInput,
      _invocation: { sessionId: string },
    ) => {
      const label = getLabelForTool(input.toolName);
      if (label) {
        statusEmitter.emit("tool:complete", {
          toolName: input.toolName,
          label,
        });
      }
    },
  };
}

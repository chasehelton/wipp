import { defineTool } from "@github/copilot-sdk";
import { linearGraphQL } from "./client.js";
import {
  LIST_TEAMS,
  LIST_ISSUES,
  LIST_ISSUES_BY_TEAM,
  GET_ISSUE,
  CREATE_ISSUE,
  UPDATE_ISSUE,
  LIST_PROJECTS,
  CREATE_PROJECT,
  type TeamsResponse,
  type IssuesResponse,
  type IssueResponse,
  type IssueCreateResponse,
  type IssueUpdateResponse,
  type ProjectsResponse,
  type ProjectCreateResponse,
} from "./queries.js";

// ---------------------------------------------------------------------------
// Linear Tools — exposed to the orchestrator
// ---------------------------------------------------------------------------

const linearListTeamsTool = defineTool("linear_list_teams", {
  description:
    "List all Linear teams and their workflow states. Use this to discover team IDs needed for creating issues.",
  parameters: {
    type: "object",
    properties: {},
    required: [],
  },
  handler: async () => {
    const data = await linearGraphQL<TeamsResponse>(LIST_TEAMS);
    return {
      count: data.teams.nodes.length,
      teams: data.teams.nodes.map((t) => ({
        id: t.id,
        name: t.name,
        key: t.key,
        states: t.states.nodes.map((s) => ({
          id: s.id,
          name: s.name,
          type: s.type,
        })),
      })),
    };
  },
});

const linearListIssuesTool = defineTool("linear_list_issues", {
  description:
    "List Linear issues, optionally filtered by team. Returns the most recently updated issues.",
  parameters: {
    type: "object",
    properties: {
      team_id: {
        type: "string",
        description: "Filter issues to a specific team ID.",
      },
      limit: {
        type: "number",
        description: "Maximum number of issues to return (default 25).",
      },
    },
    required: [],
  },
  handler: async (args: { team_id?: string; limit?: number }) => {
    const variables: Record<string, unknown> = {
      first: args.limit ?? 25,
    };

    const query = args.team_id ? LIST_ISSUES_BY_TEAM : LIST_ISSUES;
    if (args.team_id) variables.teamId = args.team_id;

    const data = await linearGraphQL<IssuesResponse>(query, variables);
    return {
      count: data.issues.nodes.length,
      issues: data.issues.nodes,
    };
  },
});

const linearGetIssueTool = defineTool("linear_get_issue", {
  description:
    "Get a specific Linear issue by its ID or identifier (e.g., 'ENG-123').",
  parameters: {
    type: "object",
    properties: {
      issue_id: {
        type: "string",
        description:
          "The issue ID (UUID) or identifier (e.g., 'ENG-123').",
      },
    },
    required: ["issue_id"],
  },
  handler: async (args: { issue_id: string }) => {
    const data = await linearGraphQL<IssueResponse>(GET_ISSUE, {
      issueId: args.issue_id,
    });
    return { issue: data.issue };
  },
});

const linearCreateIssueTool = defineTool("linear_create_issue", {
  description:
    "Create a new issue in Linear. Requires a title and team ID. Use linear_list_teams first to find team IDs.",
  parameters: {
    type: "object",
    properties: {
      title: {
        type: "string",
        description: "The title of the issue.",
      },
      team_id: {
        type: "string",
        description: "The team ID to create the issue in.",
      },
      description: {
        type: "string",
        description: "Issue description in Markdown format.",
      },
      project_id: {
        type: "string",
        description: "Optional project ID to associate the issue with.",
      },
      state_id: {
        type: "string",
        description: "Optional initial state ID for the issue.",
      },
    },
    required: ["title", "team_id"],
  },
  handler: async (args: {
    title: string;
    team_id: string;
    description?: string;
    project_id?: string;
    state_id?: string;
  }) => {
    const input: Record<string, unknown> = {
      title: args.title,
      teamId: args.team_id,
    };
    if (args.description) input.description = args.description;
    if (args.project_id) input.projectId = args.project_id;
    if (args.state_id) input.stateId = args.state_id;

    const data = await linearGraphQL<IssueCreateResponse>(CREATE_ISSUE, {
      input,
    });
    return {
      success: data.issueCreate.success,
      issue: data.issueCreate.issue,
    };
  },
});

const linearUpdateIssueTool = defineTool("linear_update_issue", {
  description:
    "Update a Linear issue's title, description, or state. Use linear_list_teams to find valid state IDs.",
  parameters: {
    type: "object",
    properties: {
      issue_id: {
        type: "string",
        description:
          "The issue ID (UUID) or identifier (e.g., 'ENG-123').",
      },
      title: {
        type: "string",
        description: "New title for the issue.",
      },
      description: {
        type: "string",
        description: "New description for the issue.",
      },
      state_id: {
        type: "string",
        description: "New state ID to transition the issue to.",
      },
    },
    required: ["issue_id"],
  },
  handler: async (args: {
    issue_id: string;
    title?: string;
    description?: string;
    state_id?: string;
  }) => {
    const input: Record<string, unknown> = {};
    if (args.title) input.title = args.title;
    if (args.description) input.description = args.description;
    if (args.state_id) input.stateId = args.state_id;

    if (Object.keys(input).length === 0) {
      return {
        error: "Must provide at least one of: title, description, state_id.",
        success: false,
      };
    }

    const data = await linearGraphQL<IssueUpdateResponse>(UPDATE_ISSUE, {
      id: args.issue_id,
      input,
    });
    return {
      success: data.issueUpdate.success,
      issue: data.issueUpdate.issue,
    };
  },
});

const linearListProjectsTool = defineTool("linear_list_projects", {
  description: "List Linear projects.",
  parameters: {
    type: "object",
    properties: {
      limit: {
        type: "number",
        description: "Maximum number of projects to return (default 25).",
      },
    },
    required: [],
  },
  handler: async (args: { limit?: number }) => {
    const data = await linearGraphQL<ProjectsResponse>(LIST_PROJECTS, {
      first: args.limit ?? 25,
    });
    return {
      count: data.projects.nodes.length,
      projects: data.projects.nodes,
    };
  },
});

const linearCreateProjectTool = defineTool("linear_create_project", {
  description:
    "Create a new Linear project. Requires a name and at least one team ID.",
  parameters: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "The name of the project.",
      },
      team_ids: {
        type: "array",
        items: { type: "string" },
        description: "Array of team IDs to associate with the project.",
      },
      description: {
        type: "string",
        description: "Project description.",
      },
    },
    required: ["name", "team_ids"],
  },
  handler: async (args: {
    name: string;
    team_ids: string[];
    description?: string;
  }) => {
    const input: Record<string, unknown> = {
      name: args.name,
      teamIds: args.team_ids,
    };
    if (args.description) input.description = args.description;

    const data = await linearGraphQL<ProjectCreateResponse>(CREATE_PROJECT, {
      input,
    });
    return {
      success: data.projectCreate.success,
      project: data.projectCreate.project,
    };
  },
});

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const linearTools = [
  linearListTeamsTool,
  linearListIssuesTool,
  linearGetIssueTool,
  linearCreateIssueTool,
  linearUpdateIssueTool,
  linearListProjectsTool,
  linearCreateProjectTool,
];

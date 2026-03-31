// ---------------------------------------------------------------------------
// GraphQL queries and mutations for the Linear API
// ---------------------------------------------------------------------------

// -- Types ------------------------------------------------------------------

export interface LinearTeam {
  id: string;
  name: string;
  key: string;
  states: { nodes: LinearState[] };
}

export interface LinearState {
  id: string;
  name: string;
  type: string;
}

export interface LinearIssue {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  priority: number;
  url: string;
  state: { id: string; name: string; type: string };
  assignee: { id: string; name: string } | null;
  project: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface LinearProject {
  id: string;
  name: string;
  description: string | null;
  state: string;
  url: string;
  teams: { nodes: Array<{ id: string; name: string }> };
  issues: { nodes: Array<{ id: string; identifier: string; title: string }> };
}

// -- Response wrappers ------------------------------------------------------

export interface TeamsResponse {
  teams: { nodes: LinearTeam[] };
}

export interface IssuesResponse {
  issues: { nodes: LinearIssue[] };
}

export interface IssueResponse {
  issue: LinearIssue;
}

export interface IssueCreateResponse {
  issueCreate: { success: boolean; issue: LinearIssue };
}

export interface IssueUpdateResponse {
  issueUpdate: { success: boolean; issue: LinearIssue };
}

export interface ProjectsResponse {
  projects: { nodes: LinearProject[] };
}

export interface ProjectCreateResponse {
  projectCreate: { success: boolean; project: LinearProject };
}

// -- Queries ----------------------------------------------------------------

export const LIST_TEAMS = `
  query ListTeams {
    teams {
      nodes {
        id
        name
        key
        states {
          nodes {
            id
            name
            type
          }
        }
      }
    }
  }
`;

export const LIST_ISSUES = `
  query ListIssues($first: Int) {
    issues(
      first: $first
      orderBy: updatedAt
    ) {
      nodes {
        id
        identifier
        title
        description
        priority
        url
        state { id name type }
        assignee { id name }
        project { id name }
        createdAt
        updatedAt
      }
    }
  }
`;

export const LIST_ISSUES_BY_TEAM = `
  query ListIssuesByTeam($teamId: String!, $first: Int) {
    issues(
      filter: { team: { id: { eq: $teamId } } }
      first: $first
      orderBy: updatedAt
    ) {
      nodes {
        id
        identifier
        title
        description
        priority
        url
        state { id name type }
        assignee { id name }
        project { id name }
        createdAt
        updatedAt
      }
    }
  }
`;

export const GET_ISSUE = `
  query GetIssue($issueId: String!) {
    issue(id: $issueId) {
      id
      identifier
      title
      description
      priority
      url
      state { id name type }
      assignee { id name }
      project { id name }
      createdAt
      updatedAt
    }
  }
`;

export const CREATE_ISSUE = `
  mutation IssueCreate($input: IssueCreateInput!) {
    issueCreate(input: $input) {
      success
      issue {
        id
        identifier
        title
        description
        priority
        url
        state { id name type }
        assignee { id name }
        project { id name }
        createdAt
        updatedAt
      }
    }
  }
`;

export const UPDATE_ISSUE = `
  mutation IssueUpdate($id: String!, $input: IssueUpdateInput!) {
    issueUpdate(id: $id, input: $input) {
      success
      issue {
        id
        identifier
        title
        description
        priority
        url
        state { id name type }
        assignee { id name }
        project { id name }
        createdAt
        updatedAt
      }
    }
  }
`;

export const LIST_PROJECTS = `
  query ListProjects($first: Int) {
    projects(first: $first, orderBy: updatedAt) {
      nodes {
        id
        name
        description
        state
        url
        teams { nodes { id name } }
        issues { nodes { id identifier title } }
      }
    }
  }
`;

export const CREATE_PROJECT = `
  mutation ProjectCreate($input: ProjectCreateInput!) {
    projectCreate(input: $input) {
      success
      project {
        id
        name
        description
        state
        url
        teams { nodes { id name } }
        issues { nodes { id identifier title } }
      }
    }
  }
`;

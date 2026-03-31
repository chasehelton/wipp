import { loadConfig } from "../config.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("linear");

const LINEAR_API_URL = "https://api.linear.app/graphql";

export interface LinearGraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string; extensions?: Record<string, unknown> }>;
}

export async function linearGraphQL<T>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const config = loadConfig();
  if (!config.LINEAR_API_KEY) {
    throw new Error("LINEAR_API_KEY is not configured.");
  }

  const response = await fetch(LINEAR_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: config.LINEAR_API_KEY,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    const body = await response.text();
    log.error("Linear API HTTP error", { status: response.status, body });
    throw new Error(`Linear API returned ${response.status}: ${body}`);
  }

  const result = (await response.json()) as LinearGraphQLResponse<T>;

  if (result.errors?.length) {
    const msg = result.errors.map((e) => e.message).join("; ");
    log.error("Linear GraphQL errors", { errors: result.errors });
    throw new Error(`Linear GraphQL error: ${msg}`);
  }

  if (!result.data) {
    throw new Error("Linear API returned no data.");
  }

  return result.data;
}

export function isLinearConfigured(): boolean {
  const config = loadConfig();
  return !!config.LINEAR_API_KEY;
}

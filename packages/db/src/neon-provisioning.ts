// ── Neon API Client for Multi-Tenant Database Provisioning ──────────
// Uses Neon API: https://api-docs.neon.tech/reference/getting-started
// Env: NEON_API_KEY

const NEON_API_BASE = "https://console.neon.tech/api/v2";

export interface NeonProject {
  id: string;
  name: string;
  connectionUri: string;
  region: string;
  createdAt: string;
}

export interface NeonBranch {
  id: string;
  connectionUri: string;
}

interface NeonApiError {
  message: string;
  code: string;
}

function getApiKey(): string {
  const key = process.env["NEON_API_KEY"];
  if (!key) {
    throw new Error(
      "NEON_API_KEY is required. Set it in your environment variables.",
    );
  }
  return key;
}

async function neonFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const apiKey = getApiKey();
  const url = `${NEON_API_BASE}${path}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    let errorMessage = `Neon API error: ${response.status} ${response.statusText}`;
    try {
      const errorBody = (await response.json()) as NeonApiError;
      if (errorBody.message) {
        errorMessage = `Neon API error: ${errorBody.message} (${response.status})`;
      }
    } catch {
      // Could not parse error body -- use default message
    }
    throw new Error(errorMessage);
  }

  // DELETE returns 204 No Content
  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

// ── Project Operations ──────────────────────────────────────────────

interface NeonCreateProjectResponse {
  project: {
    id: string;
    name: string;
    region_id: string;
    created_at: string;
  };
  connection_uris: Array<{
    connection_uri: string;
  }>;
}

interface NeonGetProjectResponse {
  project: {
    id: string;
    name: string;
    region_id: string;
    created_at: string;
  };
}

interface NeonListProjectsResponse {
  projects: Array<{
    id: string;
    name: string;
    region_id: string;
    created_at: string;
  }>;
}

interface NeonConnectionUriResponse {
  uri: string;
}

interface NeonCreateBranchResponse {
  branch: {
    id: string;
    name: string;
  };
  connection_uris: Array<{
    connection_uri: string;
  }>;
}

/**
 * Create a new Neon project for a tenant.
 * Each tenant gets a fully isolated PostgreSQL database.
 */
export async function createTenantProject(
  tenantId: string,
  region?: string,
): Promise<NeonProject> {
  const data = await neonFetch<NeonCreateProjectResponse>("/projects", {
    method: "POST",
    body: JSON.stringify({
      project: {
        name: `tenant-${tenantId}`,
        region_id: region ?? "aws-us-east-2",
        pg_version: 16,
      },
    }),
  });

  const connectionUri = data.connection_uris[0]?.connection_uri ?? "";

  return {
    id: data.project.id,
    name: data.project.name,
    connectionUri,
    region: data.project.region_id,
    createdAt: data.project.created_at,
  };
}

/**
 * Delete a tenant's Neon project (on account deletion).
 * This is irreversible -- all data is destroyed.
 */
export async function deleteTenantProject(projectId: string): Promise<void> {
  await neonFetch<undefined>(`/projects/${projectId}`, {
    method: "DELETE",
  });
}

/**
 * Get project details for a specific Neon project.
 */
export async function getTenantProject(
  projectId: string,
): Promise<NeonProject> {
  const data = await neonFetch<NeonGetProjectResponse>(
    `/projects/${projectId}`,
  );

  // Fetch the connection URI separately
  let connectionUri = "";
  try {
    const uriData = await neonFetch<NeonConnectionUriResponse>(
      `/projects/${projectId}/connection_uri`,
    );
    connectionUri = uriData.uri;
  } catch {
    // Connection URI might not be available in all states
  }

  return {
    id: data.project.id,
    name: data.project.name,
    connectionUri,
    region: data.project.region_id,
    createdAt: data.project.created_at,
  };
}

/**
 * List all tenant projects in the Neon account.
 */
export async function listTenantProjects(): Promise<NeonProject[]> {
  const data = await neonFetch<NeonListProjectsResponse>("/projects");

  return data.projects.map((p) => ({
    id: p.id,
    name: p.name,
    connectionUri: "", // Not included in list response
    region: p.region_id,
    createdAt: p.created_at,
  }));
}

/**
 * Get the connection string for a tenant's Neon project.
 */
export async function getTenantConnectionString(
  projectId: string,
): Promise<string> {
  const data = await neonFetch<NeonConnectionUriResponse>(
    `/projects/${projectId}/connection_uri`,
  );
  return data.uri;
}

/**
 * Create a branch on a tenant's project (for staging/testing environments).
 * Neon branches are copy-on-write -- instant and cost-efficient.
 */
export async function createProjectBranch(
  projectId: string,
  branchName: string,
): Promise<NeonBranch> {
  const data = await neonFetch<NeonCreateBranchResponse>(
    `/projects/${projectId}/branches`,
    {
      method: "POST",
      body: JSON.stringify({
        branch: {
          name: branchName,
        },
        endpoints: [
          {
            type: "read_write",
          },
        ],
      }),
    },
  );

  return {
    id: data.branch.id,
    connectionUri: data.connection_uris[0]?.connection_uri ?? "",
  };
}

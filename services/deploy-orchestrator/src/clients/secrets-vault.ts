import { type SecretsBundle, SecretsBundleSchema } from "../schemas";
import type { FetchLike } from "./fetch";

/**
 * Thin HTTP client wrapper for services/secrets-vault (Wave 2 Agent 4 — sibling slice).
 * Agent 4 owns the real implementation. We define the contract we need from
 * it here so the orchestrator has a stable interface to mock against during
 * tests, and the real client only needs to match this shape at integration
 * time.
 *
 * Documented endpoint:
 *   GET /tenants/:tenantId/projects/:projectId/bundle
 *     → { env: Record<string,string>, secrets: Record<string,string> }
 */
export interface SecretsVaultClient {
  fetchBundle(input: {
    tenantId: string;
    projectId: string;
    sha: string;
  }): Promise<SecretsBundle>;
}

export interface SecretsVaultHttpConfig {
  baseUrl: string;
  authToken: string;
  fetch?: FetchLike;
}

export function createSecretsVaultHttpClient(
  cfg: SecretsVaultHttpConfig,
): SecretsVaultClient {
  const f = cfg.fetch ?? fetch;
  return {
    async fetchBundle({ tenantId, projectId, sha }) {
      const url =
        `${cfg.baseUrl}/tenants/${encodeURIComponent(tenantId)}` +
        `/projects/${encodeURIComponent(projectId)}/bundle` +
        `?sha=${encodeURIComponent(sha)}`;
      const res = await f(url, {
        headers: {
          Authorization: `Bearer ${cfg.authToken}`,
          Accept: "application/json",
        },
      });
      if (!res.ok) {
        throw new Error(`secrets-vault fetch failed: ${res.status}`);
      }
      return SecretsBundleSchema.parse(await res.json());
    },
  };
}

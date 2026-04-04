import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test";
import {
  deployToCloudflarePages,
  createProject,
  setCustomDomain,
  getDeploymentStatus,
  CloudflareDeployError,
  DeployConfigSchema,
  DeployResultSchema,
  DeploymentStatusSchema,
} from "./cloudflare-pages";

// ── Mock Setup ──────────────────────────────────────────────────────

const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };

function mockEnv(): void {
  process.env.CLOUDFLARE_API_TOKEN = "test-api-token-123";
  process.env.CLOUDFLARE_ACCOUNT_ID = "test-account-id-456";
}

function restoreEnv(): void {
  process.env.CLOUDFLARE_API_TOKEN = originalEnv.CLOUDFLARE_API_TOKEN;
  process.env.CLOUDFLARE_ACCOUNT_ID = originalEnv.CLOUDFLARE_ACCOUNT_ID;
}

function mockFetch(response: unknown, status: number = 200): void {
  globalThis.fetch = mock(async () => {
    return new Response(JSON.stringify(response), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
}

function getLastFetchCall(): { url: string; options: RequestInit } | null {
  const mockedFetch = globalThis.fetch as ReturnType<typeof mock>;
  if (mockedFetch.mock.calls.length === 0) return null;
  const lastCall = mockedFetch.mock.calls[mockedFetch.mock.calls.length - 1];
  return {
    url: lastCall[0] as string,
    options: (lastCall[1] ?? {}) as RequestInit,
  };
}

beforeEach(() => {
  mockEnv();
});

afterEach(() => {
  restoreEnv();
  globalThis.fetch = originalFetch;
});

// ── Schema Tests ────────────────────────────────────────────────────

describe("Zod Schemas", () => {
  describe("DeployConfigSchema", () => {
    test("validates a valid config", () => {
      const config = {
        projectName: "my-site",
        files: { "index.html": "<html></html>", "app.js": "console.log('hi')" },
      };
      const result = DeployConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    test("rejects invalid project names", () => {
      const config = {
        projectName: "-bad-name-",
        files: {},
      };
      const result = DeployConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    test("rejects empty project names", () => {
      const result = DeployConfigSchema.safeParse({ projectName: "", files: {} });
      expect(result.success).toBe(false);
    });

    test("accepts optional branch", () => {
      const config = {
        projectName: "my-site",
        files: { "index.html": "test" },
        branch: "preview",
      };
      const result = DeployConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });
  });

  describe("DeployResultSchema", () => {
    test("validates a valid result", () => {
      const result = DeployResultSchema.safeParse({
        id: "abc123",
        url: "https://my-site.pages.dev",
        projectName: "my-site",
        environment: "production",
        createdAt: "2026-01-01T00:00:00Z",
      });
      expect(result.success).toBe(true);
    });

    test("rejects invalid environment", () => {
      const result = DeployResultSchema.safeParse({
        id: "abc123",
        url: "https://my-site.pages.dev",
        projectName: "my-site",
        environment: "staging",
        createdAt: "2026-01-01T00:00:00Z",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("DeploymentStatusSchema", () => {
    test("validates valid status", () => {
      const result = DeploymentStatusSchema.safeParse({
        id: "abc",
        projectName: "test",
        status: "active",
        url: "https://test.pages.dev",
        createdAt: "2026-01-01T00:00:00Z",
        modifiedAt: "2026-01-01T00:00:00Z",
      });
      expect(result.success).toBe(true);
    });

    test("accepts all valid status values", () => {
      for (const status of ["active", "idle", "building", "failure"]) {
        const result = DeploymentStatusSchema.safeParse({
          id: "abc",
          projectName: "test",
          status,
          createdAt: "2026-01-01",
          modifiedAt: "2026-01-01",
        });
        expect(result.success).toBe(true);
      }
    });
  });
});

// ── createProject Tests ─────────────────────────────────────────────

describe("createProject", () => {
  test("sends correct request to Cloudflare API", async () => {
    mockFetch({
      success: true,
      errors: [],
      messages: [],
      result: { name: "my-site", subdomain: "my-site.pages.dev" },
    });

    const result = await createProject("my-site");

    const call = getLastFetchCall();
    expect(call).not.toBeNull();
    expect(call!.url).toContain("/accounts/test-account-id-456/pages/projects");
    expect(call!.options.method).toBe("POST");
    expect(call!.options.headers).toHaveProperty("Authorization", "Bearer test-api-token-123");

    const body = JSON.parse(call!.options.body as string);
    expect(body.name).toBe("my-site");
    expect(body.production_branch).toBe("main");

    expect(result.projectName).toBe("my-site");
    expect(result.subdomain).toBe("my-site.pages.dev");
  });

  test("sanitizes project name", async () => {
    mockFetch({
      success: true,
      errors: [],
      messages: [],
      result: { name: "my-cool-site", subdomain: "my-cool-site.pages.dev" },
    });

    await createProject("My Cool Site!!!");

    const call = getLastFetchCall();
    const body = JSON.parse(call!.options.body as string);
    expect(body.name).toBe("my-cool-site");
  });

  test("throws on API error", async () => {
    mockFetch(
      { success: false, errors: [{ code: 1000, message: "Project already exists" }], messages: [], result: null },
      200,
    );

    await expect(createProject("existing-site")).rejects.toThrow(CloudflareDeployError);
  });

  test("throws on HTTP error", async () => {
    globalThis.fetch = mock(async () => {
      return new Response("Unauthorized", { status: 401 });
    }) as typeof fetch;

    await expect(createProject("test")).rejects.toThrow(CloudflareDeployError);
  });

  test("throws when env vars are missing", async () => {
    delete process.env.CLOUDFLARE_API_TOKEN;

    await expect(createProject("test")).rejects.toThrow();
  });
});

// ── deployToCloudflarePages Tests ───────────────────────────────────

describe("deployToCloudflarePages", () => {
  test("sends multipart form data with files", async () => {
    mockFetch({
      success: true,
      errors: [],
      messages: [],
      result: {
        id: "deploy-123",
        url: "https://abc123.my-site.pages.dev",
        environment: "production",
        created_on: "2026-01-01T00:00:00Z",
      },
    });

    const result = await deployToCloudflarePages({
      projectName: "my-site",
      files: {
        "index.html": "<html><body>Hello</body></html>",
        "app.js": "console.log('deployed');",
      },
    });

    const call = getLastFetchCall();
    expect(call!.url).toContain("/accounts/test-account-id-456/pages/projects/my-site/deployments");
    expect(call!.options.method).toBe("POST");

    // Body should be FormData
    expect(call!.options.body).toBeInstanceOf(FormData);

    expect(result.id).toBe("deploy-123");
    expect(result.url).toBe("https://abc123.my-site.pages.dev");
    expect(result.environment).toBe("production");
    expect(result.projectName).toBe("my-site");
  });

  test("includes branch in form data for preview deploys", async () => {
    mockFetch({
      success: true,
      errors: [],
      messages: [],
      result: {
        id: "deploy-456",
        url: "https://preview.my-site.pages.dev",
        environment: "preview",
        created_on: "2026-01-01T00:00:00Z",
      },
    });

    const result = await deployToCloudflarePages({
      projectName: "my-site",
      files: { "index.html": "test" },
      branch: "staging",
    });

    const call = getLastFetchCall();
    const formData = call!.options.body as FormData;
    expect(formData.get("branch")).toBe("staging");

    expect(result.environment).toBe("preview");
  });

  test("strips leading slash from file paths", async () => {
    mockFetch({
      success: true,
      errors: [],
      messages: [],
      result: {
        id: "deploy-789",
        url: "https://test.pages.dev",
        environment: "production",
        created_on: "2026-01-01T00:00:00Z",
      },
    });

    await deployToCloudflarePages({
      projectName: "my-site",
      files: { "/index.html": "test" },
    });

    const call = getLastFetchCall();
    const formData = call!.options.body as FormData;
    // Should normalize to "index.html" not "/index.html"
    expect(formData.has("index.html")).toBe(true);
  });

  test("validates input with Zod", async () => {
    await expect(
      deployToCloudflarePages({
        projectName: "",
        files: {},
      } as never),
    ).rejects.toThrow();
  });
});

// ── setCustomDomain Tests ───────────────────────────────────────────

describe("setCustomDomain", () => {
  test("sends correct API request", async () => {
    mockFetch({
      success: true,
      errors: [],
      messages: [],
      result: { id: "domain-1", name: "example.com" },
    });

    await setCustomDomain("my-site", "example.com");

    const call = getLastFetchCall();
    expect(call!.url).toContain("/pages/projects/my-site/domains");
    expect(call!.options.method).toBe("POST");

    const body = JSON.parse(call!.options.body as string);
    expect(body.name).toBe("example.com");
  });

  test("rejects invalid domain", async () => {
    await expect(setCustomDomain("my-site", "not a domain!!")).rejects.toThrow();
  });
});

// ── getDeploymentStatus Tests ───────────────────────────────────────

describe("getDeploymentStatus", () => {
  test("fetches deployment status", async () => {
    mockFetch({
      success: true,
      errors: [],
      messages: [],
      result: {
        id: "deploy-123",
        project_name: "my-site",
        latest_stage: { name: "deploy", status: "active" },
        url: "https://my-site.pages.dev",
        created_on: "2026-01-01T00:00:00Z",
        modified_on: "2026-01-01T00:01:00Z",
      },
    });

    const status = await getDeploymentStatus("deploy-123", "my-site");

    expect(status.id).toBe("deploy-123");
    expect(status.projectName).toBe("my-site");
    expect(status.status).toBe("active");
    expect(status.url).toBe("https://my-site.pages.dev");

    const call = getLastFetchCall();
    expect(call!.url).toContain("/pages/projects/my-site/deployments/deploy-123");
  });

  test("throws when projectName is missing", async () => {
    await expect(getDeploymentStatus("deploy-123")).rejects.toThrow(CloudflareDeployError);
  });
});

// ── CloudflareDeployError Tests ─────────────────────────────────────

describe("CloudflareDeployError", () => {
  test("has correct name and properties", () => {
    const error = new CloudflareDeployError("test error", 404);
    expect(error.name).toBe("CloudflareDeployError");
    expect(error.message).toBe("test error");
    expect(error.statusCode).toBe(404);
    expect(error instanceof Error).toBe(true);
  });
});

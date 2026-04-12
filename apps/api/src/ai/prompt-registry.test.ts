// ── Prompt Registry Tests (Hook 5) ────────────────────────────────────

import { describe, test, expect, beforeEach } from "bun:test";
import { eq } from "drizzle-orm";
import { db, prompts } from "@back-to-the-future/db";
import {
  registerPrompt,
  getPrompt,
  getPromptVersion,
  listPromptVersions,
  activatePromptVersion,
  renderPrompt,
  renderPromptByKey,
} from "./prompt-registry";

describe("Prompt registry", () => {
  beforeEach(async () => {
    await db.delete(prompts);
  });

  test("registerPrompt creates v1 and marks current", async () => {
    const r = await registerPrompt({
      key: "ai.site_builder.system",
      template: "You are a website builder. Build for {{user}}.",
      description: "Initial system prompt",
    });
    expect(r.version).toBe(1);
    expect(r.isCurrent).toBe(true);
  });

  test("subsequent registers auto-bump version + demote prior current", async () => {
    await registerPrompt({ key: "ai.test", template: "v1" });
    const v2 = await registerPrompt({ key: "ai.test", template: "v2" });
    expect(v2.version).toBe(2);
    expect(v2.isCurrent).toBe(true);

    const all = await db
      .select()
      .from(prompts)
      .where(eq(prompts.key, "ai.test"));
    expect(all).toHaveLength(2);
    const currents = all.filter((r) => r.isCurrent);
    expect(currents).toHaveLength(1);
    expect(currents[0]?.version).toBe(2);
  });

  test("getPrompt returns the current version", async () => {
    await registerPrompt({ key: "ai.curr", template: "old" });
    await registerPrompt({ key: "ai.curr", template: "new" });

    const cur = await getPrompt("ai.curr");
    expect(cur).toBeDefined();
    expect(cur!.template).toBe("new");
    expect(cur!.version).toBe(2);
  });

  test("getPromptVersion fetches a specific version", async () => {
    await registerPrompt({ key: "ai.history", template: "alpha" });
    await registerPrompt({ key: "ai.history", template: "beta" });

    const v1 = await getPromptVersion("ai.history", 1);
    expect(v1?.template).toBe("alpha");
    const v2 = await getPromptVersion("ai.history", 2);
    expect(v2?.template).toBe("beta");
  });

  test("listPromptVersions returns newest first", async () => {
    await registerPrompt({ key: "ai.list", template: "v1" });
    await registerPrompt({ key: "ai.list", template: "v2" });
    await registerPrompt({ key: "ai.list", template: "v3" });

    const versions = await listPromptVersions("ai.list");
    expect(versions).toHaveLength(3);
    expect(versions[0]!.version).toBe(3);
    expect(versions[2]!.version).toBe(1);
  });

  test("activatePromptVersion rolls back to an older version", async () => {
    await registerPrompt({ key: "ai.rollback", template: "v1" });
    await registerPrompt({ key: "ai.rollback", template: "v2" });

    await activatePromptVersion("ai.rollback", 1);
    const cur = await getPrompt("ai.rollback");
    expect(cur!.version).toBe(1);
    expect(cur!.template).toBe("v1");
  });

  test("activatePromptVersion throws on missing version", async () => {
    await registerPrompt({ key: "ai.missing", template: "v1" });
    await expect(activatePromptVersion("ai.missing", 99)).rejects.toThrow();
  });

  test("renderPrompt substitutes named placeholders", () => {
    const out = renderPrompt("Hello {{name}}, today is {{day}}.", {
      name: "Craig",
      day: "Monday",
    });
    expect(out).toBe("Hello Craig, today is Monday.");
  });

  test("renderPrompt throws on missing variable", () => {
    expect(() =>
      renderPrompt("Hello {{name}}", { other: "x" }),
    ).toThrow(/missing variable "name"/);
  });

  test("renderPromptByKey renders the current prompt", async () => {
    await registerPrompt({
      key: "ai.greeting",
      template: "Welcome {{user}} to Crontech",
    });
    const out = await renderPromptByKey("ai.greeting", { user: "Craig" });
    expect(out.rendered).toBe("Welcome Craig to Crontech");
    expect(out.version).toBe(1);
  });

  test("invalid keys are rejected", async () => {
    await expect(
      registerPrompt({ key: "Invalid Key!", template: "x" }),
    ).rejects.toThrow();
    await expect(getPrompt("Invalid Key!")).rejects.toThrow();
  });

  test("setCurrent: false leaves the active prompt unchanged", async () => {
    await registerPrompt({ key: "ai.draft", template: "v1" });
    await registerPrompt({
      key: "ai.draft",
      template: "v2-draft",
      setCurrent: false,
    });
    const cur = await getPrompt("ai.draft");
    expect(cur?.version).toBe(1);
    expect(cur?.template).toBe("v1");
  });
});

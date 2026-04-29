// ── /docs/api-reference/ai-and-chat — AI & Chat reference ──────────
//
// Documents the `ai.*` and `chat.*` routers as they ship today, plus
// the three-tier compute routing they share. Procedure names pulled
// from apps/api/src/trpc/procedures/{ai,chat}.ts.

import type { JSX } from "solid-js";
import { SEOHead } from "../../../components/SEOHead";
import { Callout, DocsArticle, KeyList } from "../../../components/docs/DocsArticle";

export default function AiAndChatReference(): JSX.Element {
  return (
    <>
      <SEOHead
        title="API Reference — AI & Chat"
        description="tRPC ai and chat routers: site builder generate / save / version, conversations, provider BYOK, usage stats. Three-tier compute routing picks client / edge / cloud per call."
        path="/docs/api-reference/ai-and-chat"
      />

      <DocsArticle
        eyebrow="API Reference · AI & Chat"
        title="AI & Chat procedures"
        subtitle="Two routers cover Crontech's AI surface: ai.siteBuilder.* generates and persists PageLayouts, and chat.* runs conversational flows with per-user provider keys. Both share the three-tier compute router."
        readTime="5 min"
        updated="April 2026"
        nextStep={{
          label: "Support procedures",
          href: "/docs/api-reference/support",
          description: "Public + authenticated ticket submission, admin triage, and stats.",
        }}
      >
        <p>
          Crontech's AI surface has two entry points. The site builder (
          <code>ai.siteBuilder.*</code>) generates full <code>PageLayout</code> objects from
          natural-language prompts and persists them as versioned site rows. Chat (
          <code>chat.*</code>) is the general-purpose conversational router, used by the in-product
          assistant and by any customer-built feature that wants to bolt on an LLM without managing
          its own state.
        </p>

        <Callout tone="info" title="Three-tier compute routing">
          Every inference request can run on the client GPU (WebGPU, $0/token), the edge (Workers
          AI, cheap + fast), or the cloud (H100 on Modal.com). The site builder honours an optional{" "}
          <code>tier</code> input; chat picks automatically based on the model + prompt size. There
          is no manual provisioning step — the router just picks the cheapest tier that meets the
          request.
        </Callout>

        <h2>ai.siteBuilder.* — generate + persist layouts</h2>

        <h3>
          <code>ai.siteBuilder.generate</code>
        </h3>
        <p>
          Protected <em>mutation</em>. Input:
        </p>
        <pre
          class="docs-pre"
          style={{
            background: "var(--color-bg-subtle)",
            border: "1px solid var(--color-border)",
            "border-radius": "0.75rem",
            padding: "1rem",
            overflow: "auto",
            "font-size": "0.85rem",
          }}
        >
          <code>{`z.object({
  prompt: z.string().min(3).max(4_000),
  tier: z.enum(["cloud", "edge", "client"]).optional(),
})`}</code>
        </pre>
        <p>
          Returns <code>{`{ layout: PageLayout, source: "ai" | "stub" }`}</code>. When no cloud
          provider is configured (no <code>OPENAI_API_KEY</code> / equivalent), the procedure falls
          back to a deterministic stub layout so the UI + DB wiring stays testable —{" "}
          <code>source: "stub"</code> flags that case. Real AI calls return{" "}
          <code>source: "ai"</code>.
        </p>

        <h3>
          <code>ai.siteBuilder.save</code>
        </h3>
        <p>
          Protected <em>mutation</em>. Input:
        </p>
        <pre
          class="docs-pre"
          style={{
            background: "var(--color-bg-subtle)",
            border: "1px solid var(--color-border)",
            "border-radius": "0.75rem",
            padding: "1rem",
            overflow: "auto",
            "font-size": "0.85rem",
          }}
        >
          <code>{`z.object({
  name: z.string().min(1).max(200),
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/),
  description: z.string().max(2_000).optional(),
  prompt: z.string().max(4_000).optional(),
  layout: PageLayoutSchema,
})`}</code>
        </pre>
        <p>
          Persists a layout as version 1 of a new site. Rejects with <code>CONFLICT</code> if the
          slug is already taken. The layout is validated against <code>PageLayoutSchema</code>{" "}
          before it hits the DB — AI output that doesn't match the schema is rejected, not stored.
        </p>

        <h3>
          <code>ai.siteBuilder.addVersion</code>
        </h3>
        <p>
          Protected <em>mutation</em>. Input:
        </p>
        <pre
          class="docs-pre"
          style={{
            background: "var(--color-bg-subtle)",
            border: "1px solid var(--color-border)",
            "border-radius": "0.75rem",
            padding: "1rem",
            overflow: "auto",
            "font-size": "0.85rem",
          }}
        >
          <code>{`z.object({
  siteId: z.string().min(1),
  prompt: z.string().max(4_000).optional(),
  layout: PageLayoutSchema,
  generatedBy: z.enum(["ai", "user", "mixed"]).default("ai"),
})`}</code>
        </pre>
        <p>
          Appends a new version row to an existing site. Versions are immutable — you iterate by
          adding, not editing.
        </p>

        <h3>
          <code>ai.siteBuilder.listSites</code>
        </h3>
        <p>
          Protected <em>query</em>. No input. Returns every site owned by the caller, newest first.
        </p>

        <h3>
          <code>ai.siteBuilder.getSite</code>
        </h3>
        <p>
          Protected <em>query</em>. Input <code>{"{ id: string, version?: number }"}</code>. Returns
          the site row, its latest version, and the resolved layout.
        </p>

        <h2>chat.* — conversations</h2>

        <h3>Conversation lifecycle</h3>
        <KeyList
          items={[
            {
              term: "chat.createConversation",
              description:
                "Protected mutation. Input { title, model, systemPrompt? }. Creates an empty conversation row owned by the caller.",
            },
            {
              term: "chat.listConversations",
              description:
                "Protected query. Input { includeArchived?: boolean }. Returns the caller's conversations, newest activity first.",
            },
            {
              term: "chat.getConversation",
              description:
                "Protected query. Input { id }. Returns the conversation row + every message in order.",
            },
            {
              term: "chat.updateConversation",
              description:
                "Protected mutation. Input { id, title?, model?, systemPrompt?, archived? }. Partial update.",
            },
            {
              term: "chat.deleteConversation",
              description:
                "Protected mutation. Input { id }. Hard-deletes the conversation and its messages.",
            },
            {
              term: "chat.saveMessage",
              description:
                "Protected mutation. Appends a message (user or assistant) to a conversation and updates rolling token + cost totals.",
            },
          ]}
        />

        <h3>Listing and metering</h3>
        <KeyList
          items={[
            {
              term: "chat.listModels",
              description:
                "Protected query. Returns the catalogue of models the caller can use, filtered by whichever provider keys they (or the platform) have configured.",
            },
            {
              term: "chat.getUsageStats",
              description:
                "Protected query. Returns rolling per-user usage stats — total tokens, total cost, top models, activity over the last N days.",
            },
          ]}
        />

        <h3>Provider BYOK (admin-only)</h3>
        <Callout tone="warn">
          Provider keys are admin-scoped today. Customer-facing BYOK — where a user bolts on their
          own Anthropic or OpenAI key — uses the same underlying table but ships behind an admin
          gate while the encryption + rotation story is hardened.
        </Callout>
        <KeyList
          items={[
            {
              term: "chat.saveProviderKey",
              description:
                "Admin mutation. Input { provider: 'anthropic' | 'openai' | 'github', apiKey }. Encrypts and stores the key.",
            },
            {
              term: "chat.getProviderKey",
              description:
                "Admin query. Input { provider }. Returns metadata about the stored key (never the plaintext).",
            },
            {
              term: "chat.deleteProviderKey",
              description: "Admin mutation. Input { provider }. Removes the key.",
            },
          ]}
        />

        <h2>Worked example — generate, save, iterate</h2>
        <pre
          class="docs-pre"
          style={{
            background: "var(--color-bg-subtle)",
            border: "1px solid var(--color-border)",
            "border-radius": "0.75rem",
            padding: "1rem",
            overflow: "auto",
            "font-size": "0.85rem",
          }}
        >
          <code>{`// 1. Generate a layout from a prompt
const { layout, source } = await trpc.ai.siteBuilder.generate.mutate({
  prompt: "A landing page for a climbing gym in Portland.",
  tier: "cloud",
});

// 2. Persist it as a new site
const { site } = await trpc.ai.siteBuilder.save.mutate({
  name: "Mossrock",
  slug: "mossrock",
  prompt: "A landing page for a climbing gym in Portland.",
  layout,
});

// 3. Iterate — add another version
await trpc.ai.siteBuilder.addVersion.mutate({
  siteId: site.id,
  prompt: "Add a pricing section.",
  layout: nextLayout,
  generatedBy: "ai",
});`}</code>
        </pre>

        <h2>Related</h2>
        <KeyList
          items={[
            {
              term: "aiDeploy.*",
              description:
                "detectFramework and quickDeploy procedures for shipping an AI-generated site straight to the edge.",
            },
            {
              term: "ui.*",
              description:
                "Component-catalogue queries the AI agents use to validate which components exist before composing a layout.",
            },
          ]}
        />
      </DocsArticle>
    </>
  );
}

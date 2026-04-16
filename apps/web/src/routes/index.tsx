import { A } from "@solidjs/router";
import { For, Show } from "solid-js";
import type { JSX } from "solid-js";
import { Button } from "@back-to-the-future/ui";
import { useAuth } from "../stores";
import { SEOHead } from "../components/SEOHead";

// BLK-008 — light-first Stripe-direction landing. Restricted accents
// (indigo primary, cyan secondary, emerald positive) sit on a white
// canvas with slate neutrals. BLK-003 copy is locked; only visuals move.

const ACCENT = {
  primary: "#4f46e5", // indigo-600 — brand / CTAs
  secondary: "#0891b2", // cyan-600 — platform/technical
  positive: "#059669", // emerald-600 — live/built-in
} as const;

// ── Data ────────────────────────────────────────────────────────────

interface Feature {
  icon: string;
  title: string;
  description: string;
  href: string;
  accent: string;
  badge?: string | undefined;
}

const features: Feature[] = [
  {
    icon: "\u26A1",
    title: "Edge Compute",
    description:
      "Cloudflare Workers at the edge. Sub-5ms cold starts across 330+ cities. No containers, no regions, no capacity planning. Your code lives next to your users.",
    href: "/deployments",
    accent: ACCENT.primary,
    badge: "Core",
  },
  {
    icon: "\u{1F5C4}\uFE0F",
    title: "Unified Data",
    description:
      "Turso SQLite replicas at the edge for zero-latency reads. Neon Postgres when you need the full engine. Qdrant for vector search. All type-safe through Drizzle.",
    href: "/database",
    accent: ACCENT.secondary,
  },
  {
    icon: "\u{1F517}",
    title: "Type-Safe APIs",
    description:
      "tRPC v11 end to end. Change a server type, see the client error instantly. No OpenAPI specs, no codegen step, no drift between backend and frontend. Ever.",
    href: "/docs",
    accent: ACCENT.primary,
  },
  {
    icon: "\u{1F310}",
    title: "Real-Time Layer",
    description:
      "WebSockets, SSE, and Yjs CRDTs on every edge node. Multi-user editing with AI agents as first-class peers. Conflict-free by mathematics, not by lock.",
    href: "/collab",
    accent: ACCENT.secondary,
  },
  {
    icon: "\u{1F9E0}",
    title: "AI Runtime",
    description:
      "Three-tier compute routes inference where it is cheapest: client GPU (free), edge (sub-5ms), or cloud H100s on demand. Generative UI and streaming native to the platform.",
    href: "/ai-playground",
    accent: ACCENT.primary,
  },
  {
    icon: "\u{1F512}",
    title: "Auth + Admin",
    description:
      "Passkeys, OAuth, 2FA. Role-based access control. Audit logs, analytics, and user management. A full admin dashboard ships with the platform, not as a separate product.",
    href: "/admin",
    accent: ACCENT.positive,
    badge: "Built-in",
  },
];

interface Step {
  number: string;
  title: string;
  description: string;
  accent: string;
  icon: string;
}

const steps: Step[] = [
  {
    number: "01",
    title: "Connect",
    description:
      "Point your domain at Crontech. Your app moves to the edge. DNS propagation is the longest step in the whole process.",
    accent: ACCENT.primary,
    icon: "\u{1F50C}",
  },
  {
    number: "02",
    title: "Compose",
    description:
      "Pick the layers you need \u2014 data, auth, AI, real-time, billing. One config line each, not one vendor contract each.",
    accent: ACCENT.secondary,
    icon: "\u{1F9F1}",
  },
  {
    number: "03",
    title: "Ship",
    description:
      "Git push deploys. Type-safe end to end. Every layer observable. Global in seconds, with no infrastructure to manage.",
    accent: ACCENT.positive,
    icon: "\u{1F680}",
  },
];

interface Stat {
  value: string;
  label: string;
  color: string;
}

const stats: Stat[] = [
  { value: "\u003C 5ms", label: "Edge Cold Start", color: ACCENT.primary },
  { value: "330+", label: "Cities Worldwide", color: ACCENT.secondary },
  { value: "End-to-End", label: "Type Safety", color: ACCENT.primary },
  { value: "Built-In", label: "Auth, RBAC, Audit", color: ACCENT.positive },
];

interface TechPillar {
  label: string;
  title: string;
  description: string;
  labelColor: string;
}

const techPillars: TechPillar[] = [
  {
    label: "One platform, every layer",
    title: "Replace your entire stack",
    description:
      "Hosting, database, authentication, AI, real-time collaboration, payments, email, and storage. One product. One dashboard. One bill.",
    labelColor: "text-indigo-600",
  },
  {
    label: "Built on the bleeding edge",
    title: "The fastest stack on the web",
    description:
      "Cloudflare Workers for sub-5ms cold starts. SolidJS for the fastest reactivity. Bun + Hono for the fastest runtime. Type-safe end to end.",
    labelColor: "text-cyan-700",
  },
  {
    label: "AI-native at every layer",
    title: "AI is the architecture, not an add-on",
    description:
      "AI agents, generative UI, three-tier compute routing, RAG pipelines, and real-time AI co-authoring. Native to the platform from the ground up.",
    labelColor: "text-emerald-700",
  },
];

// ── Feature Card ────────────────────────────────────────────────────

function FeatureCard(props: Feature): JSX.Element {
  return (
    <A href={props.href} class="group block">
      <div class="relative h-full overflow-hidden rounded-xl border border-slate-200 bg-white p-6 transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md">
        <div class="relative z-10 flex h-full flex-col gap-4">
          <div class="flex items-start justify-between gap-3">
            <div class="flex items-center gap-3">
              <div
                class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-base"
                style={{
                  background: `${props.accent}14`,
                  color: props.accent,
                }}
              >
                {props.icon}
              </div>
              <span class="text-base font-semibold text-slate-900">
                {props.title}
              </span>
            </div>
            <Show when={props.badge}>
              <span
                class="shrink-0 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                style={{
                  background: `${props.accent}14`,
                  color: props.accent,
                }}
              >
                {props.badge}
              </span>
            </Show>
          </div>
          <p class="text-sm leading-relaxed text-slate-600">
            {props.description}
          </p>
          <div
            class="mt-auto flex items-center gap-1.5 pt-2 text-xs font-semibold"
            style={{ color: props.accent }}
          >
            <span>Learn more</span>
            <span class="transition-transform duration-200 group-hover:translate-x-0.5">
              {"\u2192"}
            </span>
          </div>
        </div>
      </div>
    </A>
  );
}

// ── Step Card ───────────────────────────────────────────────────────

function StepCard(props: Step): JSX.Element {
  return (
    <div class="group relative flex flex-col items-center gap-5 text-center">
      <div class="relative">
        <div
          class="flex h-20 w-20 items-center justify-center rounded-2xl text-2xl transition-transform duration-200 group-hover:scale-105"
          style={{
            background: `${props.accent}14`,
            border: `1px solid ${props.accent}33`,
          }}
        >
          <span style={{ color: props.accent }}>{props.icon}</span>
        </div>
        <div
          class="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-lg text-[11px] font-bold text-white shadow-sm"
          style={{ background: props.accent }}
        >
          {props.number}
        </div>
      </div>
      <h3 class="text-xl font-bold text-slate-900">{props.title}</h3>
      <p class="max-w-xs text-sm leading-relaxed text-slate-600">
        {props.description}
      </p>
    </div>
  );
}

// ── Stat Block ──────────────────────────────────────────────────────

function StatBlock(props: Stat): JSX.Element {
  return (
    <div class="flex flex-col items-center gap-1 px-6 py-6">
      <span
        class="text-2xl font-bold tracking-tight sm:text-3xl"
        style={{ color: props.color }}
      >
        {props.value}
      </span>
      <span class="text-[11px] font-semibold uppercase tracking-widest text-slate-500">
        {props.label}
      </span>
    </div>
  );
}

// ── Tech Pillar Card ────────────────────────────────────────────────

function TechPillarCard(props: TechPillar): JSX.Element {
  return (
    <div class="group relative overflow-hidden rounded-xl border border-slate-200 bg-white p-8 transition-all duration-200 hover:border-slate-300 hover:shadow-md">
      <span
        class={`mb-3 inline-block text-xs font-semibold uppercase tracking-widest ${props.labelColor}`}
      >
        {props.label}
      </span>
      <h3 class="mb-3 text-xl font-bold text-slate-900">{props.title}</h3>
      <p class="text-sm leading-relaxed text-slate-600">{props.description}</p>
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────

export default function Home(): JSX.Element {
  const auth = useAuth();

  return (
    <>
      <SEOHead
        title="Crontech \u2014 The developer platform for the next decade"
        description="One unified platform. Backend and frontend, joined as one. Hosting, database, auth, AI, real-time, billing, storage \u2014 all in one product, type-safe end to end, built on the bleeding edge."
        path="/"
      />

      <div class="min-h-screen overflow-x-hidden bg-white">
        {/* ── Hero ──────────────────────────────────────────────── */}
        <section class="relative overflow-hidden">
          {/* Subtle dotted grid — professional, not cyberpunk */}
          <div
            class="pointer-events-none absolute inset-0 opacity-[0.4]"
            style={{
              "background-image":
                "radial-gradient(rgba(15,23,42,0.07) 1px, transparent 1px)",
              "background-size": "28px 28px",
              "mask-image":
                "linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.6) 60%, rgba(0,0,0,0) 100%)",
              "-webkit-mask-image":
                "linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.6) 60%, rgba(0,0,0,0) 100%)",
            }}
          />

          <div class="relative z-10 mx-auto max-w-[1200px] px-6 pb-20 pt-20 lg:px-8 lg:pb-28 lg:pt-28">
            <div class="flex flex-col items-center text-center">
              {/* Announcement badge */}
              <div class="mb-8 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3.5 py-1.5 shadow-sm">
                <span class="relative flex h-2 w-2">
                  <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span class="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
                <span class="text-xs font-medium text-slate-600">
                  Now in early access
                </span>
              </div>

              {/* Doctrine headline — per docs/POSITIONING.md (BLK-003 locked) */}
              <h1 class="max-w-4xl text-4xl font-extrabold leading-[1.08] tracking-tight text-slate-900 sm:text-5xl lg:text-[4rem]">
                The developer platform{" "}
                <span class="text-indigo-600">for the next decade.</span>
              </h1>

              {/* Subhead */}
              <p class="mt-6 max-w-2xl text-base leading-relaxed text-slate-600 sm:text-lg">
                Backend and frontend, joined as one product. Hosting, database,
                auth, AI, real-time, and billing {"\u2014"} every layer your app
                needs, type-safe end to end, built on the bleeding edge and
                ready the moment your team is.
              </p>

              {/* CTAs */}
              <div class="mt-10 flex flex-col items-center gap-3 sm:flex-row">
                <A href="/register">
                  <Button variant="primary" size="lg">
                    Start building {"\u2192"}
                  </Button>
                </A>
                <Show
                  when={auth.isAuthenticated()}
                  fallback={
                    <A href="/docs">
                      <Button variant="outline" size="lg">
                        See the docs
                      </Button>
                    </A>
                  }
                >
                  <A href="/dashboard">
                    <Button variant="outline" size="lg">
                      Open dashboard
                    </Button>
                  </A>
                </Show>
              </div>

              {/* Tech stack strip */}
              <div class="mt-16 flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
                <For
                  each={[
                    "SolidJS",
                    "Bun",
                    "Hono",
                    "tRPC",
                    "Cloudflare Workers",
                    "Turso",
                    "WebGPU",
                  ]}
                >
                  {(tech) => (
                    <span class="text-xs font-semibold uppercase tracking-widest text-slate-400 transition-colors duration-200 hover:text-slate-600">
                      {tech}
                    </span>
                  )}
                </For>
              </div>
            </div>
          </div>
        </section>

        {/* ── Stats strip ───────────────────────────────────────── */}
        <section class="border-y border-slate-200 bg-slate-50">
          <div class="mx-auto max-w-[1200px] px-6 lg:px-8">
            <div class="grid grid-cols-2 divide-x divide-slate-200 sm:grid-cols-4">
              <For each={stats}>
                {(stat) => (
                  <StatBlock
                    value={stat.value}
                    label={stat.label}
                    color={stat.color}
                  />
                )}
              </For>
            </div>
          </div>
        </section>

        {/* ── Platform layers ───────────────────────────────────── */}
        <section class="relative py-24 lg:py-28">
          <div class="mx-auto max-w-[1200px] px-6 lg:px-8">
            <div class="mb-14 flex flex-col items-center text-center">
              <span class="mb-4 text-xs font-semibold uppercase tracking-widest text-indigo-600">
                Platform
              </span>
              <h2 class="max-w-2xl text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
                Every layer your app needs, in one product
              </h2>
              <p class="mt-4 max-w-xl text-base leading-relaxed text-slate-600">
                Stop stitching together a dozen services. Crontech is one
                product with one dashboard and one bill.
              </p>
            </div>

            <div class="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              <For each={features}>
                {(feature) => (
                  <FeatureCard
                    icon={feature.icon}
                    title={feature.title}
                    description={feature.description}
                    href={feature.href}
                    accent={feature.accent}
                    badge={feature.badge}
                  />
                )}
              </For>
            </div>
          </div>
        </section>

        {/* ── How it works ──────────────────────────────────────── */}
        <section class="relative border-y border-slate-200 bg-slate-50 py-24 lg:py-28">
          <div class="mx-auto max-w-[1200px] px-6 lg:px-8">
            <div class="mb-14 flex flex-col items-center text-center">
              <span class="mb-4 text-xs font-semibold uppercase tracking-widest text-cyan-700">
                Onboarding
              </span>
              <h2 class="max-w-2xl text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
                Move your app to Crontech in three steps
              </h2>
              <p class="mt-4 max-w-xl text-base leading-relaxed text-slate-600">
                No rebuild. No long migration. Bring the code you already have,
                layer Crontech underneath, ship.
              </p>
            </div>

            <div class="grid grid-cols-1 gap-12 sm:grid-cols-3 sm:gap-8">
              <For each={steps}>
                {(step) => (
                  <StepCard
                    number={step.number}
                    title={step.title}
                    description={step.description}
                    accent={step.accent}
                    icon={step.icon}
                  />
                )}
              </For>
            </div>
          </div>
        </section>

        {/* ── Tech pillars ──────────────────────────────────────── */}
        <section class="py-24 lg:py-28">
          <div class="mx-auto max-w-[1200px] px-6 lg:px-8">
            <div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <For each={techPillars}>
                {(pillar) => (
                  <TechPillarCard
                    label={pillar.label}
                    title={pillar.title}
                    description={pillar.description}
                    labelColor={pillar.labelColor}
                  />
                )}
              </For>
            </div>
          </div>
        </section>

        {/* ── Bottom CTA ────────────────────────────────────────── */}
        <section class="relative border-t border-slate-200 bg-slate-50 py-24 lg:py-28">
          <div class="relative z-10 mx-auto max-w-[800px] px-6 text-center lg:px-8">
            <h2 class="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl lg:text-5xl">
              The developer platform{" "}
              <span class="text-indigo-600">for the next decade.</span>
            </h2>
            <p class="mt-5 text-base leading-relaxed text-slate-600 sm:text-lg">
              One product. Every layer. Built for teams who refuse to settle
              for yesterday{"\u2019"}s tools.
            </p>
            <div class="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <A href="/register">
                <Button variant="primary" size="lg">
                  Start building {"\u2192"}
                </Button>
              </A>
              <A href="/dashboard">
                <Button variant="outline" size="lg">
                  Explore the platform
                </Button>
              </A>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}

import { createSignal, For, Show, createMemo } from "solid-js";
import type { JSX } from "solid-js";
import { A, useNavigate } from "@solidjs/router";
import { Badge } from "@back-to-the-future/ui";
import { SEOHead } from "../components/SEOHead";

// ── Types ───────────────────────────────────────────────────────────

interface TemplateItem {
  id: string;
  name: string;
  description: string;
  category: string;
  accent: string;
  difficulty: "Beginner" | "Intermediate" | "Advanced";
  estimatedTime: string;
  featured?: boolean;
}

// ── Filter Categories ───────────────────────────────────────────────

const FILTER_CATEGORIES = [
  { value: "all", label: "All" },
  { value: "website", label: "Website" },
  { value: "video", label: "Video" },
  { value: "ai-app", label: "AI App" },
  { value: "landing", label: "Landing Page" },
  { value: "ecommerce", label: "E-commerce" },
  { value: "saas", label: "SaaS" },
] as const;

// ── Template Data ───────────────────────────────────────────────────

const TEMPLATE_ITEMS: TemplateItem[] = [
  {
    id: "startup-launch",
    name: "Startup Launch",
    description:
      "High-conversion landing page with hero, features grid, testimonials, and CTA. Designed for product launches and early-stage startups.",
    category: "landing",
    accent: "#4f46e5",
    difficulty: "Beginner",
    estimatedTime: "2 min",
    featured: true,
  },
  {
    id: "ai-chatbot",
    name: "AI Chatbot Interface",
    description:
      "Streaming chat UI with conversation history, tool calls, and generative UI components. Powered by the AI SDK with three-tier compute routing.",
    category: "ai-app",
    accent: "#7c3aed",
    difficulty: "Intermediate",
    estimatedTime: "5 min",
    featured: true,
  },
  {
    id: "video-editor",
    name: "Video Editor",
    description:
      "WebGPU-accelerated video editing workspace with timeline, effects panel, and real-time preview. Multi-user collaboration via CRDTs.",
    category: "video",
    accent: "#ea580c",
    difficulty: "Advanced",
    estimatedTime: "10 min",
    featured: true,
  },
  {
    id: "ecommerce-store",
    name: "Online Store",
    description:
      "Product grid with filters, cart, checkout flow, and Stripe integration. Responsive design with AI-powered product recommendations.",
    category: "ecommerce",
    accent: "#059669",
    difficulty: "Intermediate",
    estimatedTime: "5 min",
  },
  {
    id: "saas-dashboard",
    name: "SaaS Dashboard",
    description:
      "Analytics dashboard with real-time charts, user management, billing portal, and feature flags. Complete admin panel out of the box.",
    category: "saas",
    accent: "#2563eb",
    difficulty: "Advanced",
    estimatedTime: "8 min",
    featured: true,
  },
  {
    id: "portfolio-creative",
    name: "Creative Portfolio",
    description:
      "Showcase projects with animated transitions, image galleries, and a contact form. Designed for designers, photographers, and artists.",
    category: "website",
    accent: "#d97706",
    difficulty: "Beginner",
    estimatedTime: "3 min",
  },
  {
    id: "ai-image-gen",
    name: "AI Image Generator",
    description:
      "Text-to-image generation interface with prompt builder, style presets, gallery view, and download management. Client-side inference via WebGPU.",
    category: "ai-app",
    accent: "#a21caf",
    difficulty: "Intermediate",
    estimatedTime: "6 min",
  },
  {
    id: "video-showcase",
    name: "Video Showcase",
    description:
      "Video-first landing page with background playback, chapter navigation, and embedded player. Optimized for product demos and course previews.",
    category: "video",
    accent: "#0d9488",
    difficulty: "Beginner",
    estimatedTime: "3 min",
  },
  {
    id: "agency-site",
    name: "Agency Website",
    description:
      "Multi-page agency site with services, case studies, team section, and contact form. Enterprise-grade design with glassmorphism effects.",
    category: "website",
    accent: "#475569",
    difficulty: "Intermediate",
    estimatedTime: "7 min",
  },
  {
    id: "saas-pricing",
    name: "SaaS Pricing Page",
    description:
      "Three-tier pricing table with feature comparison, annual/monthly toggle, and Stripe checkout integration. Conversion-optimized layout.",
    category: "saas",
    accent: "#0891b2",
    difficulty: "Beginner",
    estimatedTime: "2 min",
  },
  {
    id: "ai-document-analyzer",
    name: "AI Document Analyzer",
    description:
      "Upload documents for AI-powered analysis, summarization, and entity extraction. Built-in RAG pipeline with semantic search across uploaded files.",
    category: "ai-app",
    accent: "#6d28d9",
    difficulty: "Advanced",
    estimatedTime: "8 min",
  },
  {
    id: "product-launch",
    name: "Product Launch Page",
    description:
      "Countdown timer, email capture, feature previews, and social proof. Everything you need to build anticipation before launch day.",
    category: "landing",
    accent: "#e11d48",
    difficulty: "Beginner",
    estimatedTime: "2 min",
  },
];

// ── Template Card ───────────────────────────────────────────────────

function TemplateCard(props: {
  template: TemplateItem;
  onUse: (id: string) => void;
}): JSX.Element {
  const accent = (): string => props.template.accent;
  return (
    <div class="group relative flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white transition-all duration-300 hover:border-slate-300 hover:shadow-md">
      {/* Preview accent area */}
      <div
        class="relative h-44 w-full overflow-hidden"
        style={{ background: `${accent()}10` }}
      >
        {/* Subtle grid pattern overlay */}
        <div
          class="absolute inset-0 opacity-40"
          style={{
            "background-image":
              "linear-gradient(rgba(15,23,42,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(15,23,42,0.06) 1px, transparent 1px)",
            "background-size": "20px 20px",
          }}
        />
        {/* Template name overlay */}
        <div class="absolute inset-0 flex items-center justify-center">
          <span
            class="text-lg font-bold text-center px-4"
            style={{ color: accent() }}
          >
            {props.template.name}
          </span>
        </div>
        {/* Featured badge */}
        <Show when={props.template.featured}>
          <div class="absolute top-3 right-3">
            <span class="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-sm">
              Featured
            </span>
          </div>
        </Show>
        {/* Hover overlay */}
        <div class="absolute inset-0 flex items-center justify-center bg-white/0 opacity-0 transition-all duration-300 group-hover:bg-white/60 group-hover:opacity-100">
          <button
            type="button"
            class="rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-slate-900 shadow-md border border-slate-200 transition-transform duration-200 hover:scale-105"
            onClick={() => props.onUse(props.template.id)}
          >
            Preview Template
          </button>
        </div>
      </div>

      {/* Card body */}
      <div class="flex flex-1 flex-col p-5">
        <div class="flex items-center gap-2 mb-2">
          <span class="text-base font-semibold text-slate-900">
            {props.template.name}
          </span>
        </div>
        <p class="text-sm text-slate-600 leading-relaxed mb-4 flex-1">
          {props.template.description}
        </p>
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span
              class="rounded-md px-2 py-0.5 text-xs font-medium"
              style={{
                background: `${accent()}14`,
                color: accent(),
              }}
            >
              {props.template.category}
            </span>
            <span class="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-600">
              {props.template.difficulty}
            </span>
          </div>
          <span class="text-xs text-slate-500 font-mono">
            {props.template.estimatedTime}
          </span>
        </div>

        {/* Action buttons */}
        <div class="mt-4 flex gap-2">
          <button
            type="button"
            class="flex-1 rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white transition-all duration-200 hover:bg-indigo-700"
            onClick={() => props.onUse(props.template.id)}
          >
            Use Template
          </button>
          <button
            type="button"
            class="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 transition-all duration-200 hover:border-slate-300 hover:bg-slate-50"
            onClick={() => props.onUse(props.template.id + "?ai=true")}
          >
            Customize with AI
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────────

export default function TemplatesPage(): JSX.Element {
  const navigate = useNavigate();
  const [search, setSearch] = createSignal("");
  const [activeFilter, setActiveFilter] = createSignal("all");

  const filtered = createMemo((): TemplateItem[] => {
    let items = TEMPLATE_ITEMS;

    // Filter by category
    const cat = activeFilter();
    if (cat !== "all") {
      items = items.filter((t) => t.category === cat);
    }

    // Filter by search
    const q = search().toLowerCase().trim();
    if (q) {
      items = items.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          t.category.toLowerCase().includes(q),
      );
    }

    return items;
  });

  const handleUseTemplate = (id: string): void => {
    navigate(`/builder?template=${id}`);
  };

  return (
    <>
      <SEOHead
        title="Templates"
        description="Production-ready starter templates for websites, AI apps, video projects, and SaaS dashboards. Pick one and ship in minutes."
        path="/templates"
      />

      <div class="min-h-screen bg-white">
        {/* ── Hero ───────────────────────────────────────────────── */}
        <div class="relative overflow-hidden">
          <div class="relative mx-auto max-w-6xl px-6 pt-20 pb-12">
            <div class="flex flex-col items-center text-center">
              <Badge variant="info" size="sm">
                {TEMPLATE_ITEMS.length} templates and growing
              </Badge>
              <h1
                class="mt-6 text-5xl font-bold tracking-tight text-slate-900 sm:text-6xl"
                style={{ "line-height": "1.1" }}
              >
                Start with a template.
                <br />
                Ship in <span class="text-indigo-600">minutes</span>.
              </h1>
              <p class="mt-4 max-w-2xl text-lg text-slate-600">
                Production-ready designs built on the Crontech stack.
                Every template is AI-composable, fully responsive, and
                deploys to the edge in one click.
              </p>

              {/* Search */}
              <div class="mt-8 w-full max-w-xl">
                <div class="relative rounded-2xl border border-slate-200 bg-white overflow-hidden transition-all focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-100">
                  <div class="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                    <svg
                      class="h-5 w-5 text-slate-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                      />
                    </svg>
                  </div>
                  <input
                    type="text"
                    placeholder="Search templates..."
                    value={search()}
                    onInput={(e) =>
                      setSearch(e.currentTarget.value)
                    }
                    class="w-full bg-transparent py-4 pl-12 pr-4 text-slate-900 placeholder-slate-400 outline-none text-sm"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Filter Bar ─────────────────────────────────────────── */}
        <div class="mx-auto max-w-6xl px-6 pb-8">
          <div class="flex flex-wrap gap-2 justify-center">
            <For each={FILTER_CATEGORIES}>
              {(cat) => {
                const isActive = (): boolean => activeFilter() === cat.value;
                return (
                  <button
                    type="button"
                    class={`rounded-full border px-4 py-2 text-sm font-medium transition-all duration-200 ${
                      isActive()
                        ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900"
                    }`}
                    onClick={() => setActiveFilter(cat.value)}
                  >
                    {cat.label}
                  </button>
                );
              }}
            </For>
          </div>
        </div>

        {/* ── Template Grid ──────────────────────────────────────── */}
        <div class="mx-auto max-w-6xl px-6 pb-20">
          <Show
            when={filtered().length > 0}
            fallback={
              <div class="flex flex-col items-center justify-center py-20 text-center">
                <div class="text-4xl mb-4 opacity-30">
                  {"\uD83D\uDD0D"}
                </div>
                <p class="text-slate-700 text-lg">
                  No templates match your search
                </p>
                <p class="text-slate-500 text-sm mt-1">
                  Try adjusting your filters or search query
                </p>
                <button
                  type="button"
                  class="mt-4 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 hover:border-slate-300 hover:bg-slate-50 transition-colors"
                  onClick={() => {
                    setSearch("");
                    setActiveFilter("all");
                  }}
                >
                  Clear filters
                </button>
              </div>
            }
          >
            <div class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              <For each={filtered()}>
                {(template) => (
                  <TemplateCard
                    template={template}
                    onUse={handleUseTemplate}
                  />
                )}
              </For>
            </div>
          </Show>

          {/* ── CTA Section ───────────────────────────────────────── */}
          <div class="mt-20 rounded-2xl border border-slate-200 bg-slate-50 p-10 text-center">
            <h2 class="text-2xl font-bold text-slate-900 mb-3">
              Need something custom?
            </h2>
            <p class="text-slate-600 max-w-lg mx-auto mb-6">
              Describe what you want in plain English and our AI builder
              will generate a fully functional project from scratch.
              No template required.
            </p>
            <A href="/builder">
              <button
                type="button"
                class="rounded-xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white transition-all duration-200 hover:bg-indigo-700"
              >
                Open Composer
              </button>
            </A>
          </div>
        </div>
      </div>
    </>
  );
}

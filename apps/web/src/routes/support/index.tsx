// ── Knowledge Base Page ──────────────────────────────────────────────
// Searchable knowledge base with category filters, article list, and
// a CTA that opens the support chat widget.

import { Title } from "@solidjs/meta";
import {
  type JSX,
  For,
  Show,
  createSignal,
  createMemo,
} from "solid-js";
import { A } from "@solidjs/router";
import { Button, Card, Stack, Text, Badge } from "@cronix/ui";
import { useSupport } from "../../stores/support";

// ── Types ────────────────────────────────────────────────────────────

interface KBArticle {
  id: string;
  title: string;
  excerpt: string;
  category: KBCategory;
  slug: string;
  updatedAt: string;
}

type KBCategory =
  | "getting-started"
  | "billing"
  | "features"
  | "api"
  | "troubleshooting";

interface KBSearchResult {
  articles: KBArticle[];
  total: number;
}

// ── Category Config ─────────────────────────────────────────────────

const CATEGORIES: { value: KBCategory | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "getting-started", label: "Getting Started" },
  { value: "billing", label: "Billing" },
  { value: "features", label: "Features" },
  { value: "api", label: "API" },
  { value: "troubleshooting", label: "Troubleshooting" },
];

const categoryBadgeVariant: Record<KBCategory, "default" | "success" | "warning" | "error" | "info"> = {
  "getting-started": "info",
  billing: "warning",
  features: "success",
  api: "default",
  troubleshooting: "error",
};

const categoryLabels: Record<KBCategory, string> = {
  "getting-started": "Getting Started",
  billing: "Billing",
  features: "Features",
  api: "API",
  troubleshooting: "Troubleshooting",
};

// ── Static Articles (placeholder until API is wired) ────────────────

const STATIC_ARTICLES: KBArticle[] = [
  {
    id: "1",
    title: "Getting Started with Cronix",
    excerpt: "Learn how to set up your first project, configure your workspace, and deploy your first site using the AI builder.",
    category: "getting-started",
    slug: "getting-started-with-cronix",
    updatedAt: "2026-04-01",
  },
  {
    id: "2",
    title: "Understanding Your Billing Plan",
    excerpt: "Overview of available plans, usage-based billing, and how to manage your subscription and payment methods.",
    category: "billing",
    slug: "understanding-billing",
    updatedAt: "2026-03-28",
  },
  {
    id: "3",
    title: "AI Website Builder: Complete Guide",
    excerpt: "Deep dive into the AI website builder features including prompt engineering tips, component customization, and deployment.",
    category: "features",
    slug: "ai-website-builder-guide",
    updatedAt: "2026-04-02",
  },
  {
    id: "4",
    title: "tRPC API Reference",
    excerpt: "Complete API reference for integrating with the Cronix platform using tRPC, including authentication, data queries, and real-time subscriptions.",
    category: "api",
    slug: "trpc-api-reference",
    updatedAt: "2026-03-25",
  },
  {
    id: "5",
    title: "Troubleshooting Deployment Issues",
    excerpt: "Common deployment errors, edge function timeouts, build failures, and step-by-step resolution guides.",
    category: "troubleshooting",
    slug: "troubleshooting-deployment",
    updatedAt: "2026-03-30",
  },
  {
    id: "6",
    title: "Real-Time Collaboration Setup",
    excerpt: "Configure multi-user collaboration with AI agents, CRDT-based editing, and presence indicators for your team.",
    category: "features",
    slug: "realtime-collaboration-setup",
    updatedAt: "2026-04-03",
  },
  {
    id: "7",
    title: "WebGPU Rendering Troubleshooting",
    excerpt: "Diagnose and fix WebGPU rendering issues, fallback chain behavior, and browser compatibility problems.",
    category: "troubleshooting",
    slug: "webgpu-troubleshooting",
    updatedAt: "2026-03-27",
  },
  {
    id: "8",
    title: "Custom Domain Configuration",
    excerpt: "Step-by-step instructions for pointing your custom domain to Cronix, SSL setup, and DNS configuration.",
    category: "getting-started",
    slug: "custom-domain-setup",
    updatedAt: "2026-03-29",
  },
];

// ── Knowledge Base Page ─────────────────────────────────────────────

export default function KnowledgeBasePage(): JSX.Element {
  const support = useSupport();
  const [searchQuery, setSearchQuery] = createSignal("");
  const [activeCategory, setActiveCategory] = createSignal<KBCategory | "all">("all");

  // Filtered articles based on search + category
  const filteredArticles = createMemo((): KBArticle[] => {
    let articles = STATIC_ARTICLES;

    const category = activeCategory();
    if (category !== "all") {
      articles = articles.filter((a) => a.category === category);
    }

    const query = searchQuery().trim().toLowerCase();
    if (query) {
      articles = articles.filter(
        (a) =>
          a.title.toLowerCase().includes(query) ||
          a.excerpt.toLowerCase().includes(query),
      );
    }

    return articles;
  });

  return (
    <Stack direction="vertical" gap="lg" class="page-padded max-w-4xl mx-auto">
      <Title>Support - Cronix</Title>

      {/* Header */}
      <Stack direction="vertical" gap="sm" align="center" class="text-center py-8">
        <Text variant="h1" weight="bold">
          Help Center
        </Text>
        <Text variant="body" class="text-gray-500 max-w-lg">
          Search our knowledge base or browse by category. Cannot find what you need? Chat with our AI support assistant.
        </Text>
      </Stack>

      {/* Search Bar */}
      <div class="relative max-w-xl mx-auto w-full">
        <svg
          class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="text"
          placeholder="Search articles..."
          value={searchQuery()}
          onInput={(e) => setSearchQuery(e.currentTarget.value)}
          class="w-full pl-10 pr-4 py-3 text-sm border border-gray-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 placeholder:text-gray-400"
        />
      </div>

      {/* Category Filters */}
      <div class="flex flex-wrap gap-2 justify-center">
        <For each={CATEGORIES}>
          {(cat) => (
            <button
              type="button"
              class={`px-4 py-2 text-sm font-medium rounded-full border transition-all ${
                activeCategory() === cat.value
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-gray-700 border-gray-200 hover:border-gray-300 hover:bg-gray-50"
              }`}
              onClick={() => setActiveCategory(cat.value)}
            >
              {cat.label}
            </button>
          )}
        </For>
      </div>

      {/* Article List */}
      <Stack direction="vertical" gap="sm">
        <Show
          when={filteredArticles().length > 0}
          fallback={
            <Card padding="lg" class="text-center">
              <Stack direction="vertical" gap="sm" align="center">
                <svg class="w-12 h-12 text-gray-300" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
                </svg>
                <Text variant="body" class="text-gray-500">
                  No articles found. Try a different search or category.
                </Text>
              </Stack>
            </Card>
          }
        >
          <For each={filteredArticles()}>
            {(article) => (
              <A href={`/support/article/${article.slug}`} class="block group">
                <Card padding="md" class="hover:border-blue-200 hover:shadow-md transition-all cursor-pointer">
                  <Stack direction="vertical" gap="sm">
                    <Stack direction="horizontal" gap="sm" align="center">
                      <Badge variant={categoryBadgeVariant[article.category]} size="sm">
                        {categoryLabels[article.category]}
                      </Badge>
                      <Text variant="caption" class="text-gray-400">
                        Updated {article.updatedAt}
                      </Text>
                    </Stack>
                    <Text variant="h4" weight="semibold" class="group-hover:text-blue-600 transition-colors">
                      {article.title}
                    </Text>
                    <Text variant="body" class="text-gray-500 text-sm">
                      {article.excerpt}
                    </Text>
                  </Stack>
                </Card>
              </A>
            )}
          </For>
        </Show>
      </Stack>

      {/* Still need help CTA */}
      <Card padding="lg" class="text-center bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-100">
        <Stack direction="vertical" gap="md" align="center">
          <div class="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
            <svg class="w-6 h-6 text-blue-600" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
            </svg>
          </div>
          <Text variant="h3" weight="semibold">
            Still need help?
          </Text>
          <Text variant="body" class="text-gray-500 max-w-md">
            Our AI support assistant can help with specific questions about your account, technical issues, or anything else.
          </Text>
          <Button
            variant="primary"
            size="lg"
            onClick={() => support.open()}
          >
            Chat with Support
          </Button>
        </Stack>
      </Card>
    </Stack>
  );
}

import { Title } from "@solidjs/meta";
import { A } from "@solidjs/router";
import { For, Show } from "solid-js";
import { Badge, Button, Card, Stack, Text } from "@back-to-the-future/ui";
import { useAuth } from "../stores";

// ── Feature Data ─────────────────────────────────────────────────────

interface Feature {
  title: string;
  description: string;
  badge: string;
}

const features: Feature[] = [
  {
    title: "AI-Native Architecture",
    description:
      "AI is not a feature -- it is the architecture. Routing, data fetching, error recovery, and collaboration all have AI woven into their DNA from day one.",
    badge: "Core",
  },
  {
    title: "Three-Tier Compute",
    description:
      "Workloads flow automatically between client GPU ($0/token), edge (sub-50ms), and cloud (H100 power). The platform decides where to run each computation.",
    badge: "Performance",
  },
  {
    title: "Real-Time Collaboration",
    description:
      "Yjs CRDTs enable conflict-free editing. AI agents participate as first-class collaborators alongside human users with sub-50ms global latency.",
    badge: "Collaboration",
  },
  {
    title: "Zero-HTML Components",
    description:
      "SolidJS signals compile JSX to direct, surgical DOM mutations. Every component is AI-composable via Zod schemas. No virtual DOM. No diffing overhead.",
    badge: "Architecture",
  },
  {
    title: "Edge-First Infrastructure",
    description:
      "Cloudflare Workers across 330+ cities with sub-5ms cold starts. Turso embedded replicas provide zero-latency reads. Data lives next to your users.",
    badge: "Infrastructure",
  },
  {
    title: "Enterprise Security",
    description:
      "Passkey/WebAuthn authentication. WORM audit trails with SHA-256 hash chaining. GDPR compliant. SOC 2 Type II ready. Court-admissible data integrity.",
    badge: "Security",
  },
];

// ── Tech Stack Items ─────────────────────────────────────────────────

interface TechItem {
  name: string;
  role: string;
}

const techStack: TechItem[] = [
  { name: "SolidJS", role: "Frontend Framework" },
  { name: "Hono", role: "Web Framework" },
  { name: "Bun", role: "Runtime" },
  { name: "tRPC v11", role: "API Layer" },
  { name: "Turso", role: "Edge Database" },
  { name: "WebGPU", role: "Client GPU Compute" },
  { name: "Vercel AI SDK", role: "AI Orchestration" },
  { name: "LangGraph", role: "Multi-Agent Workflows" },
  { name: "Cloudflare Workers", role: "Edge Compute" },
  { name: "Tailwind v4", role: "Styling" },
  { name: "Drizzle ORM", role: "Database Access" },
  { name: "Yjs CRDTs", role: "Real-Time Collaboration" },
];

// ── Feature Card ─────────────────────────────────────────────────────

function FeatureCard(props: Feature): ReturnType<typeof Card> {
  return (
    <Card padding="md" class="h-full">
      <Stack direction="vertical" gap="sm">
        <Stack direction="horizontal" gap="sm" align="center">
          <Badge variant="info" size="sm">
            {props.badge}
          </Badge>
        </Stack>
        <Text variant="h4" weight="semibold">
          {props.title}
        </Text>
        <Text variant="body" class="text-muted">
          {props.description}
        </Text>
      </Stack>
    </Card>
  );
}

// ── Tech Badge ───────────────────────────────────────────────────────

function TechBadge(props: TechItem): ReturnType<typeof Card> {
  return (
    <Card padding="sm" class="text-center">
      <Stack direction="vertical" gap="xs" align="center">
        <Text variant="body" weight="bold">
          {props.name}
        </Text>
        <Text variant="caption" class="text-muted">
          {props.role}
        </Text>
      </Stack>
    </Card>
  );
}

// ── Landing Page ─────────────────────────────────────────────────────

export default function Home(): ReturnType<typeof Stack> {
  const auth = useAuth();

  return (
    <Stack
      direction="vertical"
      gap="xl"
      class="w-full max-w-6xl mx-auto px-4 py-8 sm:py-16"
    >
      <Title>Back to the Future - AI-Native Full-Stack Platform</Title>

      {/* ── Hero Section ──────────────────────────────────────────── */}
      <Stack
        direction="vertical"
        align="center"
        gap="lg"
        class="py-12 sm:py-20 text-center"
      >
        <Badge variant="info" size="md">
          Now in Public Beta
        </Badge>
        <Text
          variant="h1"
          weight="bold"
          align="center"
          class="text-4xl sm:text-5xl lg:text-6xl leading-tight"
        >
          Back to the Future
        </Text>
        <Text
          variant="body"
          align="center"
          class="text-lg sm:text-xl max-w-2xl text-muted"
        >
          The most advanced AI-native full-stack platform purpose-built for AI
          website builders and AI video builders. Edge-first. Zero-HTML.
          Self-evolving.
        </Text>
        <Text variant="body" align="center" class="max-w-xl text-muted">
          WebGPU-powered client-side inference at $0/token. Real-time
          collaboration with AI agents. Deployed across 330+ edge cities
          worldwide.
        </Text>
        <Stack
          direction="horizontal"
          gap="md"
          justify="center"
          class="pt-4 flex-wrap"
        >
          <Show
            when={auth.isAuthenticated()}
            fallback={
              <A href="/register">
                <Button variant="primary" size="lg">
                  Get Started Free
                </Button>
              </A>
            }
          >
            <A href="/dashboard">
              <Button variant="primary" size="lg">
                Go to Dashboard
              </Button>
            </A>
          </Show>
          <A href="/about">
            <Button variant="outline" size="lg">
              Learn More
            </Button>
          </A>
        </Stack>
      </Stack>

      {/* ── Features Section ──────────────────────────────────────── */}
      <Stack direction="vertical" gap="lg">
        <Stack direction="vertical" gap="sm" align="center">
          <Text variant="h2" weight="bold" align="center">
            Platform Capabilities
          </Text>
          <Text
            variant="body"
            align="center"
            class="max-w-2xl text-muted"
          >
            Every layer has AI woven into its DNA. Not bolted on. Not optional.
            AI is the bloodstream of this platform.
          </Text>
        </Stack>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          <For each={features}>
            {(feature) => (
              <FeatureCard
                title={feature.title}
                description={feature.description}
                badge={feature.badge}
              />
            )}
          </For>
        </div>
      </Stack>

      {/* ── Tech Stack Section ────────────────────────────────────── */}
      <Stack direction="vertical" gap="lg">
        <Stack direction="vertical" gap="sm" align="center">
          <Text variant="h2" weight="bold" align="center">
            The Arsenal
          </Text>
          <Text
            variant="body"
            align="center"
            class="max-w-2xl text-muted"
          >
            Every tool was chosen for a reason. If it is in this stack, it is
            the best in its class.
          </Text>
        </Stack>
        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
          <For each={techStack}>
            {(tech) => <TechBadge name={tech.name} role={tech.role} />}
          </For>
        </div>
      </Stack>

      {/* ── Bottom CTA Section ────────────────────────────────────── */}
      <Stack
        direction="vertical"
        align="center"
        gap="md"
        class="py-12 sm:py-16 text-center"
      >
        <Text variant="h2" weight="bold" align="center">
          Ready to Build the Future?
        </Text>
        <Text variant="body" align="center" class="max-w-xl text-muted">
          Join the platform that sits 80% ahead of all competition. AI-native.
          Edge-first. Zero-HTML. The future does not wait. Neither should you.
        </Text>
        <Stack direction="horizontal" gap="md" justify="center" class="pt-4">
          <Show
            when={auth.isAuthenticated()}
            fallback={
              <A href="/register">
                <Button variant="primary" size="lg">
                  Start Building Now
                </Button>
              </A>
            }
          >
            <A href="/dashboard">
              <Button variant="primary" size="lg">
                Go to Dashboard
              </Button>
            </A>
          </Show>
        </Stack>
      </Stack>
    </Stack>
  );
}

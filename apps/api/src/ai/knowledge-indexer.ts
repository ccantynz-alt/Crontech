// ── Knowledge Base Indexer ──────────────────────────────────────
// Indexes docs, FAQ, and help content into Qdrant for the support
// agent's RAG pipeline. Provides indexing utilities and initial
// seed data for common support questions.

import { QdrantPipeline } from "@cronix/ai-core";

// ── Pipeline (lazy singleton) ──────────────────────────────────

let _pipeline: QdrantPipeline | undefined;

function getPipeline(): QdrantPipeline {
  if (!_pipeline) {
    _pipeline = new QdrantPipeline({
      storeConfig: {
        collectionName: "cronix_support_kb",
      },
    });
  }
  return _pipeline;
}

// ── Indexing Functions ──────────────────────────────────────────

/**
 * Index a document into the support knowledge base.
 * Content is chunked, embedded, and stored in Qdrant.
 */
export async function indexDocument(
  title: string,
  content: string,
  category: string,
  metadata?: Record<string, unknown>,
): Promise<{ contentId: string; chunksIndexed: number }> {
  const pipeline = getPipeline();
  const contentId = `doc_${category}_${title.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "")}`;

  return pipeline.indexContent({
    id: contentId,
    content: `# ${title}\n\n${content}`,
    metadata: {
      contentType: "support_kb",
      title,
      tags: [category, ...(metadata?.tags as string[] ?? [])],
      ...(metadata ?? {}),
    },
  });
}

/**
 * Index a FAQ question-answer pair.
 * Stored as a single chunk optimized for Q&A retrieval.
 */
export async function indexFAQ(
  question: string,
  answer: string,
  category: string,
): Promise<{ contentId: string; chunksIndexed: number }> {
  const pipeline = getPipeline();
  const contentId = `faq_${category}_${question.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "").slice(0, 60)}`;

  return pipeline.indexContent({
    id: contentId,
    content: `Question: ${question}\n\nAnswer: ${answer}`,
    metadata: {
      contentType: "support_kb",
      title: question,
      tags: [category, "faq"],
    },
  });
}

/**
 * Rebuild the entire knowledge base index.
 * Deletes all existing entries and re-indexes from seed data.
 */
export async function rebuildIndex(): Promise<{
  totalDocuments: number;
  totalChunks: number;
}> {
  let totalDocuments = 0;
  let totalChunks = 0;

  // Index all seed data
  for (const item of SEED_FAQ) {
    const result = await indexFAQ(item.question, item.answer, item.category);
    totalDocuments++;
    totalChunks += result.chunksIndexed;
  }

  for (const item of SEED_DOCS) {
    const result = await indexDocument(
      item.title,
      item.content,
      item.category,
    );
    totalDocuments++;
    totalChunks += result.chunksIndexed;
  }

  return { totalDocuments, totalChunks };
}

// ── Seed Data ──────────────────────────────────────────────────

const SEED_FAQ = [
  // Billing
  {
    category: "billing",
    question: "What plans does Cronix offer?",
    answer:
      "Cronix offers four plans: Free ($0/month — 1 site, client-side AI, 1 GB storage), Pro ($29/month — unlimited sites, 10,000 AI credits, 50 GB storage, 60 min video), Team ($79/seat/month — 50,000 AI credits, 200 GB, 300 min video, real-time collaboration), and Enterprise (custom pricing — unlimited everything, SSO, HIPAA, dedicated infrastructure). Annual billing saves roughly 20%.",
  },
  {
    category: "billing",
    question: "How do I upgrade or downgrade my plan?",
    answer:
      "Go to Settings > Billing and click 'Change Plan'. Upgrades take effect immediately with prorated billing. Downgrades take effect at the end of your current billing period. You can also manage your subscription through the Stripe Customer Portal.",
  },
  {
    category: "billing",
    question: "How do I cancel my subscription?",
    answer:
      "Go to Settings > Billing > Cancel Subscription. You can cancel immediately or at the end of your billing period. If you cancel at period end, you keep access until then. Immediate cancellation processes a prorated refund for unused time.",
  },
  {
    category: "billing",
    question: "What payment methods do you accept?",
    answer:
      "We accept all major credit and debit cards (Visa, Mastercard, American Express, Discover) through Stripe. Enterprise customers can pay by invoice with NET-30 terms.",
  },
  {
    category: "billing",
    question: "How do AI credits work?",
    answer:
      "AI credits are consumed when you use server-side AI features (edge or cloud tier). Client-side AI via WebGPU is always free and does not use credits. Different operations cost different amounts: text generation uses 1 credit per 1,000 tokens, image generation uses 10 credits, video processing uses 5 credits per minute. Usage resets each billing period.",
  },
  {
    category: "billing",
    question: "Can I get a refund?",
    answer:
      "We offer a 14-day money-back guarantee on all plans. If you are not satisfied within the first 14 days, contact support for a full refund. After 14 days, we offer prorated refunds for annual plans cancelled mid-term. Monthly plans are not refunded for the current period.",
  },
  {
    category: "billing",
    question: "Do you offer discounts for nonprofits or education?",
    answer:
      "Yes! We offer 50% off for verified nonprofits and educational institutions. Contact support with proof of status and we will apply the discount to your account.",
  },

  // Account
  {
    category: "account",
    question: "How do I reset my passkey?",
    answer:
      "Cronix uses passkeys (WebAuthn/FIDO2) for authentication. If you lose access to your passkey device, go to the login page and click 'Account Recovery'. You will need to verify your identity via email, then register a new passkey from your current device.",
  },
  {
    category: "account",
    question: "How do I add a team member?",
    answer:
      "Team plan required. Go to Settings > Team > Invite Member. Enter their email and select a role (admin, editor, viewer). They will receive an email invitation. Team members can collaborate in real-time on all shared projects.",
  },
  {
    category: "account",
    question: "How do I delete my account?",
    answer:
      "Go to Settings > Account > Delete Account. This permanently deletes all your data, sites, and projects. Active subscriptions are cancelled immediately. This action cannot be undone. We retain minimal data as required by law for 30 days after deletion.",
  },

  // Features
  {
    category: "features",
    question: "What is the AI website builder?",
    answer:
      "The Cronix AI website builder lets you create full websites by describing what you want in natural language. The AI agent generates component trees, layouts, content, and styling. You can collaborate with the AI in real-time, making edits while it generates. It uses the three-tier compute model: small tasks run free on your GPU, medium tasks on edge servers, heavy generation on cloud GPUs.",
  },
  {
    category: "features",
    question: "What is client-side AI and how does it work?",
    answer:
      "Cronix runs AI models directly in your browser using WebGPU acceleration. Models under 2B parameters (like Llama 3.1 8B) run at 41+ tokens/second with zero server cost. This means text generation, summarization, and classification are completely free. Your device needs a modern GPU (integrated or discrete) and a WebGPU-capable browser (Chrome 113+, Edge 113+, Firefox with flag).",
  },
  {
    category: "features",
    question: "How does real-time collaboration work?",
    answer:
      "Cronix uses CRDTs (Conflict-free Replicated Data Types) via Yjs for real-time collaboration. Multiple users and AI agents can edit the same project simultaneously without conflicts. Changes sync in under 50ms globally via edge servers. You see live cursors, selections, and edits from all participants. Available on Team and Enterprise plans.",
  },
  {
    category: "features",
    question: "What is the AI video builder?",
    answer:
      "The AI video builder lets you create and edit videos using AI assistance. It uses WebGPU for client-side video processing (encoding, decoding, effects) and cloud GPUs for heavy rendering. You can describe scenes, generate transitions, add effects, and export in multiple formats. Real-time collaboration lets multiple people edit together.",
  },

  // Getting Started
  {
    category: "getting_started",
    question: "How do I create my first website?",
    answer:
      "1. Sign up at cronix.dev and create a passkey. 2. Click 'New Project' and choose 'Website'. 3. Describe your website to the AI builder or start from a template. 4. Customize using the visual editor or AI chat. 5. Preview your site. 6. Click 'Publish' to go live. Free plan includes 1 published site.",
  },
  {
    category: "getting_started",
    question: "What browsers are supported?",
    answer:
      "Cronix works on all modern browsers: Chrome 113+, Edge 113+, Firefox 121+, Safari 17.4+. For the best experience with WebGPU AI features, use Chrome or Edge. All browsers support the full editing and publishing experience. Mobile browsers are supported for viewing and light editing.",
  },
  {
    category: "getting_started",
    question: "How do I connect a custom domain?",
    answer:
      "Pro plan required. Go to your project Settings > Domains > Add Custom Domain. Enter your domain name. You will need to add a CNAME record pointing to your-project.cronix.dev at your DNS provider. SSL is provisioned automatically. DNS propagation takes 1-48 hours.",
  },

  // Troubleshooting
  {
    category: "troubleshooting",
    question: "Why is client-side AI not working?",
    answer:
      "Client-side AI requires WebGPU support. Check: 1. Use Chrome 113+ or Edge 113+. 2. Ensure your GPU drivers are up to date. 3. Check chrome://gpu for WebGPU status. 4. Some integrated GPUs may not have enough VRAM — minimum 4GB recommended. 5. Try enabling the 'Unsafe WebGPU Support' flag in chrome://flags if on older hardware. If WebGPU is unavailable, AI requests automatically fall back to edge/cloud servers (uses AI credits).",
  },
  {
    category: "troubleshooting",
    question: "My site is loading slowly. What can I do?",
    answer:
      "1. Check your component count — keep pages under 200 components for best performance. 2. Optimize images — use WebP/AVIF formats. 3. Check the Performance tab in Cronix dashboard for specific bottlenecks. 4. Ensure you are not loading large AI models on page load. 5. Contact support if performance issues persist — we can analyze your specific site.",
  },
  {
    category: "troubleshooting",
    question: "I am getting a 'quota exceeded' error.",
    answer:
      "This means you have used all your AI credits or storage for the current billing period. Options: 1. Wait for your billing period to reset (check Settings > Billing for the date). 2. Upgrade to a higher plan for more credits. 3. Use client-side AI (WebGPU) which is always free. 4. Contact support if you believe this is an error.",
  },
];

const SEED_DOCS = [
  {
    category: "platform",
    title: "Cronix Platform Overview",
    content:
      "Cronix is the most advanced AI-native full-stack platform purpose-built for AI website builders and AI video creators. It combines WebGPU client-side AI inference, edge computing via Cloudflare Workers, and cloud GPU power into a unified three-tier compute model. The platform features real-time collaboration powered by CRDTs, a zero-HTML component architecture using SolidJS, and AI woven into every layer from routing to error recovery. Key technologies: SolidJS + SolidStart (frontend), Hono + Bun (backend), tRPC (type-safe API), Drizzle ORM (database), Turso (edge SQLite), Neon (serverless PostgreSQL), Qdrant (vector search), Cloudflare Workers (edge compute), Modal.com (GPU compute).",
  },
  {
    category: "platform",
    title: "Three-Tier Compute Model",
    content:
      "Cronix's three-tier compute model automatically routes AI workloads to the optimal tier. Tier 1 (Client GPU): WebGPU-accelerated inference at $0/token, sub-10ms latency, handles models under 2B parameters. Tier 2 (Edge): Cloudflare Workers with sub-50ms latency for lightweight inference. Tier 3 (Cloud): Modal.com H100 GPUs for heavy inference, training, and video processing. The system checks device capability, model size, and latency requirements to automatically route to the cheapest tier that meets constraints. Fallback chain ensures zero failures: Client -> Edge -> Cloud -> Queue.",
  },
  {
    category: "security",
    title: "Security and Authentication",
    content:
      "Cronix uses passkeys (WebAuthn/FIDO2) as the primary authentication method — phishing-immune, 98% login success rate, 17x faster than password + 2FA. Zero-trust architecture: every request authenticated regardless of network location. Encryption: TLS 1.3 in transit, AES-256-GCM at rest, envelope encryption with KMS-managed keys. Immutable audit trail with SHA-256 hash chaining. SOC 2 Type II, HIPAA, GDPR compliant. All data stored in WORM-compliant storage for legal admissibility.",
  },
  {
    category: "api",
    title: "API and Integration",
    content:
      "Cronix provides multiple integration options: tRPC for internal type-safe API, REST API for third-party integrations, GraphQL for complex queries, WebSockets + SSE for real-time, OAuth 2.0/OIDC and SAML 2.0 for authentication, SCIM for provisioning, MCP for AI tool integration. Platform integrations include Zoom, Microsoft 365, Google Workspace, Slack, Zapier, Make, and n8n. Rate limits apply to all public endpoints.",
  },
];

export { SEED_FAQ, SEED_DOCS };

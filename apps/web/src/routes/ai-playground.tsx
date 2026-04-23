// ── AI Playground: Redirect to real surfaces ─────────────────────────
//
// The old /ai-playground route shipped a demo-theatre: a fake AI chat
// with setTimeout + canned "Here is a high-performance SolidJS
// component based on your request..." responses and hardcoded
// tokens-per-second numbers. Public route with zero auth — so any
// visitor saw fabricated AI output presented as real. That is the
// exact brand-damage pattern CLAUDE.md §1 bans.
//
// The platform already has two real AI surfaces:
//   • /chat — Claude-native chat with BYOK (real Anthropic API)
//   • /builder — the three-tier compute router that actually picks
//     client GPU vs edge vs cloud based on device capability
//
// This page is a landing that forwards visitors to the real thing
// rather than pretending to be it. Zero HTML, polite copy, no
// competitor names.

import { A } from "@solidjs/router";
import type { JSX } from "solid-js";
import { SEOHead } from "../components/SEOHead";
import { Icon, type IconName } from "../components/Icon";

interface Surface {
  readonly icon: IconName;
  readonly title: string;
  readonly body: string;
  readonly href: string;
  readonly cta: string;
}

const SURFACES: ReadonlyArray<Surface> = [
  {
    icon: "brain",
    title: "Claude Chat",
    body:
      "Direct Anthropic API access with your own key. No subscription, no rate-limits from us, no surprises. Bring your key, pay per token, stream responses.",
    href: "/chat",
    cta: "Open Claude Chat",
  },
  {
    icon: "zap",
    title: "Component Composer",
    body:
      "Generate validated SolidJS component trees from a prompt. Three-tier compute routing picks client GPU, edge, or cloud H100 based on your device and the task. Every response is typed end to end.",
    href: "/builder",
    cta: "Open Composer",
  },
];

export default function AiPlaygroundPage(): JSX.Element {
  return (
    <>
      <SEOHead
        title="AI Playground"
        description="The Crontech AI surfaces — Claude Chat with BYOK, and the Component Composer with three-tier compute routing."
        path="/ai-playground"
      />

      <div class="min-h-screen" style={{ background: "#0a0a0f" }}>
        {/* ── Hero ─────────────────────────────────────────────── */}
        <section class="relative overflow-hidden">
          <div
            class="absolute inset-0 pointer-events-none"
            style={{
              background:
                "radial-gradient(1200px 500px at 50% -10%, rgba(56,189,248,0.18), transparent 60%), radial-gradient(800px 400px at 85% 20%, rgba(139,92,246,0.14), transparent 60%)",
            }}
            aria-hidden="true"
          />
          <div class="relative mx-auto max-w-5xl px-6 pt-24 pb-12 text-center">
            <span
              class="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em]"
              style={{
                background: "rgba(255,255,255,0.04)",
                color: "rgba(255,255,255,0.75)",
                border: "1px solid rgba(255,255,255,0.18)",
              }}
            >
              <span
                class="h-1.5 w-1.5 rounded-full"
                style={{ background: "#38bdf8" }}
                aria-hidden="true"
              />
              Live AI surfaces
            </span>
            <h1
              class="mt-6 text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl"
              style={{ color: "#f0f0f5" }}
            >
              Real AI, not a demo.
            </h1>
            <p
              class="mx-auto mt-6 max-w-2xl text-base leading-relaxed sm:text-lg"
              style={{ color: "rgba(255,255,255,0.65)" }}
            >
              The Crontech AI layer is two real surfaces today — Claude
              Chat and the Component Composer. Pick one below and you'll
              be talking to an actual model within seconds.
            </p>
          </div>
        </section>

        {/* ── Two surfaces ─────────────────────────────────────── */}
        <section class="mx-auto max-w-5xl px-6 pb-24">
          <div class="grid gap-6 md:grid-cols-2">
            {SURFACES.map((surface) => (
              <article
                class="flex flex-col rounded-2xl p-7"
                style={{
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  "box-shadow": "0 2px 12px rgba(0,0,0,0.25)",
                }}
              >
                <div
                  class="flex h-12 w-12 items-center justify-center rounded-xl"
                  style={{
                    background:
                      "linear-gradient(135deg, rgba(56,189,248,0.2), rgba(139,92,246,0.18))",
                    color: "#bae6fd",
                    border: "1px solid rgba(56,189,248,0.28)",
                  }}
                >
                  <Icon name={surface.icon} size={22} />
                </div>
                <h2
                  class="mt-5 text-xl font-semibold tracking-tight"
                  style={{ color: "#f0f0f5" }}
                >
                  {surface.title}
                </h2>
                <p
                  class="mt-2 text-sm leading-[1.75]"
                  style={{ color: "rgba(255,255,255,0.6)" }}
                >
                  {surface.body}
                </p>
                <A
                  href={surface.href}
                  class="mt-6 inline-flex w-fit items-center justify-center rounded-lg px-5 py-2.5 text-sm font-semibold transition"
                  style={{
                    background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                    color: "#ffffff",
                    "box-shadow": "0 8px 24px -8px rgba(99,102,241,0.55)",
                    "text-decoration": "none",
                  }}
                >
                  {surface.cta} &rarr;
                </A>
              </article>
            ))}
          </div>
          <p
            class="mt-8 text-center text-xs"
            style={{ color: "rgba(255,255,255,0.45)" }}
          >
            No canned responses, no fake tokens-per-second. Both surfaces
            call real models with your real key.
          </p>
        </section>
      </div>
    </>
  );
}

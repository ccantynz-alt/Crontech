import { Title } from "@solidjs/meta";
import { createSignal, For, Show } from "solid-js";
import type { JSX } from "solid-js";

// ── Types ────────────────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  model?: string;
  tier?: string;
  tokensPerSec?: number;
}

interface ModelOption {
  id: string;
  name: string;
  provider: string;
  tier: "client" | "edge" | "cloud";
  badge?: string;
}

// ── Mock Data ────────────────────────────────────────────────────────

const MODELS: ModelOption[] = [
  { id: "llama-3.1-8b", name: "Llama 3.1 8B", provider: "Meta", tier: "client", badge: "$0/token" },
  { id: "smollm2-360m", name: "SmolLM2 360M", provider: "Hugging Face", tier: "client", badge: "$0/token" },
  { id: "gemma-2b", name: "Gemma 2B", provider: "Google", tier: "client", badge: "$0/token" },
  { id: "gpt-4o", name: "GPT-4o", provider: "OpenAI", tier: "cloud" },
  { id: "claude-sonnet", name: "Claude 4 Sonnet", provider: "Anthropic", tier: "cloud" },
  { id: "workers-ai", name: "Workers AI", provider: "Cloudflare", tier: "edge" },
];

const INITIAL_MESSAGES: ChatMessage[] = [
  {
    id: "1",
    role: "assistant",
    content: "Welcome to the Crontech AI Playground. I am running directly in your browser via WebGPU -- zero server costs, zero latency.\n\nTry asking me to generate a landing page component, explain an architecture concept, or write optimized code. Switch models using the panel on the left.",
    timestamp: new Date(),
    model: "llama-3.1-8b",
    tier: "client",
  },
];

const SAMPLE_CODE = `// AI-generated SolidJS component
import { createSignal } from "solid-js";

interface HeroProps {
  title: string;
  subtitle: string;
  ctaLabel: string;
  onCta: () => void;
}

export function Hero(props: HeroProps) {
  const [hovered, setHovered] = createSignal(false);

  return (
    <section class="relative overflow-hidden py-24 bg-white">
      <div class="relative mx-auto max-w-4xl text-center">
        <h1 class="text-6xl font-bold text-slate-900">
          {props.title}
        </h1>
        <p class="mt-6 text-xl text-slate-600">
          {props.subtitle}
        </p>
        <button
          onClick={props.onCta}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          class="mt-10 rounded-2xl bg-indigo-600 px-8 py-4
            text-lg font-semibold text-white
            transition-all hover:bg-indigo-700"
        >
          {props.ctaLabel}
        </button>
      </div>
    </section>
  );
}`;

// ── Tier Badge ───────────────────────────────────────────────────────

function TierBadge(props: { tier: "client" | "edge" | "cloud" }): JSX.Element {
  const config = (): { label: string; color: string } => {
    switch (props.tier) {
      case "client":
        return { label: "Client GPU", color: "#059669" };
      case "edge":
        return { label: "Edge", color: "#4f46e5" };
      case "cloud":
        return { label: "Cloud", color: "#ea580c" };
    }
  };

  return (
    <span
      class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider"
      style={{ background: `${config().color}14`, color: config().color }}
    >
      <span
        class="h-1.5 w-1.5 rounded-full"
        style={{ background: config().color }}
      />
      {config().label}
    </span>
  );
}

// ── Chat Bubble ──────────────────────────────────────────────────────

function ChatBubble(props: { message: ChatMessage }): JSX.Element {
  const isUser = (): boolean => props.message.role === "user";

  return (
    <div class={`flex gap-3 ${isUser() ? "flex-row-reverse" : ""}`}>
      {/* Avatar */}
      <div
        class="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-xs font-bold text-white"
        style={{
          background: isUser() ? "#4f46e5" : "#059669",
        }}
      >
        {isUser() ? "Y" : "AI"}
      </div>

      {/* Content */}
      <div class={`flex max-w-[80%] flex-col gap-1.5 ${isUser() ? "items-end" : ""}`}>
        <div
          class={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
            isUser()
              ? "bg-indigo-50 border border-indigo-200 text-slate-900"
              : "bg-white border border-slate-200 text-slate-800"
          }`}
          style={{ "white-space": "pre-wrap" }}
        >
          {props.message.content}
        </div>
        <div class="flex items-center gap-2 px-1">
          <Show when={props.message.tier}>
            <TierBadge tier={props.message.tier as "client" | "edge" | "cloud"} />
          </Show>
          <Show when={props.message.tokensPerSec}>
            <span class="text-[10px] text-slate-500">{props.message.tokensPerSec} tok/s</span>
          </Show>
          <span class="text-[10px] text-slate-400">
            {props.message.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── AI Playground Page ───────────────────────────────────────────────

export default function AIPlayground(): JSX.Element {
  const [messages, setMessages] = createSignal<ChatMessage[]>(INITIAL_MESSAGES);
  const [input, setInput] = createSignal("");
  const [isGenerating, setIsGenerating] = createSignal(false);
  const [selectedModel, setSelectedModel] = createSignal("llama-3.1-8b");
  const [temperature, setTemperature] = createSignal(0.7);
  const [maxTokens, setMaxTokens] = createSignal(2048);
  const [showCodePanel, setShowCodePanel] = createSignal(true);
  const [codeCopied, setCodeCopied] = createSignal(false);
  const [codeInserted, setCodeInserted] = createSignal(false);

  // Performance stats
  const [tokensPerSec] = createSignal(41.2);
  const [totalTokens, setTotalTokens] = createSignal(1284);
  const [sessionCost] = createSignal("$0.00");

  const currentModel = (): ModelOption => {
    const found = MODELS.find((m) => m.id === selectedModel());
    return found ?? (MODELS[0] as ModelOption);
  };

  const handleSend = (): void => {
    if (!input().trim() || isGenerating()) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: input().trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsGenerating(true);

    // Simulate AI response
    setTimeout(() => {
      const aiMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: `Here is a high-performance SolidJS component based on your request. The implementation uses signals for surgical DOM updates, zero virtual DOM overhead, and is fully type-safe.\n\nThe component is rendered using ${currentModel().name} running on the ${currentModel().tier === "client" ? "client GPU via WebGPU" : currentModel().tier === "edge" ? "Cloudflare Workers edge network" : "cloud GPU cluster"}. Check the code preview panel for the generated source.`,
        timestamp: new Date(),
        model: currentModel().name,
        tier: currentModel().tier,
        tokensPerSec: currentModel().tier === "client" ? 41 : currentModel().tier === "edge" ? 128 : 84,
      };
      setMessages((prev) => [...prev, aiMsg]);
      setIsGenerating(false);
      setTotalTokens((prev) => prev + 247);
    }, 1500);
  };

  const handleKeyDown = (e: KeyboardEvent): void => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div class="flex h-screen bg-white">
      <Title>AI Playground - Crontech</Title>

      {/* Left Panel - Controls */}
      <div class="flex w-72 shrink-0 flex-col border-r border-slate-200 bg-slate-50">
        {/* Header */}
        <div class="border-b border-slate-200 px-5 py-4">
          <div class="flex items-center gap-3">
            <div
              class="flex h-10 w-10 items-center justify-center rounded-xl"
              style={{ background: "rgba(79,70,229,0.08)", color: "#4f46e5" }}
            >
              <span class="text-lg">&#9889;</span>
            </div>
            <div>
              <h1 class="text-base font-bold text-slate-900">AI Playground</h1>
              <p class="text-[10px] text-slate-500">Three-tier compute inference</p>
            </div>
          </div>
        </div>

        {/* Compute Tier Indicator */}
        <div class="border-b border-slate-200 px-5 py-4">
          <span class="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Active Compute Tier</span>
          <div class="mt-3 flex flex-col gap-2">
            <div class={`flex items-center gap-2.5 rounded-lg px-3 py-2 transition-all ${currentModel().tier === "client" ? "border border-emerald-200 bg-emerald-50" : "opacity-50"}`}>
              <div class="h-2 w-2 rounded-full" style={{ background: "#059669" }} />
              <span class="text-xs text-emerald-700">Client GPU</span>
              <span class="ml-auto text-[10px] text-emerald-600/70">$0/token</span>
            </div>
            <div class={`flex items-center gap-2.5 rounded-lg px-3 py-2 transition-all ${currentModel().tier === "edge" ? "border border-indigo-200 bg-indigo-50" : "opacity-50"}`}>
              <div class="h-2 w-2 rounded-full" style={{ background: "#4f46e5" }} />
              <span class="text-xs text-indigo-700">Edge Network</span>
              <span class="ml-auto text-[10px] text-indigo-600/70">sub-50ms</span>
            </div>
            <div class={`flex items-center gap-2.5 rounded-lg px-3 py-2 transition-all ${currentModel().tier === "cloud" ? "border border-orange-200 bg-orange-50" : "opacity-50"}`}>
              <div class="h-2 w-2 rounded-full" style={{ background: "#ea580c" }} />
              <span class="text-xs text-orange-700">Cloud GPU</span>
              <span class="ml-auto text-[10px] text-orange-600/70">H100</span>
            </div>
          </div>
        </div>

        {/* Model Selector */}
        <div class="border-b border-slate-200 px-5 py-4">
          <span class="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Model</span>
          <div class="mt-3 flex flex-col gap-1">
            <For each={MODELS}>
              {(model) => (
                <button
                  type="button"
                  onClick={() => setSelectedModel(model.id)}
                  class={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-left transition-all duration-150 ${
                    selectedModel() === model.id
                      ? "border border-slate-200 bg-white text-slate-900 shadow-sm"
                      : "border border-transparent text-slate-500 hover:bg-white hover:text-slate-800"
                  }`}
                >
                  <div class="flex min-w-0 flex-1 flex-col">
                    <span class="text-xs font-medium">{model.name}</span>
                    <span class="text-[10px] text-slate-500">{model.provider}</span>
                  </div>
                  <Show when={model.badge}>
                    <span
                      class="rounded-full px-2 py-0.5 text-[9px] font-semibold"
                      style={{
                        background: model.tier === "client" ? "rgba(5,150,105,0.1)" : model.tier === "edge" ? "rgba(79,70,229,0.1)" : "rgba(234,88,12,0.1)",
                        color: model.tier === "client" ? "#059669" : model.tier === "edge" ? "#4f46e5" : "#ea580c",
                      }}
                    >
                      {model.badge}
                    </span>
                  </Show>
                </button>
              )}
            </For>
          </div>
        </div>

        {/* Parameters */}
        <div class="border-b border-slate-200 px-5 py-4">
          <span class="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Parameters</span>
          <div class="mt-3 flex flex-col gap-4">
            {/* Temperature */}
            <div>
              <div class="mb-2 flex items-center justify-between">
                <span class="text-xs text-slate-600">Temperature</span>
                <span class="rounded bg-white border border-slate-200 px-2 py-0.5 text-[11px] font-mono text-slate-700">{temperature().toFixed(1)}</span>
              </div>
              <input
                type="range"
                min="0"
                max="2"
                step="0.1"
                value={temperature()}
                onInput={(e) => setTemperature(parseFloat(e.currentTarget.value))}
                class="w-full accent-indigo-600"
                style={{ height: "4px" }}
              />
            </div>
            {/* Max Tokens */}
            <div>
              <div class="mb-2 flex items-center justify-between">
                <span class="text-xs text-slate-600">Max Tokens</span>
                <span class="rounded bg-white border border-slate-200 px-2 py-0.5 text-[11px] font-mono text-slate-700">{maxTokens()}</span>
              </div>
              <input
                type="range"
                min="256"
                max="8192"
                step="256"
                value={maxTokens()}
                onInput={(e) => setMaxTokens(parseInt(e.currentTarget.value, 10))}
                class="w-full accent-indigo-600"
                style={{ height: "4px" }}
              />
            </div>
          </div>
        </div>

        {/* Performance Stats */}
        <div class="mt-auto border-t border-slate-200 px-5 py-4">
          <span class="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Session Stats</span>
          <div class="mt-3 grid grid-cols-2 gap-3">
            <div class="flex flex-col gap-0.5">
              <span class="text-[10px] text-slate-500">Tokens/sec</span>
              <span class="text-lg font-bold text-emerald-700">{tokensPerSec().toFixed(1)}</span>
            </div>
            <div class="flex flex-col gap-0.5">
              <span class="text-[10px] text-slate-500">Total Tokens</span>
              <span class="text-lg font-bold text-indigo-700">{totalTokens().toLocaleString()}</span>
            </div>
            <div class="flex flex-col gap-0.5">
              <span class="text-[10px] text-slate-500">Session Cost</span>
              <span class="text-lg font-bold text-emerald-700">{sessionCost()}</span>
            </div>
            <div class="flex flex-col gap-0.5">
              <span class="text-[10px] text-slate-500">Model</span>
              <span class="truncate text-xs font-medium text-slate-700">{currentModel().name}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Center - Chat Interface */}
      <div class="flex flex-1 flex-col overflow-hidden">
        {/* Chat Header */}
        <div class="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
          <div class="flex items-center gap-3">
            <span class="text-sm font-semibold text-slate-900">Chat</span>
            <TierBadge tier={currentModel().tier} />
          </div>
          <div class="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowCodePanel(!showCodePanel())}
              class={`rounded-lg border px-3 py-1.5 text-[11px] font-medium transition-all duration-200 ${
                showCodePanel()
                  ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                  : "border-slate-200 bg-white text-slate-600 hover:text-slate-900"
              }`}
            >
              Code Preview
            </button>
            <button
              type="button"
              onClick={() => { setMessages(INITIAL_MESSAGES); setTotalTokens(0); }}
              class="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-600 transition-all hover:text-slate-900"
            >
              Clear
            </button>
          </div>
        </div>

        {/* Messages */}
        <div class="flex-1 overflow-y-auto bg-slate-50 px-6 py-6">
          <div class="mx-auto flex max-w-3xl flex-col gap-6">
            <For each={messages()}>
              {(msg) => <ChatBubble message={msg} />}
            </For>

            {/* Generating indicator */}
            <Show when={isGenerating()}>
              <div class="flex gap-3">
                <div
                  class="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-xs font-bold text-white"
                  style={{ background: "#059669" }}
                >
                  AI
                </div>
                <div class="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <div class="flex items-center gap-1.5">
                    <div class="h-2 w-2 animate-pulse rounded-full" style={{ background: "#4f46e5" }} />
                    <div class="h-2 w-2 animate-pulse rounded-full" style={{ background: "#4f46e5", "animation-delay": "0.2s" }} />
                    <div class="h-2 w-2 animate-pulse rounded-full" style={{ background: "#4f46e5", "animation-delay": "0.4s" }} />
                  </div>
                </div>
              </div>
            </Show>
          </div>
        </div>

        {/* Input Area */}
        <div class="border-t border-slate-200 bg-white px-6 py-4">
          <div class="mx-auto max-w-3xl">
            <div class="flex items-end gap-3 rounded-2xl border border-slate-200 bg-white p-2 transition-all duration-200 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-100">
              <textarea
                value={input()}
                onInput={(e) => setInput(e.currentTarget.value)}
                onKeyDown={handleKeyDown}
                placeholder="Describe what you want to build..."
                rows={1}
                class="flex-1 resize-none bg-transparent px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 outline-none"
                style={{ "max-height": "120px" }}
              />
              <button
                type="button"
                onClick={handleSend}
                disabled={!input().trim() || isGenerating()}
                class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white transition-all duration-200 hover:bg-indigo-700 disabled:opacity-30"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M22 2L11 13" />
                  <path d="M22 2L15 22L11 13L2 9L22 2Z" />
                </svg>
              </button>
            </div>
            <div class="mt-2 flex items-center justify-between px-1">
              <span class="text-[10px] text-slate-500">
                Shift+Enter for new line
              </span>
              <span class="text-[10px] text-slate-500">
                Powered by {currentModel().name} on {currentModel().tier === "client" ? "your GPU" : currentModel().tier === "edge" ? "edge network" : "cloud"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel - Code Preview */}
      <Show when={showCodePanel()}>
        <div class="flex w-96 shrink-0 flex-col border-l border-slate-200 bg-slate-50">
          <div class="flex items-center justify-between border-b border-slate-200 px-5 py-3">
            <div class="flex items-center gap-2">
              <span class="text-xs font-semibold text-slate-900">Code Preview</span>
              <span class="rounded-full bg-indigo-50 border border-indigo-200 px-2 py-0.5 text-[9px] font-semibold uppercase text-indigo-700">Live</span>
            </div>
            <div class="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(SAMPLE_CODE);
                  setCodeCopied(true);
                  setTimeout(() => setCodeCopied(false), 2000);
                }}
                class="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-medium text-slate-600 transition-all hover:text-slate-900"
              >
                {codeCopied() ? "Copied!" : "Copy"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setInput((prev) => prev + (prev ? "\n" : "") + SAMPLE_CODE);
                  setCodeInserted(true);
                  setTimeout(() => setCodeInserted(false), 2000);
                }}
                class="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-medium text-slate-600 transition-all hover:text-slate-900"
              >
                {codeInserted() ? "Inserted!" : "Insert"}
              </button>
            </div>
          </div>

          {/* File Tab */}
          <div class="flex border-b border-slate-200 bg-white">
            <div class="flex items-center gap-2 border-b-2 border-indigo-600 px-4 py-2.5">
              <span class="text-[10px] text-indigo-600">&#128196;</span>
              <span class="text-[11px] font-medium text-slate-800">Hero.tsx</span>
            </div>
            <div class="flex items-center gap-2 px-4 py-2.5">
              <span class="text-[10px] text-slate-400">&#128196;</span>
              <span class="text-[11px] text-slate-500">styles.css</span>
            </div>
          </div>

          {/* Code Content */}
          <div class="flex-1 overflow-auto bg-white p-4">
            <pre class="text-xs leading-6" style={{ "tab-size": "2" }}>
              <code>
                <For each={SAMPLE_CODE.split("\n")}>
                  {(line, i) => (
                    <div class="flex">
                      <span class="mr-4 inline-block w-6 text-right text-slate-400 select-none">{i() + 1}</span>
                      <span class="text-slate-800" style={{ "white-space": "pre" }}>{line}</span>
                    </div>
                  )}
                </For>
              </code>
            </pre>
          </div>

          {/* Code Stats */}
          <div class="border-t border-slate-200 bg-white px-5 py-3">
            <div class="flex items-center justify-between text-[10px] text-slate-500">
              <span>TypeScript JSX</span>
              <span>{SAMPLE_CODE.split("\n").length} lines</span>
              <span>UTF-8</span>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
}

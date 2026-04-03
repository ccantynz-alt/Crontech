# ADR-002: SolidJS Over React

## Status: accepted

## Date: 2026-04-03

## Context

The frontend framework choice determines rendering performance, bundle size,
developer experience, and how deeply AI can compose UI at runtime. Back to the
Future's zero-HTML, component-only architecture demands a framework where JSX
compiles to direct DOM operations — not a virtual DOM diffing layer.

Key requirements:

- Sub-1s First Contentful Paint, sub-1.5s Largest Contentful Paint.
- Initial JavaScript bundle under 50KB.
- True reactivity: when state changes, only the exact DOM nodes that depend on
  it should update. Nothing else should re-render.
- AI-composable component trees via Zod schemas and json-render.
- Server-side rendering and file-based routing (via SolidStart).

## Decision

We adopt **SolidJS** with **SolidStart** as the primary frontend framework.

SolidJS compiles JSX to direct, surgical DOM mutations via a fine-grained
reactivity system built on signals. There is no virtual DOM, no diffing
algorithm, no reconciliation pass. When a signal changes, only the specific
DOM node bound to that signal updates. This is the theoretically optimal
rendering model.

SolidStart provides:

- File-based routing with server functions.
- SSR, streaming, and islands architecture support.
- Deployment adapters for Cloudflare Pages/Workers, Vercel, Netlify, and more.

## Consequences

**Positive:**

- Rendering performance matches or exceeds vanilla JavaScript. SolidJS
  consistently tops JS Framework Benchmark rankings.
- Tiny runtime (~7KB). Easily fits within the 50KB initial bundle budget.
- Signals are a perfect fit for AI-composable UI: each component's reactive
  state is explicit and introspectable.
- No re-render debugging. Components run once; only their reactive bindings
  update. Eliminates an entire class of React performance bugs.

**Negative:**

- Smaller ecosystem than React. Fewer third-party component libraries.
  Mitigation: Kobalte, Ark UI, Corvu, and solidcn cover the critical
  headless/styled component needs.
- Smaller hiring pool. Most frontend developers know React, not SolidJS.
  Mitigation: SolidJS JSX is syntactically similar to React; onboarding is
  fast for experienced React developers.
- Some React-only libraries (e.g., Framer Motion) require SolidJS ports or
  alternatives. Mitigation: Motion (the framework-agnostic successor to
  Framer Motion) supports SolidJS.

## Alternatives Considered

| Alternative | Why Rejected |
|---|---|
| **React (Next.js)** | Virtual DOM adds overhead. Re-renders are the default; preventing them requires `useMemo`, `useCallback`, `React.memo` — all manual optimization. Bundle size is larger. We would be competing directly in Vercel's ecosystem instead of occupying whitespace. |
| **Svelte (SvelteKit)** | Compiles away the framework, which is good. However, Svelte's reactivity model (compile-time `$:` labels / runes) is less composable than SolidJS signals for programmatic AI-driven UI generation. SolidJS signals are runtime primitives that AI agents can create and wire dynamically. |
| **Qwik** | Resumability is innovative but adds complexity. The lazy-loading model means every interaction potentially triggers a network request for code. For an AI-native platform that needs instant responsiveness, this trade-off is unfavorable. |
| **Vue 3 (Nuxt)** | Good reactivity (Composition API), but the template compiler and Options API legacy add weight. SolidJS is leaner and faster for our use case. |

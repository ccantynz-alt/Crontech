# ADR-001: Turborepo + Bun Monorepo

## Status: accepted

## Date: 2026-04-03

## Context

Back to the Future requires a monorepo strategy that supports multiple
applications (web, API, services), shared packages (UI, schemas, AI core,
database, config), and infrastructure tooling. Developer velocity is a
first-order concern — slow installs, slow builds, and slow task orchestration
directly block the mission of staying 80%+ ahead of all competition.

Key requirements:

- Fast dependency installation (the codebase will grow to dozens of packages).
- Incremental, cache-aware task execution across the workspace.
- Native TypeScript execution without a separate compile step during development.
- Built-in test runner, bundler, and package manager to reduce toolchain surface area.

## Decision

We adopt **Turborepo** for monorepo task orchestration and **Bun** as the
runtime, package manager, test runner, and bundler.

**Turborepo** provides:

- Content-aware hashing and remote caching for build tasks.
- Topological dependency ordering (`dependsOn: ["^build"]`).
- Parallel task execution with minimal configuration.

**Bun** provides:

- 10-20x faster package installs than npm.
- Native TypeScript execution (no `ts-node`, no `tsx`, no compile step).
- Built-in test runner (`bun test`), bundler, and HTTP server.
- 52K+ req/s HTTP performance, 8-15ms cold starts.
- Single binary replaces Node.js + npm + npx + ts-node.

## Consequences

**Positive:**

- A single `bun install` for the entire workspace completes in seconds.
- Developers run TypeScript files directly (`bun run src/index.ts`) with zero config.
- Turborepo caching means unchanged packages are never rebuilt, dramatically
  reducing CI times.
- Fewer tools to install, configure, and maintain.

**Negative:**

- Bun is younger than Node.js. Some npm packages with native addons may not be
  compatible. Mitigation: Bun compatibility improves with every release and we
  track issues via Renovate.
- Turborepo remote caching requires a Vercel account or self-hosted cache.
  Mitigation: local caching works out of the box; remote caching is additive.
- Team members must learn Bun-specific APIs where they differ from Node.js.

## Alternatives Considered

| Alternative | Why Rejected |
|---|---|
| **npm workspaces + Nx** | npm installs are 10-20x slower. Nx is powerful but heavier to configure than Turborepo for our use case. |
| **pnpm workspaces + Turborepo** | pnpm is fast but still requires a separate TypeScript compilation step. Bun eliminates that entirely. |
| **Yarn Berry (PnP) + Turborepo** | Plug'n'Play causes compatibility issues with many packages. The debugging cost is not worth the disk savings. |
| **Bazel** | Massive configuration overhead. Designed for polyglot monorepos at Google scale. Overkill for a TypeScript-first project. |

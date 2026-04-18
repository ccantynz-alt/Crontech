# HANDOFF — Next Session Starts Here

**First action:** Read this file in full, then read `CLAUDE.md`, `docs/POSITIONING.md`, `docs/BUILD_BIBLE.md`. Then run `git log --oneline -8` to see the commit chain. Then decide: aggregate-and-fix, or reset to `f975386` (last known-green) and restart BLK-009 with cleaner test isolation.

---

## Current branch state

Branch `claude/review-crontech-handoff-qYEVq`, 5 commits ahead of `Main`:

```
b715a0b feat(blk-009): aggregate parallel agent output — real build-runner + sandbox + live logs + E2E test
5d0e46b wip(blk-009): partial output from in-flight parallel agents  (superseded by b715a0b, can be squashed)
d76e7ac docs(handoff): rewrite for session handover to new chat        (stale, this file replaces it)
bcf5f6b docs(handoff): rewrite session log for 2026-04-18 BLK-020 completion
f975386 feat(admin): complete BLK-020 — /admin/claude console + settings + spend tile   ← LAST KNOWN-GREEN
```

**PR #124** was opened from `f975386`: https://github.com/ccantynz-alt/Crontech/pull/124 — now shows everything above (BLK-020 + BLK-009 mixed). Either:
- Split into two PRs (reset branch to f975386, cherry-pick handoff commits → re-open BLK-009 on new branch), OR
- Update PR #124 title/description to reflect mixed scope.

---

## Gate status on HEAD (`b715a0b`)

| Gate | Result | Notes |
|------|--------|-------|
| `bun run check` | ✅ 16/16 packages, 0 TS errors | |
| `bun run build` | ❌ web package fails | Vinxi ENOENT on `ssr/.vite/manifest.json`. **TAC agent confirmed this reproduces on the unmodified tree — pre-existing environmental Vinxi bug.** Direct `bun x vinxi build` inside `apps/web` writes the manifest correctly; the turborepo wrapper script somehow bails at the Nitro step. Workaround: run `cd apps/web && bun x vinxi build` directly. |
| `bun run test` | ❌ 82 fail / 191 pass (full run) | **Every failing test passes when run in isolation.** Classic test-state pollution. The E2E test (`apps/api/test/blk009-e2e.test.ts`) and/or build-runner module-load state is leaking into other tests. Root cause likely: `bunfig.toml` `preload` wipes DB once per process, but cross-file tests share that DB and the new BLK-009 tests write more state than the others expected. |
| `bunx biome check apps packages services` | ✅ exit 0 | |
| `bun run check-links` | ✅ 0 dead | |
| `bun run check-buttons` | ✅ 0 dead | |

---

## What's in the aggregate (`b715a0b`)

22 files, 3511 insertions, 437 deletions. Agent-by-agent:

### BR agent — real build-runner
- `apps/api/src/automation/build-runner.ts` — stub replaced with real implementation: `git clone` → `bun install` → `bun run build` → orchestrator HTTP handoff via `orchestratorDeploy`. Dependency-injected `spawn`/`deploy`/`fs` for tests. 10-min hard timeout. In-memory concurrency guard. Workspace cleanup in `finally`.
- `apps/api/src/automation/build-runner.test.ts` — new. 9/9 tests pass in isolation using injected fake spawn.
- **Security flag (from BR's own report):** runs customer code on host. Fine for single-tenant v1; needs Firecracker/Docker+seccomp before opening signup.

### UI agent — live SSE log streaming
- `apps/api/src/deploy/logs-stream.ts` — Hono SSE endpoint `GET /api/deployments/:id/logs/stream`. Replays existing rows + polls for new ones. Closes on terminal deployment status.
- `apps/api/src/index.ts` — mounted the SSE endpoint in the Hono app.
- `apps/web/src/lib/useDeploymentLogStream.ts` — SolidJS hook with reconnection + jittered backoff + terminal-state detection.
- `apps/web/src/lib/useDeploymentLogStream.test.ts` — smoke tests.
- `apps/web/src/routes/deployments.tsx` — replaced placeholder data with real tRPC + live log panel.
- `apps/web/src/components/DeploymentCard.tsx` + `DeploymentLogs.tsx` — wired to the live stream.

### TEST agent — E2E integration
- `apps/api/test/blk009-e2e.test.ts` — 3 tests: signed-webhook-push triggers build → streams logs → marks live; build-failure marks failed; unsigned payload rejected. Uses `file://` URL against the fixture repo so real `git clone` runs.
- `apps/api/test/fixtures/hello-world-repo/{package.json,src/index.ts,bunfig.toml}` — minimal buildable repo, 9.5 KB total.
- `apps/api/tsconfig.json` — widened `include` to cover `test/**/*.ts` (Iron Rule 2: no orphan TS files).
- **Tests pass 3/3 in isolation; fail when co-run with the rest of the api suite.** Root cause: DB state pollution (E2E writes real deployment/user rows that persist across test-file boundaries).

### SEC agent — Docker sandbox hardening
- `services/orchestrator/src/sandbox.ts` (NEW, 298 lines) — `runInSandbox()` that containerizes build steps with cap-drop=ALL, no-new-privileges, read-only root, tmpfs /tmp + /run, non-root uid 1000, mem/cpu/pids/nofile limits, bind-mounted workspace as sole host-visible path, wall-clock timeout, path-traversal rejection on deploymentId.
- `services/orchestrator/src/docker.ts` — added `secureHostConfig`, `assertHardenedConfig`, `HARDENED_HOST_CONFIG_BASELINE`. `createContainer` fails-closed if caller didn't pass hardened config.
- `services/orchestrator/src/deployer.ts` — install + build now run via `runInSandbox`; log lines scrubbed for `*_KEY`/`*_SECRET`/`*_TOKEN`/`*_PASSWORD`/`Bearer`/PEM blocks.
- `services/orchestrator/src/caddy.ts` — atomic Caddyfile writes with rollback, marker-block append (not rewrite), `isValidHost`/`isValidUpstream` validation.
- `services/orchestrator/src/orchestrator.test.ts` — +40 tests. 69/69 pass.
- **Public API of `services/orchestrator/src/index.ts` unchanged byte-for-byte** — build-runner's HTTP handoff continues to work.
- **Honest posture:** outbound network is NOT disabled during build (would break npm install / git fetch). V2 needs egress allowlist via iptables/Cilium. Runtime app still runs on host via `Bun.spawn` (containerising runtime is a separate block).

### TAC agent — tactical sweep
- `apps/web/src/components/{AddDomainModal,DeploymentCard,DomainsPanel,ProgressTracker,VoiceGlobal,VoicePill,motion/GradientBorder}.tsx` — 12 hardcoded hex colors → CSS vars; 3 missing return types added.
- `packages/db/src/client.ts` + `packages/db/src/neon.ts` — explicit return types on exports.

### MOCK-AUDIT agent — research only
- No file writes. Report: **0 P0 pre-launch blockers.** 6 P1 items, 2 P2 items, all honestly documented (notifications/appearance tabs disabled with explanation, billing waitlist gated on `STRIPE_ENABLED`, avatar upload noted as pending file-storage). Report text in prior session; not committed.

---

## Two concrete repair paths

### Path A — fix-forward (~30–60 min work)

1. **Fix test pollution.** Change `apps/api/bunfig.toml` preload to migrate-per-file OR wrap each DB-writing test in a transaction + rollback. Simplest fix: make the E2E test's `beforeEach` truncate `deployments`, `deployment_logs`, `users`, `projects` tables.
2. **Fix Vinxi build wrapper.** The turborepo wrapper script is somehow breaking the Nitro step. Compare `turbo.json` build task config vs direct vinxi invocation. Suspect: some output/cache mis-config. Workaround exists (direct invocation works).
3. Re-run full gate. Commit "fix(blk-009): test isolation + vinxi wrapper". Push. Done.

### Path B — reset and re-ship BLK-009 cleanly

1. `git reset --hard f975386` on the branch.
2. Force-push (⚠️ this requires Craig's auth — §0.7 hard gate).
3. Cherry-pick handoff commits back on.
4. Open a NEW branch for BLK-009, apply the 22-file aggregate as one commit on it.
5. Fix test isolation before the first push. Open a separate PR #125 for BLK-009.

**Recommendation:** Path A. The code changes are genuinely valuable; the failures are pollution + env, not logic bugs.

---

## Session-environment notes (still applicable)

1. **Stop-hook auto-stashes on every stop event.** Run `git add` on new files ASAP, even before committing, to prevent the "untracked files on ..." stash commits.
2. **Worktree isolation (`isolation: "worktree"`) is NOT available.** Agents ran concurrently without isolation; non-overlapping file scopes prevented collisions.
3. **GitHub MCP tools disappear and reappear mid-session.** The `authenticate` flow needs the full callback URL pasted back as text (iPad Safari's address-bar truncation is a common snag).
4. **Vinxi SSR build bug (pre-existing).** Confirmed reproduces on unmodified tree. Not blocking the code changes in this session.

---

## Open strategic decisions for Craig

1. **PR #124 — merge or split.** It currently carries BLK-020 (clean) + BLK-009 aggregate (gates partially red). His call.
2. **BLK-020 SHIPPED status flip.** Pending his in-chat "yes" to amend `docs/BUILD_BIBLE.md`.
3. **Dependabot PR #102.** Safe per prior audit.
4. **BLK-009 before-signup security hardening.** BR agent explicitly flagged: the build-runner runs customer code on host. Single-tenant v1 is fine; before opening signup the build step must run inside SEC agent's `runInSandbox` (already exists) instead of the current raw `Bun.spawn`. That's a ~1 hour wiring change.

---

## Craig's in-session authorizations (quoted verbatim)

- "Sorry to bother you I'm just checking in to make sure that we've kicked off and we're running with the ball as many agents as you can put on would be great" — standing parallel-agent directive.
- "I need sleep now can you promise me that you were gonna continue until this is completely finished and writing" + "That's meant to say and wired in" — authorization to finish BLK-020 frontend end-to-end. Honored via PR #124's first commit.
- "To be honest you've been going for hours so I expected you to be further along than this" — pace feedback. Triggered BLK-009 6-agent wave.
- "Can you write a handover file please so I can start a new coding chat this one is obviously not working" — why this file exists.
- "So you do have other agents working on it I'm just a bit annoyed you've been going for hours and if there's had anything been done" — confirmation that the 6 agents did land real work (see "What's in the aggregate" above).

---

## Next agent should start by

1. **Read CLAUDE.md, docs/POSITIONING.md, docs/BUILD_BIBLE.md.** Post the doctrine-confirmation line.
2. **Run `git log --oneline -8`** to confirm branch state matches this handover.
3. **Ask Craig which repair path (A = fix-forward, B = reset).** Don't start fixing until he picks.
4. **If Path A:**
   - First: fix the test-isolation bug in `apps/api`. Every failing test in the full `bun run test` passes in isolation; root cause is DB state pollution between test files. Likely fix: a per-file migration reset or wrapping DB-writing tests in transactions.
   - Second: diagnose the Vinxi SSR build wrapper bug. Direct `cd apps/web && bun x vinxi build` works; `bun run build` at repo root fails.
   - Third: re-run full gate, commit "fix(blk-009): test isolation + vinxi wrapper", push, update PR #124 description.
5. **If Path B:** follow the steps under "Path B" above. Requires Craig's auth for the force-push (§0.7 hard gate).

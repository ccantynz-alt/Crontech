// ── CollabPresence — Lightweight Presence Chip Row ───────────────────
// Shows "N humans + M AI agents editing" on the project editor page.
// Driven by the Yjs awareness API of a live `CollabRoom`.

import { For, Show, createEffect, createSignal, onCleanup } from "solid-js";
import type { JSX } from "solid-js";
import type { CollabRoom, CollabUser } from "../collab/yjs-provider";
import { getConnectedUsers } from "../collab/yjs-provider";

// ── Types ────────────────────────────────────────────────────────────

export interface CollabPresenceProps {
  /** The live collab room. When null/undefined the row renders idle. */
  room: CollabRoom | null | undefined;
  /** The current user's id — used to exclude self from the "other" chips. */
  currentUserId: string;
}

interface ChipEntry {
  key: string;
  name: string;
  color: string;
  isAI: boolean;
  initials: string;
}

// ── Helpers ──────────────────────────────────────────────────────────

export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export interface PresenceSummary {
  humans: number;
  agents: number;
  chips: ChipEntry[];
}

/**
 * Pure reducer: turns an awareness snapshot into the render model the
 * chip row needs. Extracted so we can unit-test it without Solid.
 */
export function summarizePresence(
  users: CollabUser[],
  currentUserId: string,
): PresenceSummary {
  let humans = 0;
  let agents = 0;
  const seen = new Set<string>();
  const chips: ChipEntry[] = [];

  for (const user of users) {
    if (user.id === currentUserId) continue;
    if (seen.has(user.id)) continue;
    seen.add(user.id);
    if (user.isAI === true) {
      agents += 1;
    } else {
      humans += 1;
    }
    chips.push({
      key: user.id,
      name: user.name,
      color: user.color,
      isAI: user.isAI === true,
      initials: getInitials(user.name),
    });
  }

  return { humans, agents, chips };
}

function summaryLabel(summary: PresenceSummary): string {
  const humanPart =
    summary.humans === 1 ? "1 human" : `${summary.humans} humans`;
  const agentPart =
    summary.agents === 1 ? "1 AI agent" : `${summary.agents} AI agents`;
  return `${humanPart} + ${agentPart} editing`;
}

// ── Component ────────────────────────────────────────────────────────

/**
 * A small chip-row that reflects the live awareness state of a
 * `CollabRoom`. Renders a 16px circle per remote peer plus a summary
 * count of "N humans + M AI agents editing".
 *
 * Subscribes to awareness changes on mount and tears the subscription
 * down on unmount — does NOT own the room lifecycle itself.
 */
export function CollabPresence(props: CollabPresenceProps): JSX.Element {
  const [summary, setSummary] = createSignal<PresenceSummary>({
    humans: 0,
    agents: 0,
    chips: [],
  });

  createEffect(() => {
    const room = props.room;
    if (!room) {
      setSummary({ humans: 0, agents: 0, chips: [] });
      return;
    }

    const recompute = (): void => {
      const users = getConnectedUsers(room.awareness);
      setSummary(summarizePresence(users, props.currentUserId));
    };

    recompute();
    const handler = (): void => recompute();
    room.awareness.on("change", handler);
    onCleanup(() => {
      room.awareness.off("change", handler);
    });
  });

  return (
    <div
      role="group"
      aria-label="Collaborators"
      data-testid="collab-presence"
      style={{
        display: "flex",
        "align-items": "center",
        gap: "8px",
        padding: "6px 10px",
        background: "var(--color-bg-elevated)",
        "border-radius": "9999px",
        border: "1px solid var(--color-border)",
      }}
    >
      <For each={summary().chips}>
        {(chip) => (
          <div
            data-testid="collab-presence-chip"
            data-ai={chip.isAI ? "true" : "false"}
            title={chip.isAI ? `${chip.name} (AI agent)` : chip.name}
            style={{
              position: "relative",
              display: "inline-flex",
              "align-items": "center",
              gap: "6px",
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: "16px",
                height: "16px",
                "border-radius": "50%",
                background: chip.color,
                display: "inline-flex",
                "align-items": "center",
                "justify-content": "center",
                color: "var(--color-text)",
                "font-size": "9px",
                "font-weight": "700",
                border: chip.isAI
                  ? "1px dashed var(--color-text)"
                  : "1px solid transparent",
              }}
            >
              {chip.isAI ? "AI" : chip.initials}
            </span>
            <span
              aria-hidden="true"
              data-testid="collab-presence-online-dot"
              style={{
                width: "6px",
                height: "6px",
                "border-radius": "50%",
                background: "var(--color-success, #22c55e)",
                display: "inline-block",
              }}
            />
            <span
              style={{
                "font-size": "12px",
                color: "var(--color-text-secondary)",
              }}
            >
              {chip.name}
            </span>
          </div>
        )}
      </For>
      <Show when={summary().chips.length === 0}>
        <span
          style={{
            "font-size": "12px",
            color: "var(--color-text-faint)",
          }}
        >
          Just you editing
        </span>
      </Show>
      <span
        data-testid="collab-presence-summary"
        style={{
          "margin-left": "auto",
          "font-size": "11px",
          "font-weight": "600",
          color: "var(--color-text-faint)",
          "text-transform": "uppercase",
          "letter-spacing": "0.06em",
        }}
      >
        {summaryLabel(summary())}
      </span>
    </div>
  );
}

export default CollabPresence;

// ── Approval Store (SolidJS Signals) ──────────────────────────────
// Reactive state for human-in-the-loop AI action approvals.
// Maintains a queue of pending approvals, listens to the SSE stream
// for real-time approval events, and exposes actions for the UI.

import { createSignal, onCleanup } from "solid-js";
import type { Accessor } from "solid-js";
import type { RiskLevel } from "@back-to-the-future/ai-core";

// ── Types ───────────────────────────────────────────────────────

export interface PendingApproval {
  id: string;
  action: string;
  riskLevel: RiskLevel;
  description: string;
  toolName: string;
  params: Record<string, unknown>;
  timestamp: number;
}

export interface ApprovalResolution {
  requestId: string;
  approved: boolean;
  reason: string;
  approvedBy: string;
  timestamp: number;
}

type ApprovalStreamStatus = "disconnected" | "connecting" | "connected" | "error";

export interface ApprovalStore {
  /** Reactive list of pending approval requests. */
  pending: Accessor<PendingApproval[]>;
  /** Number of pending approvals. */
  pendingCount: Accessor<number>;
  /** SSE connection status. */
  streamStatus: Accessor<ApprovalStreamStatus>;
  /** Last error message, if present. */
  error: Accessor<string | null>;
  /** Connect to the SSE approval stream. */
  connect: () => void;
  /** Disconnect from the SSE stream. */
  disconnect: () => void;
  /** Approve a pending action by ID. */
  approveAction: (id: string, reason: string, approvedBy: string) => Promise<void>;
  /** Reject a pending action by ID. */
  rejectAction: (id: string, reason: string, rejectedBy: string) => Promise<void>;
  /** Manually refresh pending approvals from the REST endpoint. */
  refreshPending: () => Promise<void>;
}

// ── Constants ───────────────────────────────────────────────────

const RECONNECT_DELAY_MS = 2000;
const MAX_RECONNECT_DELAY_MS = 30_000;

// ── Helper ──────────────────────────────────────────────────────

function getApiUrl(): string {
  if (typeof window !== "undefined") {
    const meta = import.meta as unknown as Record<string, Record<string, string> | undefined>;
    return meta.env?.VITE_PUBLIC_API_URL ?? "http://localhost:3001";
  }
  return "http://localhost:3001";
}

// ── Store Factory ───────────────────────────────────────────────

/**
 * Create an approval store backed by SolidJS signals.
 *
 * Connects to the SSE endpoint at /api/ai/approvals/stream for
 * real-time updates when new approval requests arrive or existing
 * ones are resolved.
 *
 * Usage:
 * ```ts
 * const store = createApprovalStore();
 * store.connect();
 * onCleanup(() => store.disconnect());
 * ```
 */
export function createApprovalStore(): ApprovalStore {
  const [pending, setPending] = createSignal<PendingApproval[]>([]);
  const [streamStatus, setStreamStatus] = createSignal<ApprovalStreamStatus>("disconnected");
  const [error, setError] = createSignal<string | null>(null);

  const pendingCount: Accessor<number> = () => pending().length;

  let eventSource: EventSource | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectDelay = RECONNECT_DELAY_MS;

  // ── SSE Connection ──────────────────────────────────────────

  function connect(): void {
    if (typeof window === "undefined") return;
    disconnect();

    setStreamStatus("connecting");
    setError(null);

    const url = `${getApiUrl()}/api/ai/approvals/stream`;
    eventSource = new EventSource(url);

    eventSource.onopen = (): void => {
      setStreamStatus("connected");
      reconnectDelay = RECONNECT_DELAY_MS;
    };

    eventSource.onerror = (): void => {
      setStreamStatus("error");
      eventSource?.close();
      eventSource = null;
      scheduleReconnect();
    };

    // Initial state with all currently pending approvals
    eventSource.addEventListener("approval:init", (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data as string) as {
          pending: PendingApproval[];
          count: number;
        };
        setPending(data.pending);
      } catch {
        // Malformed init event
      }
    });

    // New approval request arrived
    eventSource.addEventListener("approval:pending", (event: MessageEvent) => {
      try {
        const approval = JSON.parse(event.data as string) as PendingApproval;
        setPending((prev) => {
          // Avoid duplicates
          if (prev.some((p) => p.id === approval.id)) return prev;
          return [...prev, approval];
        });
      } catch {
        // Malformed pending event
      }
    });

    // Approval resolved (approved or rejected)
    eventSource.addEventListener("approval:resolved", (event: MessageEvent) => {
      try {
        const resolution = JSON.parse(event.data as string) as ApprovalResolution;
        setPending((prev) => prev.filter((p) => p.id !== resolution.requestId));
      } catch {
        // Malformed resolved event
      }
    });
  }

  function disconnect(): void {
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }

    setStreamStatus("disconnected");
  }

  function scheduleReconnect(): void {
    reconnectTimer = setTimeout((): void => {
      reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY_MS);
      connect();
    }, reconnectDelay);
  }

  // ── REST Actions ────────────────────────────────────────────

  async function approveAction(
    id: string,
    reason: string,
    approvedBy: string,
  ): Promise<void> {
    setError(null);

    try {
      const response = await fetch(
        `${getApiUrl()}/api/ai/approvals/${encodeURIComponent(id)}/approve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason, approvedBy }),
        },
      );

      if (!response.ok) {
        const body = await response.json().catch(() => ({ error: "Approve failed" })) as {
          error?: string;
        };
        throw new Error(body.error ?? "Approve failed");
      }

      // Optimistically remove from local pending list
      setPending((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Approve failed";
      setError(message);
      throw err;
    }
  }

  async function rejectAction(
    id: string,
    reason: string,
    rejectedBy: string,
  ): Promise<void> {
    setError(null);

    try {
      const response = await fetch(
        `${getApiUrl()}/api/ai/approvals/${encodeURIComponent(id)}/reject`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason, rejectedBy }),
        },
      );

      if (!response.ok) {
        const body = await response.json().catch(() => ({ error: "Reject failed" })) as {
          error?: string;
        };
        throw new Error(body.error ?? "Reject failed");
      }

      // Optimistically remove from local pending list
      setPending((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Reject failed";
      setError(message);
      throw err;
    }
  }

  async function refreshPending(): Promise<void> {
    setError(null);

    try {
      const response = await fetch(`${getApiUrl()}/api/ai/approvals`);
      if (!response.ok) {
        throw new Error("Failed to fetch pending approvals");
      }

      const data = (await response.json()) as {
        pending: PendingApproval[];
        count: number;
      };
      setPending(data.pending);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Refresh failed";
      setError(message);
    }
  }

  // ── Cleanup ─────────────────────────────────────────────────

  onCleanup((): void => {
    disconnect();
  });

  return {
    pending,
    pendingCount,
    streamStatus,
    error,
    connect,
    disconnect,
    approveAction,
    rejectAction,
    refreshPending,
  };
}

// ── Approval Dialog (SolidJS) ─────────────────────────────────────
// Displays pending AI actions for human review and approval.
// Shows action type, description, risk level, affected resources.
// Approve / Reject / Modify buttons with configurable auto-dismiss.

import type { JSX, Accessor } from "solid-js";
import {
  createSignal,
  createEffect,
  onCleanup,
  Show,
  For,
} from "solid-js";
import { Button } from "@back-to-the-future/ui";
import { Card } from "@back-to-the-future/ui";
import type { PendingApproval, ApprovalStore } from "../stores/approval-store";

// ── Types ───────────────────────────────────────────────────────

export interface ApprovalDialogProps {
  /** The approval store instance providing reactive state and actions. */
  store: ApprovalStore;
  /** Auto-dismiss timeout in milliseconds. 0 disables auto-dismiss. Default: 30000. */
  autoDismissMs: number;
  /** Identity string for the current user (used in approve/reject calls). */
  currentUserId: string;
  /** Callback fired after an action is approved. */
  onApproved?: (id: string) => void;
  /** Callback fired after an action is rejected. */
  onRejected?: (id: string) => void;
}

// ── Risk Badge ──────────────────────────────────────────────────

const RISK_STYLES: Record<string, string> = {
  low: "bg-green-100 text-green-800 border-green-200",
  medium: "bg-yellow-100 text-yellow-800 border-yellow-200",
  high: "bg-orange-100 text-orange-800 border-orange-200",
  critical: "bg-red-100 text-red-800 border-red-200",
};

function RiskBadge(props: { level: string }): JSX.Element {
  const styles = (): string => RISK_STYLES[props.level] ?? RISK_STYLES["medium"] ?? "";

  return (
    <span
      class={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase ${styles()}`}
    >
      {props.level}
    </span>
  );
}

// ── Countdown Timer ─────────────────────────────────────────────

function CountdownBar(props: {
  durationMs: number;
  onExpired: () => void;
}): JSX.Element {
  const [remaining, setRemaining] = createSignal(props.durationMs);

  const interval = setInterval(() => {
    setRemaining((prev) => {
      const next = prev - 100;
      if (next <= 0) {
        clearInterval(interval);
        props.onExpired();
        return 0;
      }
      return next;
    });
  }, 100);

  onCleanup(() => clearInterval(interval));

  const percentage: Accessor<number> = () =>
    Math.max(0, (remaining() / props.durationMs) * 100);

  return (
    <div class="w-full bg-gray-200 rounded-full h-1 overflow-hidden">
      <div
        class="bg-blue-500 h-1 rounded-full transition-all duration-100"
        style={{ width: `${String(percentage())}%` }}
      />
    </div>
  );
}

// ── Single Approval Card ────────────────────────────────────────

interface ApprovalCardProps {
  approval: PendingApproval;
  autoDismissMs: number;
  currentUserId: string;
  onApprove: (id: string, reason: string) => void;
  onReject: (id: string, reason: string) => void;
  onModify: (id: string) => void;
}

function ApprovalCard(props: ApprovalCardProps): JSX.Element {
  const [reason, setReason] = createSignal("");
  const [isSubmitting, setIsSubmitting] = createSignal(false);
  const [showParams, setShowParams] = createSignal(false);

  const paramEntries: Accessor<Array<[string, unknown]>> = () =>
    Object.entries(props.approval.params);

  const formattedTime: Accessor<string> = () => {
    const date = new Date(props.approval.timestamp);
    return date.toLocaleTimeString();
  };

  const handleApprove = (): void => {
    setIsSubmitting(true);
    props.onApprove(
      props.approval.id,
      reason() || "Approved by user",
    );
  };

  const handleReject = (): void => {
    setIsSubmitting(true);
    props.onReject(
      props.approval.id,
      reason() || "Rejected by user",
    );
  };

  const handleAutoDismiss = (): void => {
    // Auto-reject on timeout
    props.onReject(props.approval.id, "Auto-rejected: approval timed out");
  };

  return (
    <Card
      title={props.approval.action}
      padding="md"
      class={`w-full border ${
        props.approval.riskLevel === "critical"
          ? "border-red-300 bg-red-50"
          : props.approval.riskLevel === "high"
            ? "border-orange-300 bg-orange-50"
            : "border-gray-200 bg-white"
      }`}
    >
      <div class="flex flex-col gap-3">
        {/* Header: risk badge + timestamp */}
        <div class="flex items-center justify-between">
          <RiskBadge level={props.approval.riskLevel} />
          <span class="text-xs text-gray-500">{formattedTime()}</span>
        </div>

        {/* Description */}
        <p class="text-sm text-gray-700">{props.approval.description}</p>

        {/* Tool name */}
        <div class="flex items-center gap-2">
          <span class="text-xs font-medium text-gray-500">Tool:</span>
          <span class="text-xs font-mono text-gray-800 bg-gray-100 rounded px-1.5 py-0.5">
            {props.approval.toolName}
          </span>
        </div>

        {/* Expandable parameters */}
        <Show when={paramEntries().length > 0}>
          <button
            type="button"
            class="text-xs text-blue-600 hover:text-blue-800 text-left underline"
            onClick={() => setShowParams((prev) => !prev)}
          >
            {showParams() ? "Hide parameters" : "Show parameters"}
          </button>

          <Show when={showParams()}>
            <div class="rounded bg-gray-100 p-2 text-xs font-mono overflow-x-auto max-h-40 overflow-y-auto">
              <For each={paramEntries()}>
                {([key, value]) => (
                  <div class="flex gap-2">
                    <span class="text-gray-500 shrink-0">{key}:</span>
                    <span class="text-gray-800 break-all">
                      {typeof value === "string" ? value : JSON.stringify(value)}
                    </span>
                  </div>
                )}
              </For>
            </div>
          </Show>
        </Show>

        {/* Reason input */}
        <textarea
          class="w-full rounded border border-gray-300 px-3 py-2 text-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="Reason (optional)"
          rows={2}
          value={reason()}
          onInput={(e) => setReason(e.currentTarget.value)}
          disabled={isSubmitting()}
        />

        {/* Auto-dismiss countdown */}
        <Show when={props.autoDismissMs > 0}>
          <CountdownBar
            durationMs={props.autoDismissMs}
            onExpired={handleAutoDismiss}
          />
        </Show>

        {/* Action buttons */}
        <div class="flex gap-2">
          <Button
            variant="primary"
            size="sm"
            disabled={isSubmitting()}
            onClick={handleApprove}
          >
            Approve
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={isSubmitting()}
            onClick={handleReject}
          >
            Reject
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={isSubmitting()}
            onClick={() => props.onModify(props.approval.id)}
          >
            Modify
          </Button>
        </div>
      </div>
    </Card>
  );
}

// ── Main Approval Dialog ────────────────────────────────────────

/**
 * Approval dialog component that displays a queue of pending AI actions
 * for human review. Integrates with the approval store for reactive updates
 * via SSE. Supports auto-dismiss with countdown timer.
 *
 * Usage:
 * ```tsx
 * const store = createApprovalStore();
 * store.connect();
 *
 * <ApprovalDialog
 *   store={store}
 *   autoDismissMs={30000}
 *   currentUserId="user-123"
 * />
 * ```
 */
export function ApprovalDialog(props: ApprovalDialogProps): JSX.Element {
  const [, setModifyingId] = createSignal<string | null>(null);

  // Connect to SSE stream when the component mounts
  createEffect((): void => {
    const status = props.store.streamStatus();
    if (status === "disconnected") {
      props.store.connect();
    }
  });

  const handleApprove = async (id: string, reason: string): Promise<void> => {
    try {
      await props.store.approveAction(id, reason, props.currentUserId);
      props.onApproved?.(id);
    } catch {
      // Error is already set in the store
    }
  };

  const handleReject = async (id: string, reason: string): Promise<void> => {
    try {
      await props.store.rejectAction(id, reason, props.currentUserId);
      props.onRejected?.(id);
    } catch {
      // Error is already set in the store
    }
  };

  const handleModify = (id: string): void => {
    setModifyingId(id);
    // Modification opens the params for editing; for now, log it
    // A full implementation would open an editor for the params
    console.log("[ApprovalDialog] Modify requested for:", id);
  };

  return (
    <div class="fixed bottom-4 right-4 z-50 flex flex-col gap-3 max-w-md w-full max-h-[80vh] overflow-y-auto">
      {/* Connection status indicator */}
      <Show when={props.store.streamStatus() === "error"}>
        <div class="rounded bg-red-100 border border-red-200 px-3 py-2 text-xs text-red-700">
          Connection lost. Reconnecting...
        </div>
      </Show>

      {/* Error message */}
      <Show when={props.store.error() !== null}>
        <div class="rounded bg-red-100 border border-red-200 px-3 py-2 text-xs text-red-700">
          {props.store.error()}
        </div>
      </Show>

      {/* Pending approval count badge */}
      <Show when={props.store.pendingCount() > 0}>
        <div class="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-full text-xs font-semibold self-end shadow-lg">
          <span class="relative flex h-2 w-2">
            <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
            <span class="relative inline-flex rounded-full h-2 w-2 bg-white" />
          </span>
          {props.store.pendingCount()} pending approval{props.store.pendingCount() === 1 ? "" : "s"}
        </div>
      </Show>

      {/* Approval cards */}
      <For each={props.store.pending()}>
        {(approval) => (
          <ApprovalCard
            approval={approval}
            autoDismissMs={props.autoDismissMs}
            currentUserId={props.currentUserId}
            onApprove={handleApprove}
            onReject={handleReject}
            onModify={handleModify}
          />
        )}
      </For>
    </div>
  );
}

// ── Human-in-the-Loop AI Approval System ─────────────────────────
// Provides risk classification and approval gates for AI tool calls.
// Ensures destructive or high-impact actions require human approval
// before execution, while low-risk operations proceed automatically.

import { z } from "zod";

// ── Risk Level ───────────────────────────────────────────────────

export type RiskLevel = "low" | "medium" | "high" | "critical";

const RISK_LEVELS: readonly RiskLevel[] = ["low", "medium", "high", "critical"] as const;

/** Numeric ordering for risk comparison. */
function riskOrdinal(level: RiskLevel): number {
  return RISK_LEVELS.indexOf(level);
}

// ── Schemas & Types ──────────────────────────────────────────────

export interface ApprovalRequest {
  id: string;
  action: string;
  riskLevel: RiskLevel;
  description: string;
  toolName: string;
  params: Record<string, unknown>;
  timestamp: number;
}

export interface ApprovalDecision {
  requestId: string;
  approved: boolean;
  reason?: string;
  approvedBy: string;
  timestamp: number;
}

export type ApprovalCallback = (
  request: ApprovalRequest,
) => Promise<ApprovalDecision>;

// ── Risk Classification ──────────────────────────────────────────

/** Patterns that map tool names and parameter keys to risk levels. */
const TOOL_RISK_MAP: Record<string, RiskLevel> = {
  searchContent: "low",
  analyzeCode: "low",
  generateComponent: "medium",
};

/** Parameter patterns that escalate risk. */
const PARAM_ESCALATIONS: Array<{
  pattern: RegExp;
  level: RiskLevel;
}> = [
  { pattern: /delete/i, level: "high" },
  { pattern: /remove/i, level: "high" },
  { pattern: /destroy/i, level: "high" },
  { pattern: /modify/i, level: "high" },
  { pattern: /update/i, level: "medium" },
  { pattern: /deploy/i, level: "critical" },
  { pattern: /publish/i, level: "critical" },
  { pattern: /production/i, level: "critical" },
  { pattern: /migrate/i, level: "high" },
  { pattern: /drop/i, level: "critical" },
];

/**
 * Classify the risk level of a tool call based on the tool name and parameters.
 *
 * - Read operations (search, analyze) → low
 * - Generate/create operations → medium
 * - Delete/modify operations → high
 * - Deploy/publish/production operations → critical
 *
 * Parameter values are scanned for escalation patterns; the highest
 * matching risk level wins.
 */
export function classifyRisk(
  toolName: string,
  params: Record<string, unknown>,
): RiskLevel {
  // Start with the known tool risk or default to medium
  let level: RiskLevel = TOOL_RISK_MAP[toolName] ?? "medium";

  // Check the tool name itself against escalation patterns
  for (const { pattern, level: escalatedLevel } of PARAM_ESCALATIONS) {
    if (pattern.test(toolName) && riskOrdinal(escalatedLevel) > riskOrdinal(level)) {
      level = escalatedLevel;
    }
  }

  // Scan parameter keys and string values for escalation patterns
  const paramString = JSON.stringify(params);
  for (const { pattern, level: escalatedLevel } of PARAM_ESCALATIONS) {
    if (pattern.test(paramString) && riskOrdinal(escalatedLevel) > riskOrdinal(level)) {
      level = escalatedLevel;
    }
  }

  return level;
}

// ── Approval Gate ────────────────────────────────────────────────

export interface ApprovalGate {
  /** Request approval for an action. Auto-approves if risk is at or below the auto-approve threshold. */
  requestApproval(
    action: string,
    toolName: string,
    params: Record<string, unknown>,
    description: string,
  ): Promise<ApprovalDecision>;

  /** Get all pending (unanswered) approval requests. */
  getPendingRequests(): ApprovalRequest[];

  /** Set the auto-approve threshold. Actions at or below this risk level are approved automatically. */
  autoApprove(riskLevel: RiskLevel): void;
}

/**
 * Create an approval gate that intercepts tool calls and routes them
 * through a human approval workflow based on risk level.
 *
 * @param callback - Function called when human approval is needed.
 *   Receives an ApprovalRequest and must return an ApprovalDecision.
 */
export function createApprovalGate(callback: ApprovalCallback): ApprovalGate {
  let autoApproveThreshold: RiskLevel = "low";
  const pendingRequests: Map<string, ApprovalRequest> = new Map();

  return {
    async requestApproval(
      action: string,
      toolName: string,
      params: Record<string, unknown>,
      description: string,
    ): Promise<ApprovalDecision> {
      const riskLevel = classifyRisk(toolName, params);

      const request: ApprovalRequest = {
        id: crypto.randomUUID(),
        action,
        riskLevel,
        description,
        toolName,
        params,
        timestamp: Date.now(),
      };

      // Auto-approve if risk is at or below the threshold
      if (riskOrdinal(riskLevel) <= riskOrdinal(autoApproveThreshold)) {
        return {
          requestId: request.id,
          approved: true,
          reason: `Auto-approved: risk level "${riskLevel}" is within auto-approve threshold "${autoApproveThreshold}"`,
          approvedBy: "system",
          timestamp: Date.now(),
        };
      }

      // Add to pending and invoke the human callback
      pendingRequests.set(request.id, request);

      try {
        const decision = await callback(request);
        pendingRequests.delete(request.id);
        return decision;
      } catch (error) {
        pendingRequests.delete(request.id);
        return {
          requestId: request.id,
          approved: false,
          reason: `Approval callback failed: ${error instanceof Error ? error.message : String(error)}`,
          approvedBy: "system",
          timestamp: Date.now(),
        };
      }
    },

    getPendingRequests(): ApprovalRequest[] {
      return Array.from(pendingRequests.values());
    },

    autoApprove(riskLevel: RiskLevel): void {
      autoApproveThreshold = riskLevel;
    },
  };
}

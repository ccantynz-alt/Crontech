// ── Progress Tracker Schema ─────────────────────────────────────────
// Types + lightweight runtime validator for the master game-plan
// progress tracker served at /admin/progress. Single source of truth
// for the JSON file living in apps/web/public/progress.json.
//
// Using plain TypeScript here instead of Zod because apps/web does
// not pull Zod directly. The JSON is served from our own public/
// directory so a hand-written validator is sufficient.

export type ProgressStatus = "completed" | "in_progress" | "pending" | "blocked";
export type ProgressPriority = "p0" | "p1" | "p2" | "p3";

export interface ProgressEntry {
  id: string;
  title: string;
  description: string;
  status: ProgressStatus;
  priority: ProgressPriority;
  commit: string | null;
  branch: string | null;
  docLink: string | null;
  blockedReason: string | null;
  tags: string[];
}

export interface ProgressCategory {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  entries: ProgressEntry[];
}

export interface ProgressTracker {
  version: number;
  lastUpdated: string;
  session: string;
  doctrine: string;
  categories: ProgressCategory[];
}

const STATUSES: readonly ProgressStatus[] = [
  "completed",
  "in_progress",
  "pending",
  "blocked",
];

const PRIORITIES: readonly ProgressPriority[] = ["p0", "p1", "p2", "p3"];

function isString(v: unknown): v is string {
  return typeof v === "string";
}

function isNumber(v: unknown): v is number {
  return typeof v === "number";
}

function isStringOrNull(v: unknown): v is string | null {
  return v === null || typeof v === "string";
}

function isStatus(v: unknown): v is ProgressStatus {
  return typeof v === "string" && (STATUSES as readonly string[]).includes(v);
}

function isPriority(v: unknown): v is ProgressPriority {
  return typeof v === "string" && (PRIORITIES as readonly string[]).includes(v);
}

function parseEntry(raw: unknown): ProgressEntry {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("entry must be an object");
  }
  const r = raw as Record<string, unknown>;
  if (!isString(r.id)) throw new Error("entry.id must be string");
  if (!isString(r.title)) throw new Error("entry.title must be string");
  if (!isString(r.description)) throw new Error("entry.description must be string");
  if (!isStatus(r.status)) throw new Error(`entry.status invalid: ${String(r.status)}`);
  if (!isPriority(r.priority)) throw new Error(`entry.priority invalid: ${String(r.priority)}`);
  if (!isStringOrNull(r.commit)) throw new Error("entry.commit must be string|null");
  if (!isStringOrNull(r.branch)) throw new Error("entry.branch must be string|null");
  if (!isStringOrNull(r.docLink)) throw new Error("entry.docLink must be string|null");
  if (!isStringOrNull(r.blockedReason)) throw new Error("entry.blockedReason must be string|null");
  if (!Array.isArray(r.tags) || !r.tags.every(isString)) {
    throw new Error("entry.tags must be string[]");
  }
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    status: r.status,
    priority: r.priority,
    commit: r.commit,
    branch: r.branch,
    docLink: r.docLink,
    blockedReason: r.blockedReason,
    tags: r.tags,
  };
}

function parseCategory(raw: unknown): ProgressCategory {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("category must be an object");
  }
  const r = raw as Record<string, unknown>;
  if (!isString(r.id)) throw new Error("category.id must be string");
  if (!isString(r.title)) throw new Error("category.title must be string");
  if (!isString(r.subtitle)) throw new Error("category.subtitle must be string");
  if (!isString(r.icon)) throw new Error("category.icon must be string");
  if (!Array.isArray(r.entries)) throw new Error("category.entries must be array");
  return {
    id: r.id,
    title: r.title,
    subtitle: r.subtitle,
    icon: r.icon,
    entries: r.entries.map(parseEntry),
  };
}

/** Parse and validate a raw JSON value into a ProgressTracker. Throws on invalid input. */
export function parseProgressTracker(raw: unknown): ProgressTracker {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("tracker must be an object");
  }
  const r = raw as Record<string, unknown>;
  if (!isNumber(r.version)) throw new Error("tracker.version must be number");
  if (!isString(r.lastUpdated)) throw new Error("tracker.lastUpdated must be string");
  if (!isString(r.session)) throw new Error("tracker.session must be string");
  if (!isString(r.doctrine)) throw new Error("tracker.doctrine must be string");
  if (!Array.isArray(r.categories)) throw new Error("tracker.categories must be array");
  return {
    version: r.version,
    lastUpdated: r.lastUpdated,
    session: r.session,
    doctrine: r.doctrine,
    categories: r.categories.map(parseCategory),
  };
}

/** Count entries across all categories grouped by status. */
export function countByStatus(tracker: ProgressTracker): Record<ProgressStatus, number> {
  const counts: Record<ProgressStatus, number> = {
    completed: 0,
    in_progress: 0,
    pending: 0,
    blocked: 0,
  };
  for (const category of tracker.categories) {
    for (const entry of category.entries) {
      counts[entry.status] += 1;
    }
  }
  return counts;
}

/** Total number of entries in the tracker. */
export function totalEntries(tracker: ProgressTracker): number {
  return tracker.categories.reduce((sum, c) => sum + c.entries.length, 0);
}

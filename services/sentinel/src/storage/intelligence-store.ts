// ── Intelligence Store ───────────────────────────────────────────────
// Persists collected intelligence items to a JSON file so data survives
// restarts. Provides retrieval by time window for digest generation.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import type { IntelligenceItem } from "../collectors/types";

export interface StoredEntry {
  item: IntelligenceItem;
  storedAt: string;
}

function getDefaultStorePath(): string {
  // import.meta.dir is Bun-specific; fall back to process.cwd()
  const baseDir = (import.meta as { dir?: string }).dir ?? process.cwd();
  return join(baseDir, "..", "..", "data", "intelligence.json");
}

const DEFAULT_STORE_PATH = getDefaultStorePath();

let storePath = DEFAULT_STORE_PATH;
let entries: StoredEntry[] = [];
let loaded = false;

/** Configure the storage file path (must be called before any other operation). */
export function setStorePath(path: string): void {
  storePath = path;
  loaded = false;
  entries = [];
}

/** Get the current store path. */
export function getStorePath(): string {
  return storePath;
}

function ensureDir(): void {
  const dir = dirname(storePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function loadFromDisk(): void {
  if (loaded) return;
  try {
    if (existsSync(storePath)) {
      const raw = readFileSync(storePath, "utf-8");
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        entries = parsed as StoredEntry[];
      }
    }
  } catch (err) {
    console.error(`[sentinel:store] Failed to load store from ${storePath}:`, err);
    entries = [];
  }
  loaded = true;
}

function saveToDisk(): void {
  try {
    ensureDir();
    writeFileSync(storePath, JSON.stringify(entries, null, 2), "utf-8");
  } catch (err) {
    console.error(`[sentinel:store] Failed to save store to ${storePath}:`, err);
  }
}

/** Add intelligence items to the persistent store. Returns count of new items added. */
export function storeItems(items: IntelligenceItem[]): number {
  loadFromDisk();

  const existingIds = new Set(entries.map((e) => e.item.id));
  const now = new Date().toISOString();
  let added = 0;

  for (const item of items) {
    if (!existingIds.has(item.id)) {
      entries.push({ item, storedAt: now });
      existingIds.add(item.id);
      added++;
    }
  }

  if (added > 0) {
    saveToDisk();
  }

  return added;
}

/** Retrieve all items collected within the given time window (ISO strings). */
export function getItemsSince(sinceISO: string): StoredEntry[] {
  loadFromDisk();
  const since = new Date(sinceISO).getTime();
  return entries.filter((e) => new Date(e.storedAt).getTime() >= since);
}

/** Retrieve all items in the store. */
export function getAllItems(): StoredEntry[] {
  loadFromDisk();
  return [...entries];
}

/** Get the total count of stored items. */
export function getItemCount(): number {
  loadFromDisk();
  return entries.length;
}

/** Prune items older than the given number of days. Returns count of removed items. */
export function pruneOlderThan(days: number): number {
  loadFromDisk();
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const before = entries.length;
  entries = entries.filter((e) => new Date(e.storedAt).getTime() >= cutoff);
  const removed = before - entries.length;
  if (removed > 0) {
    saveToDisk();
  }
  return removed;
}

/** Clear all stored items (for testing). */
export function clearStore(): void {
  entries = [];
  loaded = true;
  saveToDisk();
}

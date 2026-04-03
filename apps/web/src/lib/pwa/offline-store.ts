/**
 * Offline data store for Back to the Future PWA.
 *
 * Provides:
 * - IndexedDB wrapper for offline data persistence
 * - Mutation queue for failed requests (replayed on reconnect)
 * - Conflict-aware merge on reconnect
 */

import { createSignal } from "solid-js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface QueuedMutation {
  id?: number;
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
  timestamp: number;
  retryCount: number;
  entityType?: string;
  entityId?: string;
}

export interface OfflineRecord<T = unknown> {
  key: string;
  value: T;
  updatedAt: number;
  synced: boolean;
}

export interface MergeConflict<T = unknown> {
  key: string;
  localValue: T;
  remoteValue: T;
  localUpdatedAt: number;
  remoteUpdatedAt: number;
}

export type MergeStrategy = "local-wins" | "remote-wins" | "latest-wins";

export interface SyncResult {
  replayed: number;
  failed: number;
  conflicts: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const DB_NAME = "bttf-offline";
const DB_VERSION = 1;
const MUTATIONS_STORE = "mutations";
const DATA_STORE = "data";
const MAX_RETRIES = 5;

// ─── Signals ─────────────────────────────────────────────────────────────────

const [pendingMutationCount, setPendingMutationCount] = createSignal(0);
const [isSyncing, setIsSyncing] = createSignal(false);
const [lastSyncTime, setLastSyncTime] = createSignal<number | null>(null);

export { isSyncing, lastSyncTime, pendingMutationCount };

// ─── Database initialization ─────────────────────────────────────────────────

let dbInstance: IDBDatabase | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(MUTATIONS_STORE)) {
        const mutationStore = db.createObjectStore(MUTATIONS_STORE, {
          keyPath: "id",
          autoIncrement: true,
        });
        mutationStore.createIndex("timestamp", "timestamp", { unique: false });
        mutationStore.createIndex("entityType", "entityType", { unique: false });
      }

      if (!db.objectStoreNames.contains(DATA_STORE)) {
        const dataStore = db.createObjectStore(DATA_STORE, { keyPath: "key" });
        dataStore.createIndex("updatedAt", "updatedAt", { unique: false });
        dataStore.createIndex("synced", "synced", { unique: false });
      }
    };

    request.onsuccess = () => {
      dbInstance = request.result;

      // Handle unexpected close (e.g., version upgrade from another tab)
      dbInstance.onclose = () => {
        dbInstance = null;
      };

      resolve(dbInstance);
    };

    request.onerror = () => reject(request.error);
  });
}

function idbRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function idbTransaction(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ─── Mutation Queue ──────────────────────────────────────────────────────────

/**
 * Queue a failed mutation for later replay.
 */
export async function queueMutation(
  mutation: Omit<QueuedMutation, "id" | "timestamp" | "retryCount">,
): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(MUTATIONS_STORE, "readwrite");
  const store = tx.objectStore(MUTATIONS_STORE);

  const entry: Omit<QueuedMutation, "id"> = {
    ...mutation,
    timestamp: Date.now(),
    retryCount: 0,
  };

  store.add(entry);
  await idbTransaction(tx);
  await refreshMutationCount();
}

/**
 * Get all queued mutations, ordered by timestamp.
 */
export async function getQueuedMutations(): Promise<QueuedMutation[]> {
  const db = await openDB();
  const tx = db.transaction(MUTATIONS_STORE, "readonly");
  const store = tx.objectStore(MUTATIONS_STORE);
  const index = store.index("timestamp");
  return idbRequest(index.getAll());
}

/**
 * Remove a mutation from the queue after successful replay.
 */
export async function removeMutation(id: number): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(MUTATIONS_STORE, "readwrite");
  tx.objectStore(MUTATIONS_STORE).delete(id);
  await idbTransaction(tx);
  await refreshMutationCount();
}

/**
 * Increment retry count for a failed mutation.
 */
export async function incrementRetry(id: number): Promise<boolean> {
  const db = await openDB();
  const tx = db.transaction(MUTATIONS_STORE, "readwrite");
  const store = tx.objectStore(MUTATIONS_STORE);

  const entry = await idbRequest(store.get(id)) as QueuedMutation | undefined;
  if (!entry) return false;

  entry.retryCount += 1;

  if (entry.retryCount >= MAX_RETRIES) {
    store.delete(id);
    await idbTransaction(tx);
    await refreshMutationCount();
    return false; // Mutation dropped
  }

  store.put(entry);
  await idbTransaction(tx);
  return true; // Will retry again
}

/**
 * Clear all queued mutations.
 */
export async function clearMutationQueue(): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(MUTATIONS_STORE, "readwrite");
  tx.objectStore(MUTATIONS_STORE).clear();
  await idbTransaction(tx);
  setPendingMutationCount(0);
}

// ─── Offline Data Store ──────────────────────────────────────────────────────

/**
 * Store data locally for offline access.
 */
export async function setOfflineData<T>(
  key: string,
  value: T,
  synced = false,
): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(DATA_STORE, "readwrite");
  const store = tx.objectStore(DATA_STORE);

  const record: OfflineRecord<T> = {
    key,
    value,
    updatedAt: Date.now(),
    synced,
  };

  store.put(record);
  await idbTransaction(tx);
}

/**
 * Retrieve offline data by key.
 */
export async function getOfflineData<T>(key: string): Promise<T | null> {
  const db = await openDB();
  const tx = db.transaction(DATA_STORE, "readonly");
  const store = tx.objectStore(DATA_STORE);

  const record = await idbRequest(store.get(key)) as OfflineRecord<T> | undefined;
  return record?.value ?? null;
}

/**
 * Delete offline data by key.
 */
export async function deleteOfflineData(key: string): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(DATA_STORE, "readwrite");
  tx.objectStore(DATA_STORE).delete(key);
  await idbTransaction(tx);
}

/**
 * Get all unsynced records.
 */
export async function getUnsyncedRecords<T>(): Promise<OfflineRecord<T>[]> {
  const db = await openDB();
  const tx = db.transaction(DATA_STORE, "readonly");
  const store = tx.objectStore(DATA_STORE);
  const index = store.index("synced");
  return idbRequest(index.getAll(IDBKeyRange.only(false))) as Promise<OfflineRecord<T>[]>;
}

/**
 * Mark a record as synced.
 */
export async function markSynced(key: string): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(DATA_STORE, "readwrite");
  const store = tx.objectStore(DATA_STORE);

  const record = await idbRequest(store.get(key)) as OfflineRecord | undefined;
  if (!record) return;

  record.synced = true;
  store.put(record);
  await idbTransaction(tx);
}

// ─── Sync Engine ─────────────────────────────────────────────────────────────

/**
 * Replay all queued mutations. Call this when the app comes back online.
 */
export async function replayMutations(
  onConflict?: (mutation: QueuedMutation, response: Response) => Promise<boolean>,
): Promise<SyncResult> {
  if (isSyncing()) {
    return { replayed: 0, failed: 0, conflicts: 0 };
  }

  setIsSyncing(true);
  const result: SyncResult = { replayed: 0, failed: 0, conflicts: 0 };

  try {
    const mutations = await getQueuedMutations();

    for (const mutation of mutations) {
      try {
        const fetchInit: RequestInit = {
          method: mutation.method,
          headers: mutation.headers,
        };
        if (mutation.method !== "GET" && mutation.method !== "HEAD" && mutation.body) {
          fetchInit.body = mutation.body;
        }
        const response = await fetch(mutation.url, fetchInit);

        if (response.ok) {
          await removeMutation(mutation.id!);
          result.replayed += 1;
        } else if (response.status === 409 && onConflict) {
          // Conflict -- let the caller decide
          const resolved = await onConflict(mutation, response);
          if (resolved) {
            await removeMutation(mutation.id!);
            result.conflicts += 1;
          } else {
            result.failed += 1;
          }
        } else {
          const shouldRetry = await incrementRetry(mutation.id!);
          if (!shouldRetry) {
            result.failed += 1;
          }
        }
      } catch {
        // Network still down -- stop replaying
        break;
      }
    }

    setLastSyncTime(Date.now());
  } finally {
    setIsSyncing(false);
    await refreshMutationCount();
  }

  return result;
}

/**
 * Merge remote data with local offline data.
 * Returns any conflicts that could not be auto-resolved.
 */
export async function mergeRemoteData<T>(
  remoteRecords: Array<{ key: string; value: T; updatedAt: number }>,
  strategy: MergeStrategy = "latest-wins",
): Promise<MergeConflict<T>[]> {
  const conflicts: MergeConflict<T>[] = [];

  for (const remote of remoteRecords) {
    const localRecord = await getOfflineData<T>(remote.key);

    if (localRecord === null) {
      // No local version -- accept remote
      await setOfflineData(remote.key, remote.value, true);
      continue;
    }

    // Get the full record for timestamp comparison
    const db = await openDB();
    const tx = db.transaction(DATA_STORE, "readonly");
    const store = tx.objectStore(DATA_STORE);
    const fullLocal = await idbRequest(store.get(remote.key)) as OfflineRecord<T> | undefined;

    if (!fullLocal || fullLocal.synced) {
      // Local was already synced -- remote is newer authoritative version
      await setOfflineData(remote.key, remote.value, true);
      continue;
    }

    // Local has unsynced changes -- apply merge strategy
    switch (strategy) {
      case "remote-wins":
        await setOfflineData(remote.key, remote.value, true);
        break;

      case "local-wins":
        // Keep local, mark as unsynced so it pushes back
        break;

      case "latest-wins":
        if (remote.updatedAt >= fullLocal.updatedAt) {
          await setOfflineData(remote.key, remote.value, true);
        }
        // else keep local
        break;

      default: {
        // Record as conflict for manual resolution
        conflicts.push({
          key: remote.key,
          localValue: fullLocal.value,
          remoteValue: remote.value,
          localUpdatedAt: fullLocal.updatedAt,
          remoteUpdatedAt: remote.updatedAt,
        });
      }
    }
  }

  return conflicts;
}

// ─── Auto-sync on reconnect ──────────────────────────────────────────────────

/**
 * Set up automatic sync when the browser comes back online.
 * Call once during app initialization.
 */
export function setupAutoSync(
  onConflict?: (mutation: QueuedMutation, response: Response) => Promise<boolean>,
  onSyncComplete?: (result: SyncResult) => void,
): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  const handler = async () => {
    const result = await replayMutations(onConflict);
    onSyncComplete?.(result);
  };

  window.addEventListener("online", handler);

  return () => {
    window.removeEventListener("online", handler);
  };
}

// ─── Internal helpers ────────────────────────────────────────────────────────

async function refreshMutationCount(): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(MUTATIONS_STORE, "readonly");
    const store = tx.objectStore(MUTATIONS_STORE);
    const count = await idbRequest(store.count());
    setPendingMutationCount(count);
  } catch {
    // DB may not be open yet
  }
}

// ─── Database cleanup ────────────────────────────────────────────────────────

/**
 * Delete the entire offline database. Use with caution.
 */
export async function destroyOfflineStore(): Promise<void> {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => {
      setPendingMutationCount(0);
      setLastSyncTime(null);
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
}

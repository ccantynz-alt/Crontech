import { eq, desc, and, gte, lte, asc } from "drizzle-orm";
import { db, auditLogs } from "@cronix/db";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuditEntryData {
  id: string;
  timestamp: string;
  actorId: string;
  actorIp: string | null;
  actorDevice: string | null;
  action: "CREATE" | "READ" | "UPDATE" | "DELETE" | "EXPORT" | "SIGN";
  resourceType: string;
  resourceId: string;
  detail: string | null;
  result: "success" | "failure";
  sessionId: string | null;
}

export interface AuditEntryWithHash extends AuditEntryData {
  previousHash: string | null;
  entryHash: string;
  signature: string | null;
}

export interface ChainVerificationResult {
  valid: boolean;
  totalEntries: number;
  verifiedEntries: number;
  firstInvalidEntryId: string | null;
  errors: string[];
}

// ---------------------------------------------------------------------------
// Genesis hash (all zeros for the first entry in the chain)
// ---------------------------------------------------------------------------

const GENESIS_HASH =
  "0000000000000000000000000000000000000000000000000000000000000000";

// ---------------------------------------------------------------------------
// SHA-256 hashing via Web Crypto API
// ---------------------------------------------------------------------------

async function sha256(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const buffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------------------------------------------------------------------------
// Compute the canonical string representation of an entry for hashing.
// Order of fields is deterministic to ensure consistent hashes.
// ---------------------------------------------------------------------------

function canonicalizeEntry(
  entry: AuditEntryData,
  previousHash: string,
): string {
  return JSON.stringify({
    id: entry.id,
    timestamp: entry.timestamp,
    actorId: entry.actorId,
    actorIp: entry.actorIp,
    actorDevice: entry.actorDevice,
    action: entry.action,
    resourceType: entry.resourceType,
    resourceId: entry.resourceId,
    detail: entry.detail,
    result: entry.result,
    sessionId: entry.sessionId,
    previousHash,
  });
}

// ---------------------------------------------------------------------------
// computeEntryHash — SHA-256 hash of all audit entry fields
// ---------------------------------------------------------------------------

export async function computeEntryHash(
  entry: AuditEntryData,
  previousHash: string,
): Promise<string> {
  const canonical = canonicalizeEntry(entry, previousHash);
  return sha256(canonical);
}

// ---------------------------------------------------------------------------
// getLastEntryHash — retrieve the hash of the most recent audit log entry
// ---------------------------------------------------------------------------

export async function getLastEntryHash(): Promise<string> {
  const result = await db
    .select({ entryHash: auditLogs.entryHash })
    .from(auditLogs)
    .orderBy(desc(auditLogs.timestamp), desc(auditLogs.id))
    .limit(1);

  const last = result[0];
  return last?.entryHash ?? GENESIS_HASH;
}

// ---------------------------------------------------------------------------
// createAuditEntry — creates a hash-chained audit entry
// ---------------------------------------------------------------------------

export async function createAuditEntry(
  data: AuditEntryData,
): Promise<AuditEntryWithHash> {
  const previousHash = await getLastEntryHash();
  const entryHash = await computeEntryHash(data, previousHash);

  const entry: AuditEntryWithHash = {
    ...data,
    previousHash,
    entryHash,
    signature: null,
  };

  await db.insert(auditLogs).values({
    id: entry.id,
    timestamp: entry.timestamp,
    actorId: entry.actorId,
    actorIp: entry.actorIp,
    actorDevice: entry.actorDevice,
    action: entry.action,
    resourceType: entry.resourceType,
    resourceId: entry.resourceId,
    detail: entry.detail,
    result: entry.result,
    sessionId: entry.sessionId,
    previousHash: entry.previousHash,
    entryHash: entry.entryHash,
    signature: entry.signature,
  });

  return entry;
}

// ---------------------------------------------------------------------------
// verifyEntry — verify a single entry's hash is correct
// ---------------------------------------------------------------------------

export async function verifyEntry(
  entry: AuditEntryWithHash,
): Promise<boolean> {
  const expectedHash = await computeEntryHash(
    {
      id: entry.id,
      timestamp: entry.timestamp,
      actorId: entry.actorId,
      actorIp: entry.actorIp,
      actorDevice: entry.actorDevice,
      action: entry.action,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId,
      detail: entry.detail,
      result: entry.result,
      sessionId: entry.sessionId,
    },
    entry.previousHash ?? GENESIS_HASH,
  );

  return expectedHash === entry.entryHash;
}

// ---------------------------------------------------------------------------
// verifyChain — verify integrity of hash chain between entries
// ---------------------------------------------------------------------------

export async function verifyChain(
  startId?: string,
  endId?: string,
): Promise<ChainVerificationResult> {
  const errors: string[] = [];

  // Build conditions for range queries
  const conditions = [];
  if (startId) {
    const startEntry = await db
      .select({ timestamp: auditLogs.timestamp })
      .from(auditLogs)
      .where(eq(auditLogs.id, startId))
      .limit(1);
    if (startEntry[0]) {
      conditions.push(gte(auditLogs.timestamp, startEntry[0].timestamp));
    }
  }
  if (endId) {
    const endEntry = await db
      .select({ timestamp: auditLogs.timestamp })
      .from(auditLogs)
      .where(eq(auditLogs.id, endId))
      .limit(1);
    if (endEntry[0]) {
      conditions.push(lte(auditLogs.timestamp, endEntry[0].timestamp));
    }
  }

  const whereClause =
    conditions.length > 0 ? and(...conditions) : undefined;

  const entries = await db
    .select()
    .from(auditLogs)
    .where(whereClause)
    .orderBy(asc(auditLogs.timestamp), asc(auditLogs.id));

  if (entries.length === 0) {
    return {
      valid: true,
      totalEntries: 0,
      verifiedEntries: 0,
      firstInvalidEntryId: null,
      errors: [],
    };
  }

  let verifiedCount = 0;
  let firstInvalidId: string | null = null;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (!entry) continue;

    // Verify the entry's own hash
    const entryData: AuditEntryData = {
      id: entry.id,
      timestamp: entry.timestamp,
      actorId: entry.actorId,
      actorIp: entry.actorIp ?? null,
      actorDevice: entry.actorDevice ?? null,
      action: entry.action,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId,
      detail: entry.detail ?? null,
      result: entry.result,
      sessionId: entry.sessionId ?? null,
    };

    const previousHash = entry.previousHash ?? GENESIS_HASH;
    const expectedHash = await computeEntryHash(entryData, previousHash);

    if (expectedHash !== entry.entryHash) {
      errors.push(
        `Entry ${entry.id}: hash mismatch. Expected ${expectedHash}, got ${entry.entryHash}`,
      );
      if (!firstInvalidId) firstInvalidId = entry.id;
      continue;
    }

    // Verify chain link: this entry's previousHash should match the prior entry's entryHash
    if (i > 0) {
      const prevEntry = entries[i - 1];
      if (prevEntry && entry.previousHash !== prevEntry.entryHash) {
        errors.push(
          `Entry ${entry.id}: chain break. previousHash ${entry.previousHash} does not match prior entry hash ${prevEntry.entryHash}`,
        );
        if (!firstInvalidId) firstInvalidId = entry.id;
        continue;
      }
    }

    verifiedCount++;
  }

  return {
    valid: errors.length === 0,
    totalEntries: entries.length,
    verifiedEntries: verifiedCount,
    firstInvalidEntryId: firstInvalidId,
    errors,
  };
}

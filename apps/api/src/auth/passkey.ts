// ── Passkey/WebAuthn Server Handlers ────────────────────────────
// Hono routes for WebAuthn registration and authentication.
// Uses in-memory challenge store (swap for KV/Redis in production).

import { Hono } from "hono";
import { z } from "zod";

// ── Types ───────────────────────────────────────────────────────

interface RegistrationOptionsResponse {
  rp: { name: string; id: string };
  user: { id: string; name: string; displayName: string };
  challenge: string;
  pubKeyCredParams: Array<{ alg: number; type: string }>;
  timeout: number;
  attestation: string;
  excludeCredentials: Array<{ id: string; type: string }>;
}

interface AuthenticationOptionsResponse {
  challenge: string;
  timeout: number;
  rpId: string;
  userVerification: string;
  allowCredentials: Array<{ id: string; type: string }>;
}

interface StoredUser {
  id: string;
  username: string;
  displayName: string;
}

interface StoredCredential {
  id: string;
  credentialId: string;
  publicKey: string; // base64 encoded
  counter: number;
  userId: string;
  deviceType: string;
  backedUp: boolean;
  transports: string | null;
}

// ── Zod Schemas ─────────────────────────────────────────────────

const generateRegistrationSchema = z.object({
  username: z.string().min(1).max(255),
  displayName: z.string().min(1).max(255),
});

const verifyRegistrationSchema = z.object({
  username: z.string().min(1).max(255),
  response: z.record(z.unknown()),
});

const verifyAuthenticationSchema = z.object({
  response: z.record(z.unknown()),
});

// ── In-Memory Stores ────────────────────────────────────────────
// In production, replace with Turso/Drizzle DB and KV store.

const challengeStore = new Map<
  string,
  { challenge: string; expiresAt: number }
>();
const userStore = new Map<string, StoredUser>();
const credentialStore = new Map<string, StoredCredential>();

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const RP_NAME = "Back to the Future";
const RP_ID = "localhost";
const ORIGIN = "http://localhost:3000";

function storeChallenge(key: string, challenge: string): void {
  challengeStore.set(key, {
    challenge,
    expiresAt: Date.now() + CHALLENGE_TTL_MS,
  });
}

function consumeChallenge(key: string): string | null {
  const entry = challengeStore.get(key);
  if (!entry) return null;
  challengeStore.delete(key);
  if (entry.expiresAt < Date.now()) return null;
  return entry.challenge;
}

function generateChallenge(): string {
  const buffer = new Uint8Array(32);
  crypto.getRandomValues(buffer);
  let binary = "";
  for (let i = 0; i < buffer.length; i++) {
    binary += String.fromCharCode(buffer[i] ?? 0);
  }
  return btoa(binary);
}

function generateId(): string {
  return crypto.randomUUID();
}

// ── Hono Router ─────────────────────────────────────────────────

const passkey = new Hono();

// POST /register/options
passkey.post("/register/options", async (c) => {
  const body = await c.req.json();
  const parsed = generateRegistrationSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      400,
    );
  }

  const { username, displayName } = parsed.data;

  // Find or create user
  let user: StoredUser | undefined;
  for (const u of userStore.values()) {
    if (u.username === username) {
      user = u;
      break;
    }
  }

  if (!user) {
    user = { id: generateId(), username, displayName };
    userStore.set(user.id, user);
  }

  // Get existing credentials for exclusion
  const excludeCredentials: Array<{ id: string; type: string }> = [];
  for (const cred of credentialStore.values()) {
    if (cred.userId === user.id) {
      excludeCredentials.push({
        id: cred.credentialId,
        type: "public-key",
      });
    }
  }

  const challenge = generateChallenge();
  storeChallenge(`reg:${username}`, challenge);

  const options: RegistrationOptionsResponse = {
    rp: { name: RP_NAME, id: RP_ID },
    user: { id: btoa(user.id), name: username, displayName },
    challenge,
    pubKeyCredParams: [
      { alg: -7, type: "public-key" }, // ES256
      { alg: -257, type: "public-key" }, // RS256
    ],
    timeout: 60000,
    attestation: "none",
    excludeCredentials,
  };

  return c.json(options, 200);
});

// POST /register/verify
passkey.post("/register/verify", async (c) => {
  const body = await c.req.json();
  const parsed = verifyRegistrationSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      400,
    );
  }

  const { username, response } = parsed.data;

  const expectedChallenge = consumeChallenge(`reg:${username}`);
  if (!expectedChallenge) {
    return c.json({ error: "Challenge expired or not found" }, 400);
  }

  // Find user
  let user: StoredUser | undefined;
  for (const u of userStore.values()) {
    if (u.username === username) {
      user = u;
      break;
    }
  }

  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  // In production, use @simplewebauthn/server's verifyRegistrationResponse
  // For now, store the credential from the response
  const credentialId =
    typeof response["id"] === "string" ? response["id"] : generateId();

  const credential: StoredCredential = {
    id: generateId(),
    credentialId,
    publicKey: "", // Would be extracted from attestationObject in production
    counter: 0,
    userId: user.id,
    deviceType: "singleDevice",
    backedUp: false,
    transports: null,
  };

  credentialStore.set(credential.id, credential);

  // Generate a session token
  const token = generateId();

  return c.json({ verified: true, token }, 200);
});

// POST /authenticate/options
passkey.post("/authenticate/options", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const usernameSchema = z.object({ username: z.string().optional() });
  const parsed = usernameSchema.safeParse(body);

  const allowCredentials: Array<{ id: string; type: string }> = [];

  if (parsed.success && parsed.data.username !== undefined) {
    let userId: string | undefined;
    for (const u of userStore.values()) {
      if (u.username === parsed.data.username) {
        userId = u.id;
        break;
      }
    }

    if (userId) {
      for (const cred of credentialStore.values()) {
        if (cred.userId === userId) {
          allowCredentials.push({
            id: cred.credentialId,
            type: "public-key",
          });
        }
      }
    }
  }

  const challenge = generateChallenge();
  storeChallenge(`auth:${challenge}`, challenge);

  const options: AuthenticationOptionsResponse = {
    challenge,
    timeout: 60000,
    rpId: RP_ID,
    userVerification: "preferred",
    allowCredentials,
  };

  return c.json(options, 200);
});

// POST /authenticate/verify
passkey.post("/authenticate/verify", async (c) => {
  const body = await c.req.json();
  const parsed = verifyAuthenticationSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      400,
    );
  }

  const authResponse = parsed.data.response;
  const credentialId =
    typeof authResponse["id"] === "string" ? authResponse["id"] : "";

  // Find stored credential
  let storedCredential: StoredCredential | undefined;
  for (const cred of credentialStore.values()) {
    if (cred.credentialId === credentialId) {
      storedCredential = cred;
      break;
    }
  }

  if (!storedCredential) {
    return c.json({ error: "Credential not found" }, 404);
  }

  // Find a valid challenge
  let challenge: string | null = null;
  for (const [key, entry] of challengeStore.entries()) {
    if (key.startsWith("auth:") && entry.expiresAt >= Date.now()) {
      challenge = entry.challenge;
      challengeStore.delete(key);
      break;
    }
  }

  if (!challenge) {
    return c.json({ error: "Challenge expired or not found" }, 400);
  }

  // In production, use @simplewebauthn/server's verifyAuthenticationResponse
  // For now, accept and update counter
  storedCredential.counter += 1;
  credentialStore.set(storedCredential.id, storedCredential);

  const token = generateId();

  return c.json(
    { verified: true, token, userId: storedCredential.userId },
    200,
  );
});

export { passkey as passkeyRoutes };
export { RP_ID, RP_NAME, ORIGIN };

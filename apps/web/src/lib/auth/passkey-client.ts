// ── Client-Side Passkey/WebAuthn Helpers ────────────────────────
// Uses the native Web Authentication API for passkey registration
// and authentication. In production, consider @simplewebauthn/browser.

// ── Configuration ───────────────────────────────────────────────

const API_BASE = "http://localhost:3001/api";

// ── Error Types ─────────────────────────────────────────────────

export class PasskeyError extends Error {
  readonly code: PasskeyErrorCode;

  constructor(code: PasskeyErrorCode, message: string) {
    super(message);
    this.name = "PasskeyError";
    this.code = code;
  }
}

export type PasskeyErrorCode =
  | "WEBAUTHN_NOT_SUPPORTED"
  | "REGISTRATION_OPTIONS_FAILED"
  | "REGISTRATION_CANCELLED"
  | "REGISTRATION_VERIFICATION_FAILED"
  | "AUTHENTICATION_OPTIONS_FAILED"
  | "AUTHENTICATION_CANCELLED"
  | "AUTHENTICATION_VERIFICATION_FAILED"
  | "NETWORK_ERROR";

// ── Result Types ────────────────────────────────────────────────

export interface RegistrationResult {
  verified: boolean;
  token: string;
}

export interface AuthenticationResult {
  verified: boolean;
  token: string;
  userId: string;
}

// ── Server Response Types ───────────────────────────────────────

interface RegistrationOptionsResponse {
  rp: { name: string; id: string };
  user: { id: string; name: string; displayName: string };
  challenge: string;
  pubKeyCredParams: Array<{ alg: number; type: string }>;
  timeout: number;
  attestation: string;
}

interface AuthenticationOptionsResponse {
  challenge: string;
  timeout: number;
  rpId: string;
  userVerification: string;
}

// ── Helpers ─────────────────────────────────────────────────────

function browserSupportsWebAuthn(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.PublicKeyCredential !== "undefined"
  );
}

function assertWebAuthnSupported(): void {
  if (!browserSupportsWebAuthn()) {
    throw new PasskeyError(
      "WEBAUTHN_NOT_SUPPORTED",
      "WebAuthn is not supported in this browser. Use a modern browser with passkey support.",
    );
  }
}

function base64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function uint8ArrayToBase64(arr: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < arr.length; i++) {
    binary += String.fromCharCode(arr[i] ?? 0);
  }
  return btoa(binary);
}

async function postJSON<T>(path: string, body: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Network request failed";
    throw new PasskeyError("NETWORK_ERROR", message);
  }

  if (!response.ok) {
    throw new PasskeyError("NETWORK_ERROR", `HTTP ${response.status}`);
  }

  return response.json() as Promise<T>;
}

// ── Public API ──────────────────────────────────────────────────

/**
 * Register a new passkey for the given username.
 */
export async function registerPasskey(
  username: string,
): Promise<RegistrationResult> {
  assertWebAuthnSupported();

  // Step 1: Get registration options from the server
  let options: RegistrationOptionsResponse;
  try {
    options = await postJSON<RegistrationOptionsResponse>(
      "/auth/passkey/register/options",
      { username, displayName: username },
    );
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to get registration options";
    throw new PasskeyError("REGISTRATION_OPTIONS_FAILED", message);
  }

  // Step 2: Start the WebAuthn registration ceremony
  let credential: Credential | null;
  try {
    credential = await navigator.credentials.create({
      publicKey: {
        rp: options.rp,
        user: {
          id: base64ToUint8Array(options.user.id),
          name: options.user.name,
          displayName: options.user.displayName,
        },
        challenge: base64ToUint8Array(options.challenge),
        pubKeyCredParams: options.pubKeyCredParams.map((p) => ({
          alg: p.alg,
          type: p.type as "public-key",
        })),
        timeout: options.timeout,
      },
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Registration was cancelled";
    throw new PasskeyError("REGISTRATION_CANCELLED", message);
  }

  if (!credential) {
    throw new PasskeyError("REGISTRATION_CANCELLED", "No credential returned");
  }

  const pkCredential = credential as PublicKeyCredential;
  const attestation =
    pkCredential.response as AuthenticatorAttestationResponse;

  const registrationResponse = {
    id: pkCredential.id,
    rawId: uint8ArrayToBase64(new Uint8Array(pkCredential.rawId)),
    response: {
      clientDataJSON: uint8ArrayToBase64(
        new Uint8Array(attestation.clientDataJSON),
      ),
      attestationObject: uint8ArrayToBase64(
        new Uint8Array(attestation.attestationObject),
      ),
    },
    type: pkCredential.type,
  };

  // Step 3: Verify with the server
  try {
    return await postJSON<RegistrationResult>(
      "/auth/passkey/register/verify",
      { username, response: registrationResponse },
    );
  } catch (err: unknown) {
    const message =
      err instanceof Error
        ? err.message
        : "Registration verification failed";
    throw new PasskeyError("REGISTRATION_VERIFICATION_FAILED", message);
  }
}

/**
 * Authenticate with an existing passkey.
 */
export async function authenticateWithPasskey(): Promise<AuthenticationResult> {
  assertWebAuthnSupported();

  // Step 1: Get authentication options from the server
  let options: AuthenticationOptionsResponse;
  try {
    options = await postJSON<AuthenticationOptionsResponse>(
      "/auth/passkey/authenticate/options",
      {},
    );
  } catch (err: unknown) {
    const message =
      err instanceof Error
        ? err.message
        : "Failed to get authentication options";
    throw new PasskeyError("AUTHENTICATION_OPTIONS_FAILED", message);
  }

  // Step 2: Start the WebAuthn authentication ceremony
  let credential: Credential | null;
  try {
    credential = await navigator.credentials.get({
      publicKey: {
        challenge: base64ToUint8Array(options.challenge),
        rpId: options.rpId,
        userVerification: options.userVerification as UserVerificationRequirement,
        timeout: options.timeout,
      },
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Authentication was cancelled";
    throw new PasskeyError("AUTHENTICATION_CANCELLED", message);
  }

  if (!credential) {
    throw new PasskeyError(
      "AUTHENTICATION_CANCELLED",
      "No credential returned",
    );
  }

  const pkCredential = credential as PublicKeyCredential;
  const assertion = pkCredential.response as AuthenticatorAssertionResponse;

  const authResponse: Record<string, string> = {
    clientDataJSON: uint8ArrayToBase64(
      new Uint8Array(assertion.clientDataJSON),
    ),
    authenticatorData: uint8ArrayToBase64(
      new Uint8Array(assertion.authenticatorData),
    ),
    signature: uint8ArrayToBase64(new Uint8Array(assertion.signature)),
  };

  if (assertion.userHandle) {
    authResponse["userHandle"] = uint8ArrayToBase64(
      new Uint8Array(assertion.userHandle),
    );
  }

  const authenticationResponse = {
    id: pkCredential.id,
    rawId: uint8ArrayToBase64(new Uint8Array(pkCredential.rawId)),
    response: authResponse,
    type: pkCredential.type,
  };

  // Step 3: Verify with the server
  try {
    return await postJSON<AuthenticationResult>(
      "/auth/passkey/authenticate/verify",
      { response: authenticationResponse },
    );
  } catch (err: unknown) {
    const message =
      err instanceof Error
        ? err.message
        : "Authentication verification failed";
    throw new PasskeyError("AUTHENTICATION_VERIFICATION_FAILED", message);
  }
}

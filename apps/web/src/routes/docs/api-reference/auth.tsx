// ── /docs/api-reference/auth — Auth procedure reference ────────────
//
// Documents the `auth.*` router as it actually ships today. Procedure
// names, input shapes, and return shapes all come from
// apps/api/src/trpc/procedures/auth.ts — no aspirational surface area,
// no invented fields.

import type { JSX } from "solid-js";
import { SEOHead } from "../../../components/SEOHead";
import { Callout, DocsArticle, KeyList } from "../../../components/docs/DocsArticle";

export default function AuthReference(): JSX.Element {
  return (
    <>
      <SEOHead
        title="API Reference — Auth"
        description="tRPC auth router: passkey register / login, Google OAuth, email + password, CSRF, and session management. All three sign-in paths land the same user in the same place."
        path="/docs/api-reference/auth"
      />

      <DocsArticle
        eyebrow="API Reference · Auth"
        title="Auth procedures"
        subtitle="The auth.* router handles every sign-up and sign-in path on Crontech — passkeys, Google OAuth, and classic email + password — plus the CSRF and session plumbing that keeps them honest."
        readTime="5 min"
        updated="April 2026"
        nextStep={{
          label: "Projects procedures",
          href: "/docs/api-reference/projects",
          description:
            "Once a user is signed in, projects.* is where they spend most of their time: list, create, deploy, attach a domain.",
        }}
      >
        <p>
          Every route under <code>auth.*</code> is implemented in{" "}
          <code>apps/api/src/trpc/procedures/auth.ts</code>. The router is intentionally narrow: one
          sub-router per flow (register, login), plus a handful of utilities (CSRF, password
          strength, current-user probe). There is no "reset password", "email link sign-in", or
          "magic link" procedure — those are not shipped today. The article lists only what runs.
        </p>

        <Callout tone="info" title="CSRF tokens are mandatory on mutations">
          Before any auth mutation, call <code>auth.csrfToken</code> and include the returned token
          on the next request. The token is validated against the caller's session and rejected with{" "}
          <code>FORBIDDEN</code> if it's missing, stale, or forged.
        </Callout>

        <h2>CSRF + current user</h2>

        <h3>
          <code>auth.csrfToken</code>
        </h3>
        <p>
          Public <em>query</em>. No input. Returns <code>{"{ token: string }"}</code>. Call this
          once per page load — the token is safe to keep in memory for the life of the session.
        </p>

        <h3>
          <code>auth.me</code>
        </h3>
        <p>
          Protected <em>query</em>. No input. Returns the current user's <code>id</code>,{" "}
          <code>email</code>, <code>displayName</code>, <code>role</code>, and{" "}
          <code>createdAt</code>. Throws <code>NOT_FOUND</code> if the session's user has been
          deleted since the cookie was issued.
        </p>

        <h2>Passkey registration (two-step WebAuthn)</h2>

        <h3>
          <code>auth.register.start</code>
        </h3>
        <p>
          Public <em>mutation</em>. Input:
        </p>
        <pre
          class="docs-pre"
          style={{
            background: "var(--color-bg-subtle)",
            border: "1px solid var(--color-border)",
            "border-radius": "0.75rem",
            padding: "1rem",
            overflow: "auto",
            "font-size": "0.85rem",
          }}
        >
          <code>{`z.object({
  email: z.string().email(),
  displayName: z.string().min(1).max(255),
})`}</code>
        </pre>
        <p>
          Returns <code>{"{ options, userId }"}</code>. The <code>options</code> object is the full
          SimpleWebAuthn <code>PublicKeyCredentialCreationOptionsJSON</code> — pass it straight to{" "}
          <code>navigator.credentials.create()</code>.
        </p>

        <h3>
          <code>auth.register.finish</code>
        </h3>
        <p>
          Public <em>mutation</em>. Input:
        </p>
        <pre
          class="docs-pre"
          style={{
            background: "var(--color-bg-subtle)",
            border: "1px solid var(--color-border)",
            "border-radius": "0.75rem",
            padding: "1rem",
            overflow: "auto",
            "font-size": "0.85rem",
          }}
        >
          <code>{`z.object({
  userId: z.string().uuid(),
  response: RegistrationResponseJSON,
})`}</code>
        </pre>
        <p>
          Verifies the attestation, stores the credential, creates a session, and returns{" "}
          <code>{"{ verified: true, token }"}</code>. The token is the session token — set it as an
          HTTP-only cookie on your response.
        </p>

        <h2>Passkey login (two-step WebAuthn)</h2>

        <h3>
          <code>auth.login.start</code>
        </h3>
        <p>
          Public <em>mutation</em>. Input is optional — pass <code>{"{ email }"}</code> to scope the
          credential list to a specific user, or omit it for a discoverable-credential flow where
          the browser picks the passkey itself.
        </p>

        <h3>
          <code>auth.login.finish</code>
        </h3>
        <p>
          Public <em>mutation</em>. Input:
        </p>
        <pre
          class="docs-pre"
          style={{
            background: "var(--color-bg-subtle)",
            border: "1px solid var(--color-border)",
            "border-radius": "0.75rem",
            padding: "1rem",
            overflow: "auto",
            "font-size": "0.85rem",
          }}
        >
          <code>{`z.object({
  userId: z.string().uuid().nullable(),
  response: AuthenticationResponseJSON,
})`}</code>
        </pre>
        <p>
          Returns <code>{"{ verified: true, token, userId }"}</code>. Pass <code>userId: null</code>{" "}
          if you started with a discoverable flow — the server will resolve the user from the
          credential.
        </p>

        <h2>Email + password</h2>

        <h3>
          <code>auth.registerWithPassword</code>
        </h3>
        <p>
          Public <em>mutation</em>. Input is <code>registerWithPasswordSchema</code> —{" "}
          <code>email</code>, <code>displayName</code>, and <code>password</code>. Returns{" "}
          <code>{"{ userId, token }"}</code>. Auto-provisioning runs fire-and-forget after the
          response; its failures never block sign-up.
        </p>

        <h3>
          <code>auth.loginWithPassword</code>
        </h3>
        <p>
          Public <em>mutation</em>. Input is <code>loginWithPasswordSchema</code> —{" "}
          <code>email</code> and <code>password</code>. Returns <code>{"{ userId, token }"}</code>.
        </p>

        <h3>
          <code>auth.checkPasswordStrength</code>
        </h3>
        <p>
          Public <em>query</em>. Input <code>{"{ password: string }"}</code>. Returns the zxcvbn-
          style score + feedback the sign-up form uses to render its strength meter. Safe to call on
          every keystroke — it doesn't touch the DB.
        </p>

        <h2>Google OAuth</h2>

        <h3>
          <code>auth.getGoogleAuthUrl</code>
        </h3>
        <p>
          Public <em>query</em>. Optional input <code>{"{ redirectTo?: string }"}</code>. Returns{" "}
          <code>{"{ url: string }"}</code> — a fully-built Google OAuth consent URL. The callback
          handler lives outside the tRPC router at <code>/auth/google/callback</code> and exchanges
          the code for a session cookie.
        </p>

        <h2>Session teardown</h2>

        <h3>
          <code>auth.logout</code>
        </h3>
        <p>
          Protected <em>mutation</em>. No input. Deletes the current session from the DB and returns{" "}
          <code>{"{ success: true }"}</code>. The client is responsible for clearing the session
          cookie.
        </p>

        <h2>A minimal client flow</h2>

        <pre
          class="docs-pre"
          style={{
            background: "var(--color-bg-subtle)",
            border: "1px solid var(--color-border)",
            "border-radius": "0.75rem",
            padding: "1rem",
            overflow: "auto",
            "font-size": "0.85rem",
          }}
        >
          <code>{`// 1. Fetch a CSRF token
const { token: csrf } = await trpc.auth.csrfToken.query();

// 2. Register a passkey
const { options, userId } = await trpc.auth.register.start.mutate(
  { email, displayName },
  { context: { csrf } },
);
const attestation = await startRegistration(options);
const { token } = await trpc.auth.register.finish.mutate(
  { userId, response: attestation },
  { context: { csrf } },
);

// 3. Session is live — subsequent protected procs just work
const me = await trpc.auth.me.query();`}</code>
        </pre>

        <Callout tone="note">
          Rate limits: every mutation on <code>auth.*</code> goes through the shared tRPC middleware
          stack, which applies per-IP and per-account throttles. You won't hit them with legitimate
          traffic; you will hit them with a brute-force loop.
        </Callout>

        <h2>What's not here yet</h2>
        <KeyList
          items={[
            {
              term: "Password reset",
              description:
                "The email plumbing exists (see the email router) but no public password-reset procedure ships today. Track this in BUILD_BIBLE.",
            },
            {
              term: "Magic-link sign-in",
              description:
                "Not shipped. The passkey + Google paths cover the majority of no-password flows; magic links add attack surface without a clear win.",
            },
            {
              term: "Multi-factor TOTP",
              description:
                "Planned for post-launch hardening. Passkeys are already phishing-immune; TOTP lands for admin accounts first.",
            },
          ]}
        />
      </DocsArticle>
    </>
  );
}

// src/sentry-before-send.ts — canonical fleet scrubber
// Line 1 is per-repo — see "Per-repo `import type` line" table in Step 3.
// hq-console uses @sentry/nextjs. Consumer steps override to their own SDK.
import type { ErrorEvent, EventHint } from "@sentry/node";

const SENSITIVE_FIELD_NAMES = new Set([
  "password", "secret", "apikey", "api_key", "token",
  // Cognito token-response fields captured as error context.
  "idtoken", "accesstoken", "refreshtoken",
]);

// Stored lowercased; membership tested against `name.toLowerCase()`.
// MUST cover BOTH Auth.js v5 (current in hq-console, pinned to
// next-auth@5.0.0-beta.25 which resolves @auth/core@0.37.2) AND legacy
// NextAuth v4 name spaces — covering both is cheap and survives accidental
// downgrades or mixed-version repos. Grounded against @auth/core@0.37.2's
// src/lib/utils/cookie.ts (re-ground via `grep -nE
// '(sessionToken|callbackUrl|csrfToken|pkceCodeVerifier|state|nonce|webauthnChallenge): \{'
// node_modules/.pnpm/@auth+core@0.37.2/node_modules/@auth/core/src/lib/utils/cookie.ts`
// — seven matches, one per cookie family): two distinct prefixing patterns
// coexist there, and the entries below mirror BOTH exactly:
//   • session-token / callback-url / pkce.code_verifier / state / nonce /
//     challenge each pair the bare form (HTTP dev, cookiePrefix="") with
//     the __Secure- form (HTTPS prod, cookiePrefix="__Secure-").
//   • csrf-token is special: the source explicitly uses __Host- (NOT
//     __Secure-) under HTTPS for stricter cookie scoping (the csrfToken
//     entry in @auth/core's cookie.ts is the only one whose name template
//     uses `__Host-` instead of `${cookiePrefix}`; the comment above it
//     reads "Default to __Host- for CSRF token for additional protection
//     if using useSecureCookies"). The set therefore pairs the bare form
//     with __Host-, and does NOT include __Secure-authjs.csrf-token
//     because @auth/core never emits that name. The legacy v4 entry mirrors
//     the same pattern (bare next-auth.csrf-token + __Host-next-auth.csrf-token,
//     no __Secure- variant).
// Missing any of the four OAuth-state families (pkce.code_verifier, state,
// nonce, challenge) ships a cookie-leak in the same class as the v4-only
// defect Round-4 called out. This set is the single authoritative spec;
// all of Steps 3/8/9a/12/13 reproduce it identically.
//
// MAINTAINER NOTE: Do NOT extend this set by mechanically pairing every
// cookie with bare + __Secure- + __Host-. The pairing follows the source:
// session-style cookies use __Secure-; csrf-style cookies use __Host-.
// New entries added in the future must be grounded against the actual
// emitter (Auth.js source for v5/v4, vendor docs for Clerk, etc.) rather
// than copied from the existing pattern.
const SENSITIVE_COOKIE_NAMES = new Set([
  // ==== Auth.js v5 (next-auth@5 / @auth/core) ====
  // Session JWT — bare + __Secure-
  "authjs.session-token",
  "__secure-authjs.session-token",
  // CSRF double-submit token — bare + __Host- ONLY (@auth/core's cookie.ts
  // csrfToken entry uses __Host-, never __Secure-)
  "authjs.csrf-token",
  "__host-authjs.csrf-token",
  // Post-auth redirect URL — bare + __Secure-
  "authjs.callback-url",
  "__secure-authjs.callback-url",
  // OAuth PKCE verifier — leaking this enables interception of an in-flight
  // OAuth code exchange.
  "authjs.pkce.code_verifier",
  "__secure-authjs.pkce.code_verifier",
  // OAuth CSRF/replay protection
  "authjs.state",
  "__secure-authjs.state",
  // OpenID Connect nonce — replay protection
  "authjs.nonce",
  "__secure-authjs.nonce",
  // OAuth WebAuthn challenge
  "authjs.challenge",
  "__secure-authjs.challenge",
  // ==== NextAuth v4 legacy names (kept so accidental downgrades /
  //       mixed-version monorepos don't silently leak). Same prefix
  //       discipline as v5: csrf-token uses __Host-, others use __Secure-. ====
  "next-auth.session-token",
  "__secure-next-auth.session-token",
  "next-auth.csrf-token",
  "__host-next-auth.csrf-token",
  "next-auth.callback-url",
  "__secure-next-auth.callback-url",
  "next-auth.pkce.code_verifier",
  "__secure-next-auth.pkce.code_verifier",
  "next-auth.state",
  "__secure-next-auth.state",
  // ==== Clerk (documented for future; no-op today) ====
  "__clerk_db_jwt", "__session",
]);

const REDACTED = "[Filtered]";

const SENSITIVE_HEADER_NAMES = new Set([
  "authorization", "proxy-authorization",
  "cookie", "set-cookie",
  "x-api-key", "x-auth-token", "x-access-token", "x-session-token",
]);

function scrubHeaders(h?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!h) return h;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(h)) {
    out[k] = SENSITIVE_HEADER_NAMES.has(k.toLowerCase()) ? REDACTED : v;
  }
  return out;
}

type CookieField = Record<string, unknown> | string | undefined;

function scrubCookies(c: CookieField): CookieField {
  if (!c) return c;
  if (typeof c === "string") return REDACTED; // raw Cookie header — wholesale redact
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(c)) {
    out[k] = SENSITIVE_COOKIE_NAMES.has(k.toLowerCase()) ? REDACTED : v;
  }
  return out;
}

const SENSITIVE_STRING_PATTERNS: RegExp[] = [
  // kv pairs; `(?:id|access|refresh)[_-]?token` catches Cognito-style free-text
  // `accessToken=...`, `refreshToken: ...`, `id_token=...` which bare `\btoken` misses.
  /\b(password|secret|api[_-]?key|(?:id|access|refresh)[_-]?token|token)\s*[:=]\s*[^\s&"'<>]+/gi,
  /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
];

function scrubString(s: string): string {
  let out = s;
  for (const re of SENSITIVE_STRING_PATTERNS) {
    out = out.replace(re, (m) => {
      const sep = m.search(/[:=\s]/);
      return sep > 0 ? `${m.slice(0, sep + 1)}${REDACTED}` : REDACTED;
    });
  }
  return out;
}

function scrubQueryString(qs: string): string {
  try {
    const params = new URLSearchParams(qs.startsWith("?") ? qs.slice(1) : qs);
    const out: string[] = [];
    for (const [k, v] of params) {
      out.push(`${k}=${SENSITIVE_FIELD_NAMES.has(k.toLowerCase()) ? REDACTED : v}`);
    }
    const joined = out.join("&");
    return qs.startsWith("?") ? `?${joined}` : joined;
  } catch {
    return scrubString(qs);
  }
}

function scrubFields<T>(value: T, memo: Map<object, unknown> = new Map()): T {
  if (value === null || typeof value !== "object") return value;
  const obj = value as unknown as object;
  // On cycle revisit, return the SAME scrubbed copy built on first visit —
  // NOT the original. Returning the original would leak fields reachable
  // only through the cycle (e.g., a.self.token).
  if (memo.has(obj)) return memo.get(obj) as T;

  if (Array.isArray(value)) {
    const arr: unknown[] = [];
    memo.set(obj, arr);
    for (const v of value) arr.push(scrubFields(v, memo));
    return arr as unknown as T;
  }

  const out: Record<string, unknown> = {};
  memo.set(obj, out);
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_FIELD_NAMES.has(k.toLowerCase())) {
      out[k] = REDACTED;
    } else if (v !== null && typeof v === "object") {
      out[k] = scrubFields(v, memo);
    } else if (typeof v === "string") {
      // SCALAR-STRING DEFENSE-IN-DEPTH. A stringified log line stashed via
      // setExtra / setContext / setUser can embed `password=...` or a Bearer
      // token even when the outer key (`note`, `bio`, `log_line`, …) isn't
      // in SENSITIVE_FIELD_NAMES. Route scalar strings through scrubString so
      // these don't bypass the scrubber on their way into Sentry.
      out[k] = scrubString(v);
    } else {
      out[k] = v;
    }
  }
  return out as unknown as T;
}

export function beforeSend(event: ErrorEvent, _hint: EventHint): ErrorEvent | null {
  if (event.request) {
    const req = event.request as { headers?: unknown; cookies?: unknown; data?: unknown; query_string?: unknown };
    event.request = {
      ...event.request,
      headers: scrubHeaders(req.headers as Record<string, unknown> | undefined) as typeof event.request.headers,
      cookies: scrubCookies(req.cookies as CookieField) as typeof event.request.cookies,
      data: scrubFields(req.data),
      query_string:
        typeof req.query_string === "string"
          ? scrubQueryString(req.query_string)
          : (req.query_string as typeof event.request.query_string),
    };
  }
  if (typeof event.message === "string") event.message = scrubString(event.message);
  if (event.exception?.values) {
    event.exception = {
      ...event.exception,
      values: event.exception.values.map((v) => ({
        ...v,
        value: typeof v.value === "string" ? scrubString(v.value) : v.value,
      })),
    };
  }
  if (event.user) event.user = scrubFields(event.user as Record<string, unknown>) as typeof event.user;
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map((b) => ({
      ...b,
      message: typeof b.message === "string" ? scrubString(b.message) : b.message,
      data: b.data ? scrubFields(b.data) : b.data,
    }));
  }
  if (event.extra) event.extra = scrubFields(event.extra);
  if (event.contexts) event.contexts = scrubFields(event.contexts);
  return event;
}

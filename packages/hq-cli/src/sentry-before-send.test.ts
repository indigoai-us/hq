// src/sentry-before-send.test.ts — canonical fleet Vitest suite.
// This file is byte-identical across every consumer repo (no per-repo
// line-1 variation, unlike sentry-before-send.ts). The body-identity
// gate each consumer runs is `diff hq-console/src/sentry-before-send.test.ts
// <consumer>/src/sentry-before-send.test.ts` returns empty (no tail -n +2).
import { describe, expect, it } from "vitest";
import type { ErrorEvent, EventHint } from "@sentry/nextjs";
import { beforeSend } from "./sentry-before-send";

const REDACTED = "[Filtered]";

function run(event: ErrorEvent): ErrorEvent {
  const result = beforeSend(event, {} as EventHint);
  if (!result) throw new Error("beforeSend dropped event unexpectedly");
  return result;
}

describe("scrubHeaders — SENSITIVE_HEADER_NAMES case-insensitive redaction", () => {
  const sensitiveHeaders = [
    "authorization",
    "proxy-authorization",
    "cookie",
    "set-cookie",
    "x-api-key",
    "x-auth-token",
    "x-access-token",
    "x-session-token",
  ];

  it.each(sensitiveHeaders)("redacts %s header (and case variants)", (name) => {
    const upper = name.toUpperCase();
    const out = run({
      request: {
        headers: { [upper]: "leaky-value", "x-trace-id": "keep-me" },
      },
    } as unknown as ErrorEvent);
    expect((out.request!.headers as Record<string, unknown>)[upper]).toBe(REDACTED);
    expect((out.request!.headers as Record<string, unknown>)["x-trace-id"]).toBe("keep-me");
  });

  it("redacts a raw Cookie header that lands on request.headers.cookie", () => {
    const out = run({
      request: {
        headers: {
          Cookie: "authjs.session-token=abc; other=keep",
          "x-trace-id": "keep-me",
        },
      },
    } as unknown as ErrorEvent);
    expect((out.request!.headers as Record<string, unknown>).Cookie).toBe(REDACTED);
    expect((out.request!.headers as Record<string, unknown>)["x-trace-id"]).toBe("keep-me");
  });
});

describe("scrubCookies — SENSITIVE_COOKIE_NAMES (Auth.js v5 + v4 legacy + Clerk) + raw-string fallback", () => {
  // v5 (Auth.js): session / callback-url use __Secure-; csrf-token uses
  // __Host- (NOT __Secure-). OAuth-state families (pkce / state / nonce /
  // challenge) each pair bare + __Secure-.
  const v5Names = [
    "authjs.session-token",
    "__secure-authjs.session-token",
    "authjs.csrf-token",
    "__host-authjs.csrf-token",
    "authjs.callback-url",
    "__secure-authjs.callback-url",
    "authjs.pkce.code_verifier",
    "__secure-authjs.pkce.code_verifier",
    "authjs.state",
    "__secure-authjs.state",
    "authjs.nonce",
    "__secure-authjs.nonce",
    "authjs.challenge",
    "__secure-authjs.challenge",
  ];

  // v4 (NextAuth legacy): same prefix discipline — csrf uses __Host-, others
  // use __Secure-. Kept in the set so accidental downgrades / mixed-version
  // monorepos don't silently leak.
  const v4Names = [
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
  ];

  const clerkNames = ["__clerk_db_jwt", "__session"];

  it.each([...v5Names, ...v4Names, ...clerkNames])(
    "redacts cookie %s (case-insensitive)",
    (name) => {
      const out = run({
        request: {
          cookies: { [name.toUpperCase()]: "secret-session-value", keep_me: "ok" },
        },
      } as unknown as ErrorEvent);
      const cookies = out.request!.cookies as Record<string, unknown>;
      expect(cookies[name.toUpperCase()]).toBe(REDACTED);
      expect(cookies.keep_me).toBe("ok");
    },
  );

  it("does NOT include a __Secure-authjs.csrf-token assertion — Auth.js v5 never emits that name (uses __Host- instead)", () => {
    // This test is a read-through spec comment: the set MUST NOT have an
    // entry for __Secure-authjs.csrf-token. If a maintainer ever adds one
    // mechanically-by-pattern, this test documents why it is wrong.
    const out = run({
      request: {
        cookies: { "__Secure-authjs.csrf-token": "does-not-exist-in-prod" },
      },
    } as unknown as ErrorEvent);
    // The value is NOT redacted because the set does not contain that name.
    // This is deliberate — see SENSITIVE_COOKIE_NAMES comment in the module.
    const cookies = out.request!.cookies as Record<string, unknown>;
    expect(cookies["__Secure-authjs.csrf-token"]).toBe("does-not-exist-in-prod");
  });

  it("wholesale-redacts a raw-string Cookie header", () => {
    const out = run({
      request: { cookies: "anything=here; other=keep" },
    } as unknown as ErrorEvent);
    expect(out.request!.cookies).toBe(REDACTED);
  });

  it("leaves undefined cookies alone", () => {
    const out = run({ request: { headers: {} } } as unknown as ErrorEvent);
    expect(out.request!.cookies).toBeUndefined();
  });
});

describe("scrubFields — recursive redaction with case-insensitivity, arrays, nested, cycles", () => {
  it("redacts top-level sensitive field names case-insensitively", () => {
    const out = run({
      extra: {
        token: "abc",
        Password: "pw",
        APIKEY: "k",
        api_key: "k2",
        IdToken: "id",
        ACCESSTOKEN: "at",
        RefreshToken: "rt",
        keep: "yes",
      },
    } as unknown as ErrorEvent);
    const extra = out.extra as Record<string, unknown>;
    expect(extra.token).toBe(REDACTED);
    expect(extra.Password).toBe(REDACTED);
    expect(extra.APIKEY).toBe(REDACTED);
    expect(extra.api_key).toBe(REDACTED);
    expect(extra.IdToken).toBe(REDACTED);
    expect(extra.ACCESSTOKEN).toBe(REDACTED);
    expect(extra.RefreshToken).toBe(REDACTED);
    expect(extra.keep).toBe("yes");
  });

  it("recurses into nested objects and arrays", () => {
    const out = run({
      extra: {
        nested: { deeper: { token: "t", safe: 1 } },
        items: [{ password: "pw" }, { other: "ok" }],
      },
    } as unknown as ErrorEvent);
    const extra = out.extra as Record<string, any>;
    expect(extra.nested.deeper.token).toBe(REDACTED);
    expect(extra.nested.deeper.safe).toBe(1);
    expect(extra.items[0].password).toBe(REDACTED);
    expect(extra.items[1].other).toBe("ok");
  });

  it("handles circular references without stack overflow and scrubs fields reachable only through the cycle", () => {
    const cyclic: Record<string, unknown> = { token: "leak" };
    cyclic.self = cyclic;
    const out = run({ extra: { outer: cyclic } } as unknown as ErrorEvent);
    const outer = (out.extra as any).outer;
    // Top-level field is scrubbed.
    expect(outer.token).toBe(REDACTED);
    // The Map<original, scrubbed> cycle fix means re-visits return the
    // memoized scrubbed copy, not the un-scrubbed original — so
    // `outer.self.token` is ALSO [Filtered], not the leaked value.
    expect(outer.self.token).toBe(REDACTED);
    expect(outer.self).toBe(outer);
  });

  it("scalar-string defense-in-depth: redacts embedded credentials in extra.note even when the key is NOT in SENSITIVE_FIELD_NAMES", () => {
    const out = run({
      extra: { note: "Something broke, password=hunter2 failed" },
    } as unknown as ErrorEvent);
    const extra = out.extra as Record<string, unknown>;
    expect(extra.note).toContain(`password=${REDACTED}`);
    expect(extra.note).not.toContain("hunter2");
  });

  it("scalar-string defense-in-depth: redacts a Bearer in user.bio (key NOT in SENSITIVE_FIELD_NAMES)", () => {
    const out = run({
      user: { id: "u1", email: "a@b.c", bio: "authorization: Bearer leak" },
    } as unknown as ErrorEvent);
    const user = out.user as Record<string, unknown>;
    expect(user.id).toBe("u1");
    expect(user.email).toBe("a@b.c");
    expect(user.bio).toContain(`Bearer ${REDACTED}`);
    expect(user.bio).not.toContain("leak");
  });
});

describe("scrubString — regex passes for kv, scheme+credential, JWT triplets", () => {
  it("redacts key=value and key: value pairs", () => {
    const out = run({
      message: "password=hunter2 and api-key: abc123 should be redacted",
    } as unknown as ErrorEvent);
    expect(out.message).toContain(`password=${REDACTED}`);
    expect(out.message).toContain(`api-key:${REDACTED}`);
    expect(out.message).not.toContain("hunter2");
    expect(out.message).not.toContain("abc123");
  });

  it("redacts Bearer / Basic credentials", () => {
    const out = run({
      message: "Got header Bearer abcDEF._~+/=- and Basic Zm9vOmJhcg==",
    } as unknown as ErrorEvent);
    expect(out.message).toContain(`Bearer ${REDACTED}`);
    expect(out.message).toContain(`Basic ${REDACTED}`);
  });

  it("redacts non-JWT-shaped accessToken/refreshToken/id_token values in free text", () => {
    const out = run({
      message:
        "refreshToken=opaqueBase64NotAJwt-xyz and accessToken: anotherOpaqueValue and id_token=short",
    } as unknown as ErrorEvent);
    expect(out.message).toContain(`refreshToken=${REDACTED}`);
    expect(out.message).toContain(`accessToken:${REDACTED}`);
    expect(out.message).toContain(`id_token=${REDACTED}`);
    expect(out.message).not.toContain("opaqueBase64NotAJwt-xyz");
    expect(out.message).not.toContain("anotherOpaqueValue");
    expect(out.message).not.toContain("=short");
  });

  it("redacts bare JWT triplets", () => {
    const jwt = "eyJhbGciOi12345.eyJzdWIiOi67890.sig_abcdef1234";
    const out = run({ message: `token was ${jwt} yeah` } as unknown as ErrorEvent);
    expect(out.message).not.toContain(jwt);
    expect(out.message).toContain(REDACTED);
  });
});

describe("scrubQueryString — parse + fallback", () => {
  it("parses well-formed query strings with a leading ? and redacts sensitive keys", () => {
    const out = run({
      request: {
        query_string: "?foo=bar&token=leak&password=pw&keep=me",
      },
    } as unknown as ErrorEvent);
    const qs = out.request!.query_string as string;
    expect(qs.startsWith("?")).toBe(true);
    expect(qs).toContain("foo=bar");
    expect(qs).toContain(`token=${REDACTED}`);
    expect(qs).toContain(`password=${REDACTED}`);
    expect(qs).toContain("keep=me");
  });

  it("parses no-leading-? strings as well", () => {
    const out = run({
      request: { query_string: "token=leak&keep=1" },
    } as unknown as ErrorEvent);
    const qs = out.request!.query_string as string;
    expect(qs.startsWith("?")).toBe(false);
    expect(qs).toContain(`token=${REDACTED}`);
    expect(qs).toContain("keep=1");
  });

  it("leaves non-string query_string alone", () => {
    const out = run({
      request: { query_string: undefined },
    } as unknown as ErrorEvent);
    expect(out.request!.query_string).toBeUndefined();
  });
});

describe("event-level walk — exception.values, message, breadcrumbs, user, extra, contexts, request.data", () => {
  it("scrubs exception.values[].value strings", () => {
    const out = run({
      exception: {
        values: [
          { type: "Error", value: "password=sekret failed" },
          { type: "Error", value: "clean" },
        ],
      },
    } as unknown as ErrorEvent);
    expect(out.exception!.values![0].value).toContain(`password=${REDACTED}`);
    expect(out.exception!.values![0].value).not.toContain("sekret");
    expect(out.exception!.values![1].value).toBe("clean");
  });

  it("scrubs event.message", () => {
    const out = run({ message: "Bearer leaked.jwt.token" } as unknown as ErrorEvent);
    expect(out.message).toContain(`Bearer ${REDACTED}`);
  });

  it("scrubs breadcrumbs.message (string) and breadcrumbs.data (structured)", () => {
    const out = run({
      breadcrumbs: [
        {
          category: "fetch",
          message: "GET /api?token=abc",
          data: { url: "/api", password: "leak" },
        },
      ],
    } as unknown as ErrorEvent);
    const bc = out.breadcrumbs![0];
    expect(bc.message).toContain(`token=${REDACTED}`);
    expect((bc.data as Record<string, unknown>).password).toBe(REDACTED);
    expect((bc.data as Record<string, unknown>).url).toBe("/api");
  });

  it("scrubs event.user fields", () => {
    const out = run({
      user: { id: "u1", email: "a@b.c", token: "bad", IdToken: "cognito" },
    } as unknown as ErrorEvent);
    const user = out.user as Record<string, unknown>;
    expect(user.id).toBe("u1");
    expect(user.email).toBe("a@b.c");
    expect(user.token).toBe(REDACTED);
    expect(user.IdToken).toBe(REDACTED);
  });

  it("scrubs event.extra", () => {
    const out = run({ extra: { password: "x", safe: "y" } } as unknown as ErrorEvent);
    expect((out.extra as Record<string, unknown>).password).toBe(REDACTED);
    expect((out.extra as Record<string, unknown>).safe).toBe("y");
  });

  it("scrubs event.contexts", () => {
    const out = run({
      contexts: {
        auth: { token: "x", scheme: "bearer" },
        runtime: { name: "node", version: "22" },
      },
    } as unknown as ErrorEvent);
    const auth = (out.contexts as any).auth;
    const runtime = (out.contexts as any).runtime;
    expect(auth.token).toBe(REDACTED);
    expect(auth.scheme).toBe("bearer");
    expect(runtime.name).toBe("node");
  });

  it("scrubs structured request body via request.data", () => {
    const out = run({
      request: { data: { username: "u", password: "pw", nested: { token: "t" } } },
    } as unknown as ErrorEvent);
    const data = out.request!.data as Record<string, any>;
    expect(data.username).toBe("u");
    expect(data.password).toBe(REDACTED);
    expect(data.nested.token).toBe(REDACTED);
  });
});

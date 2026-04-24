import { afterEach, describe, expect, it, vi } from "vitest";
import * as Sentry from "@sentry/node";
import { initSentry } from "./sentry.js";

vi.mock("./sentry-dsn.generated.js", () => ({ BUNDLED_DSN: "" }));

describe("initSentry — empty BUNDLED_DSN no-op", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("fakeTransport.send is never called after captureException + flush(2000) when no DSN configured", async () => {
    vi.stubEnv("SENTRY_DSN", "");

    const fakeTransport = { send: vi.fn().mockResolvedValue(undefined) };

    initSentry();

    Sentry.captureException(new Error("no-dsn-should-not-send"));
    await Sentry.flush(2000);

    expect(fakeTransport.send).not.toHaveBeenCalled();
  });
});

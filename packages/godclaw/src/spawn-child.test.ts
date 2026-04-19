import { describe, it, expect } from "vitest";
import { buildChildEnv } from "./spawn-child.js";
import type { GodclawChildCredentials } from "./vend-child-credentials.js";

const CREDS: GodclawChildCredentials = {
  accessKeyId: "AKIACHILD",
  secretAccessKey: "child-secret",
  sessionToken: "child-session",
  sessionName: "prs_01HVP--task--01HVT",
  expiresAt: "2026-04-15T06:00:00Z",
  taskId: "01HVT",
  companyUid: "cmp_01HVC",
};

describe("buildChildEnv", () => {
  it("injects AWS creds + HQ identifiers", () => {
    const env = buildChildEnv(CREDS, {}, []);
    expect(env.AWS_ACCESS_KEY_ID).toBe("AKIACHILD");
    expect(env.AWS_SECRET_ACCESS_KEY).toBe("child-secret");
    expect(env.AWS_SESSION_TOKEN).toBe("child-session");
    expect(env.HQ_TASK_ID).toBe("01HVT");
    expect(env.HQ_COMPANY_UID).toBe("cmp_01HVC");
    expect(env.HQ_SESSION_NAME).toBe("prs_01HVP--task--01HVT");
  });

  it("inherits only allowlisted keys from parent env", () => {
    const parentEnv = {
      PATH: "/usr/bin",
      HOME: "/home/stefan",
      SECRET_SAUCE: "do-not-leak",
      NODE_OPTIONS: "--max-old-space-size=4096",
    };
    const env = buildChildEnv(CREDS, parentEnv, ["PATH", "HOME", "NODE_OPTIONS"]);
    expect(env.PATH).toBe("/usr/bin");
    expect(env.HOME).toBe("/home/stefan");
    expect(env.NODE_OPTIONS).toBe("--max-old-space-size=4096");
    expect(env.SECRET_SAUCE).toBeUndefined();
  });

  it("strips parent AWS_* env even if the inherit list tries to include it", () => {
    const parentEnv = {
      PATH: "/usr/bin",
      AWS_ACCESS_KEY_ID: "LONG_LIVED_PARENT_KEY",
      AWS_SECRET_ACCESS_KEY: "PARENT_SECRET",
      AWS_PROFILE: "parent-profile",
    };
    // Even if caller foolishly adds AWS_* to the inherit list, vended creds win.
    const env = buildChildEnv(CREDS, parentEnv, [
      "PATH",
      "AWS_ACCESS_KEY_ID",
      "AWS_SECRET_ACCESS_KEY",
      "AWS_PROFILE",
    ]);
    expect(env.AWS_ACCESS_KEY_ID).toBe("AKIACHILD"); // vended, not parent
    expect(env.AWS_SECRET_ACCESS_KEY).toBe("child-secret");
    expect(env.AWS_PROFILE).toBeUndefined(); // stripped, no vended equivalent
  });

  it("strips AWS_SHARED_CREDENTIALS_FILE and AWS_CONFIG_FILE", () => {
    const parentEnv = {
      PATH: "/usr/bin",
      AWS_SHARED_CREDENTIALS_FILE: "/home/stefan/.aws/credentials",
      AWS_CONFIG_FILE: "/home/stefan/.aws/config",
    };
    const env = buildChildEnv(CREDS, parentEnv, [
      "PATH",
      "AWS_SHARED_CREDENTIALS_FILE",
      "AWS_CONFIG_FILE",
    ]);
    expect(env.AWS_SHARED_CREDENTIALS_FILE).toBeUndefined();
    expect(env.AWS_CONFIG_FILE).toBeUndefined();
  });

  it("layers extraEnv on top of credentials", () => {
    const env = buildChildEnv(CREDS, {}, [], {
      LOG_LEVEL: "debug",
      FEATURE_FOO: "on",
    });
    expect(env.LOG_LEVEL).toBe("debug");
    expect(env.FEATURE_FOO).toBe("on");
    // credentials still present
    expect(env.AWS_ACCESS_KEY_ID).toBe("AKIACHILD");
  });

  it("throws if extraEnv tries to override an AWS credential key", () => {
    expect(() =>
      buildChildEnv(CREDS, {}, [], {
        AWS_ACCESS_KEY_ID: "attempted-override",
      }),
    ).toThrow(/may not override AWS credential keys/);
  });

  it("produces a clean env when inheritKeys is empty and extraEnv is empty", () => {
    const env = buildChildEnv(CREDS, { PATH: "/usr/bin", HOME: "/tmp" }, []);
    // Only the vended creds + task identifiers should be present.
    const keys = Object.keys(env).sort();
    expect(keys).toEqual(
      [
        "AWS_ACCESS_KEY_ID",
        "AWS_SECRET_ACCESS_KEY",
        "AWS_SESSION_TOKEN",
        "HQ_COMPANY_UID",
        "HQ_SESSION_NAME",
        "HQ_TASK_ID",
      ].sort(),
    );
  });
});

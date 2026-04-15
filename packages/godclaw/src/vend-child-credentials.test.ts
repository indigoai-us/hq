import { describe, it, expect, vi } from "vitest";
import type { VaultClient, VendChildInput, VendChildResult } from "@indigoai-us/hq-cloud";
import { vendChildCredentials } from "./vend-child-credentials.js";

function mockVaultClient(result: VendChildResult) {
  const vendChild = vi.fn(async (_input: VendChildInput) => result);
  return {
    client: { sts: { vendChild } } as unknown as VaultClient,
    vendChild,
  };
}

const OK_RESULT: VendChildResult = {
  credentials: {
    accessKeyId: "AKIATEST",
    secretAccessKey: "secret",
    sessionToken: "session",
  },
  sessionName: "prs_01HV123--task--01HVTASK",
  expiresAt: "2026-04-15T06:00:00Z",
};

describe("vendChildCredentials", () => {
  it("calls vault client and echoes taskId + companyUid in result", async () => {
    const { client, vendChild } = mockVaultClient(OK_RESULT);
    const result = await vendChildCredentials(client, {
      companyUid: "cmp_01HVX",
      taskId: "01HVTASK",
      taskDescription: "sync drafts to s3",
      taskScope: { allowedPrefixes: ["drafts/"] },
    });

    expect(vendChild).toHaveBeenCalledOnce();
    expect(vendChild).toHaveBeenCalledWith({
      companyUid: "cmp_01HVX",
      taskId: "01HVTASK",
      taskDescription: "sync drafts to s3",
      taskScope: { allowedPrefixes: ["drafts/"] },
    });
    expect(result).toEqual({
      accessKeyId: "AKIATEST",
      secretAccessKey: "secret",
      sessionToken: "session",
      sessionName: "prs_01HV123--task--01HVTASK",
      expiresAt: "2026-04-15T06:00:00Z",
      taskId: "01HVTASK",
      companyUid: "cmp_01HVX",
    });
  });

  it("passes durationSeconds when provided", async () => {
    const { client, vendChild } = mockVaultClient(OK_RESULT);
    await vendChildCredentials(client, {
      companyUid: "cmp_X",
      taskId: "T1",
      taskDescription: "short task",
      taskScope: { allowedPrefixes: ["drafts/"] },
      durationSeconds: 1800,
    });

    expect(vendChild).toHaveBeenCalledWith(
      expect.objectContaining({ durationSeconds: 1800 }),
    );
  });

  it("omits durationSeconds when not provided (server default)", async () => {
    const { client, vendChild } = mockVaultClient(OK_RESULT);
    await vendChildCredentials(client, {
      companyUid: "cmp_X",
      taskId: "T1",
      taskDescription: "default duration task",
      taskScope: { allowedPrefixes: ["drafts/"] },
    });

    const call = vendChild.mock.calls[0]?.[0];
    expect(call).toBeDefined();
    expect(call).not.toHaveProperty("durationSeconds");
  });

  it("passes allowedActions through when specified (read-only child)", async () => {
    const { client, vendChild } = mockVaultClient(OK_RESULT);
    await vendChildCredentials(client, {
      companyUid: "cmp_X",
      taskId: "T1",
      taskDescription: "read-only task",
      taskScope: { allowedPrefixes: ["drafts/"], allowedActions: ["read"] },
    });

    expect(vendChild).toHaveBeenCalledWith(
      expect.objectContaining({
        taskScope: { allowedPrefixes: ["drafts/"], allowedActions: ["read"] },
      }),
    );
  });

  it("throws when taskId is empty", async () => {
    const { client } = mockVaultClient(OK_RESULT);
    await expect(
      vendChildCredentials(client, {
        companyUid: "cmp_X",
        taskId: "",
        taskDescription: "no task id",
        taskScope: { allowedPrefixes: ["drafts/"] },
      }),
    ).rejects.toThrow(/taskId is required/);
  });

  it("throws when taskDescription is 256+ chars", async () => {
    const { client } = mockVaultClient(OK_RESULT);
    await expect(
      vendChildCredentials(client, {
        companyUid: "cmp_X",
        taskId: "T1",
        taskDescription: "x".repeat(256),
        taskScope: { allowedPrefixes: ["drafts/"] },
      }),
    ).rejects.toThrow(/taskDescription must be <256 chars/);
  });

  it("throws when allowedPrefixes is empty", async () => {
    const { client } = mockVaultClient(OK_RESULT);
    await expect(
      vendChildCredentials(client, {
        companyUid: "cmp_X",
        taskId: "T1",
        taskDescription: "empty prefixes",
        taskScope: { allowedPrefixes: [] },
      }),
    ).rejects.toThrow(/allowedPrefixes must not be empty/);
  });

  it("propagates vault client errors (e.g. ScopeExceedsParentError wrapped as 403)", async () => {
    const client = {
      sts: {
        vendChild: vi.fn(async () => {
          const err = new Error("Permission denied — scope exceeds parent membership");
          throw err;
        }),
      },
    } as unknown as VaultClient;

    await expect(
      vendChildCredentials(client, {
        companyUid: "cmp_X",
        taskId: "T1",
        taskDescription: "escalation attempt",
        taskScope: { allowedPrefixes: ["secrets/"] },
      }),
    ).rejects.toThrow(/scope exceeds parent membership/);
  });
});

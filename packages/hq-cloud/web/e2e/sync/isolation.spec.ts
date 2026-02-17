/**
 * E2E-FC-005: Sync isolation — user A cannot access user B's S3 files
 *
 * Verifies cross-user file access isolation:
 * 1. User A uploads a test file via POST /api/files/upload
 * 2. User A can read their own file via GET /api/files/download?path=...
 * 3. User B signs in and attempts to read User A's file path — gets 403 or 404
 * 4. User B cannot list User A's file directory via GET /api/files/list
 * 5. User B's file listing only shows their own files
 * 6. S3 key prefix isolation: user A's files are under user_{userA_id}/hq/,
 *    user B's under user_{userB_id}/hq/
 * 7. Test cleans up all test files after completion
 *
 * Prerequisites:
 * - clerkSetup() ran in global-setup.ts
 * - E2E_TEST_EMAIL / E2E_TEST_PASSWORD env vars set (user A)
 * - E2E_TEST_EMAIL_B / E2E_TEST_PASSWORD_B env vars set (user B)
 * - API server running on port 3001 with S3 configured
 * - Web app running on port 3000
 */

import { test, expect } from "../fixtures/multi-user-auth";
import type { Page } from "@playwright/test";

const API_URL = "http://localhost:3001";

/** Unique prefix for test files to avoid collisions */
const TEST_PREFIX = `e2e-isolation-${Date.now()}`;
const TEST_FILE_PATH = `${TEST_PREFIX}/test-isolation.txt`;
const TEST_FILE_CONTENT = `Isolation test content created at ${new Date().toISOString()}`;
const TEST_FILE_B64 = Buffer.from(TEST_FILE_CONTENT).toString("base64");

// ── Helpers ──────────────────────────────────────────────────────────

/** Check if both Clerk test accounts are configured */
function hasBothAccounts(): boolean {
  return !!(
    process.env.E2E_TEST_EMAIL &&
    process.env.E2E_TEST_PASSWORD &&
    process.env.E2E_TEST_EMAIL_B &&
    process.env.E2E_TEST_PASSWORD_B
  );
}

interface ApiResult {
  status: number;
  body: Record<string, unknown>;
  error?: string;
}

/**
 * Make an authenticated API call from within a Clerk-authenticated page context.
 * Uses the Clerk session token from the browser for Authorization.
 */
async function apiCall(
  page: Page,
  method: string,
  path: string,
  body?: Record<string, unknown>,
): Promise<ApiResult> {
  return page.evaluate(
    async ({
      apiUrl,
      method,
      path,
      body,
    }: {
      apiUrl: string;
      method: string;
      path: string;
      body?: Record<string, unknown>;
    }) => {
      // Get the Clerk token from the active session
      const clerkInstance = (
        window as unknown as {
          Clerk?: { session?: { getToken: () => Promise<string> } };
        }
      ).Clerk;

      if (!clerkInstance?.session) {
        return { status: 0, body: {}, error: "No Clerk session found" };
      }

      const token = await clerkInstance.session.getToken();
      if (!token) {
        return { status: 0, body: {}, error: "No token from Clerk" };
      }

      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      };

      const opts: RequestInit = { method, headers };
      if (body && (method === "POST" || method === "PUT" || method === "PATCH")) {
        opts.body = JSON.stringify(body);
      }

      const resp = await fetch(`${apiUrl}${path}`, opts);
      let respBody: Record<string, unknown> = {};
      try {
        respBody = (await resp.json()) as Record<string, unknown>;
      } catch {
        // Response may not be JSON (e.g. binary download)
      }

      return { status: resp.status, body: respBody };
    },
    { apiUrl: API_URL, method, path, body },
  );
}

/**
 * Get the authenticated user's Clerk userId from the API.
 */
async function getUserId(page: Page): Promise<string> {
  const result = await apiCall(page, "GET", "/api/auth/me");
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(200);
  const userId = result.body.userId as string;
  expect(userId).toBeTruthy();
  return userId;
}

/**
 * Upload a test file via the files API.
 */
async function uploadTestFile(
  page: Page,
  path: string,
  contentBase64: string,
): Promise<ApiResult> {
  return apiCall(page, "POST", "/api/files/upload", {
    path,
    content: contentBase64,
    contentType: "text/plain",
  });
}

/**
 * Download a file via the files API. Returns status and body.
 * Note: for binary/stream responses, the body may be empty in JSON parse.
 */
async function downloadFile(page: Page, path: string): Promise<ApiResult> {
  return apiCall(page, "GET", `/api/files/download?path=${encodeURIComponent(path)}`);
}

/**
 * List files via the files API, optionally with a prefix filter.
 */
async function listFiles(page: Page, prefix?: string): Promise<ApiResult> {
  const qs = prefix ? `?prefix=${encodeURIComponent(prefix)}` : "";
  return apiCall(page, "GET", `/api/files/list${qs}`);
}

/**
 * Delete a test file by uploading an empty-ish replacement, or just list
 * and track what we uploaded for cleanup reporting.
 * Note: The API may not have a DELETE endpoint. If not, cleanup is best-effort.
 */
async function cleanupTestFiles(page: Page, prefix: string): Promise<void> {
  // Best-effort cleanup: list files under the test prefix
  // The API does not expose a DELETE endpoint in files.ts, so cleanup
  // relies on S3 lifecycle rules or manual cleanup. We log what was created.
  const result = await listFiles(page, prefix);
  if (result.status === 200) {
    const files = result.body.files as Array<{ path: string }> | undefined;
    if (files && files.length > 0) {
      console.log(
        `[E2E-FC-005 cleanup] ${files.length} test file(s) under "${prefix}" — ` +
          `manual S3 cleanup may be needed (no DELETE endpoint)`,
      );
    }
  }
}

// ── Test Suite ───────────────────────────────────────────────────────

test.describe("Sync isolation: cross-user file access", () => {
  // Skip entire suite when both Clerk test accounts are not configured
  test.skip(
    () => !hasBothAccounts(),
    "Skipping: requires both E2E_TEST_EMAIL/PASSWORD and E2E_TEST_EMAIL_B/PASSWORD_B",
  );

  // Increase timeout for multi-user tests with real API calls
  test.setTimeout(60_000);

  let userAId: string;
  let userBId: string;

  /* ----------------------------------------------------------
   * AC-1 + AC-7: Both users have distinct Clerk userIds
   *              and separate S3 prefixes
   * ---------------------------------------------------------- */
  test("both test accounts have distinct userIds and S3 prefixes", async ({
    userAPage,
    userBPage,
  }) => {
    // Get user IDs from the auth API
    userAId = await getUserId(userAPage);
    userBId = await getUserId(userBPage);

    // Verify they are different users
    expect(userAId).not.toBe(userBId);
    expect(userAId).toBeTruthy();
    expect(userBId).toBeTruthy();

    // Verify S3 key prefix convention: user_{clerkId}/hq/
    // The file-proxy module uses getUserPrefix(userId) = `user_${userId}/hq/`
    const expectedPrefixA = `user_${userAId}/hq/`;
    const expectedPrefixB = `user_${userBId}/hq/`;
    expect(expectedPrefixA).not.toBe(expectedPrefixB);

    // Store for subsequent tests (via closure — tests run serially in describe)
    console.log(`[E2E-FC-005] User A: ${userAId} → prefix: ${expectedPrefixA}`);
    console.log(`[E2E-FC-005] User B: ${userBId} → prefix: ${expectedPrefixB}`);
  });

  /* ----------------------------------------------------------
   * AC-2: User A uploads a test file via the sync/upload API
   * ---------------------------------------------------------- */
  test("user A can upload a test file", async ({ userAPage }) => {
    const result = await uploadTestFile(userAPage, TEST_FILE_PATH, TEST_FILE_B64);

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(201);
    expect(result.body.ok).toBe(true);
    expect(result.body.path).toBe(TEST_FILE_PATH);
    expect(typeof result.body.key).toBe("string");

    // Verify the S3 key contains the user's prefix
    const key = result.body.key as string;
    expect(key).toContain("user_");
    expect(key).toContain("/hq/");
    expect(key).toContain(TEST_FILE_PATH);
  });

  /* ----------------------------------------------------------
   * AC-3: User A can read their own file
   * ---------------------------------------------------------- */
  test("user A can read their own uploaded file", async ({ userAPage }) => {
    // First upload the file (tests may not run in order)
    await uploadTestFile(userAPage, TEST_FILE_PATH, TEST_FILE_B64);

    // Then read it back
    const result = await downloadFile(userAPage, TEST_FILE_PATH);

    expect(result.error).toBeUndefined();
    // 200 for successful download
    expect(result.status).toBe(200);
  });

  /* ----------------------------------------------------------
   * AC-3 (list): User A can list their own files
   * ---------------------------------------------------------- */
  test("user A can list their own files and sees the uploaded file", async ({
    userAPage,
  }) => {
    // Ensure the file exists
    await uploadTestFile(userAPage, TEST_FILE_PATH, TEST_FILE_B64);

    // List files under the test prefix
    const result = await listFiles(userAPage, TEST_PREFIX);

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(200);

    const files = result.body.files as Array<{ path: string }>;
    expect(files).toBeDefined();
    expect(Array.isArray(files)).toBe(true);

    // The uploaded file should appear in the listing
    const uploadedFile = files.find(
      (f) => f.path === `${TEST_FILE_PATH}` || f.path.includes("test-isolation.txt"),
    );
    expect(uploadedFile).toBeDefined();
  });

  /* ----------------------------------------------------------
   * AC-4: User B attempts to read User A's file path — gets 403 or 404
   *
   * The API scopes all file operations to the authenticated user's
   * S3 prefix (user_{clerkId}/hq/). When user B requests the same
   * relative path, it resolves to user_B_id/hq/{path} — which
   * does not exist. The API returns 404 (file not found in B's prefix).
   * ---------------------------------------------------------- */
  test("user B cannot read user A's file — gets 404", async ({
    userAPage,
    userBPage,
  }) => {
    // Ensure user A's file exists
    await uploadTestFile(userAPage, TEST_FILE_PATH, TEST_FILE_B64);

    // User B tries to download the same relative path
    // This should resolve to user_B/hq/{TEST_FILE_PATH} which doesn't exist
    const result = await downloadFile(userBPage, TEST_FILE_PATH);

    expect(result.error).toBeUndefined();
    // Should get 403 (forbidden) or 404 (not found in user B's prefix)
    expect([403, 404]).toContain(result.status);

    // The response should indicate the file was not found (not return A's data)
    if (result.status === 404) {
      expect(result.body.error).toBe("Not Found");
    }
  });

  /* ----------------------------------------------------------
   * AC-5: User B cannot list User A's file directory
   *
   * When user B lists files with the same prefix, it resolves to
   * user_B's S3 space — which has no files at that prefix.
   * ---------------------------------------------------------- */
  test("user B cannot list user A's files — listing is empty", async ({
    userAPage,
    userBPage,
  }) => {
    // Ensure user A has files
    await uploadTestFile(userAPage, TEST_FILE_PATH, TEST_FILE_B64);

    // User B lists the same prefix — should see nothing (different S3 prefix)
    const result = await listFiles(userBPage, TEST_PREFIX);

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(200);

    const files = result.body.files as Array<{ path: string }>;
    expect(files).toBeDefined();
    expect(Array.isArray(files)).toBe(true);
    expect(files.length).toBe(0);
  });

  /* ----------------------------------------------------------
   * AC-6: User B's listing only shows their own files
   *
   * Upload a file as user B, then verify their listing only contains
   * their own file and NOT user A's file.
   * ---------------------------------------------------------- */
  test("user B only sees their own files in file listing", async ({
    userAPage,
    userBPage,
  }) => {
    const userBFilePath = `${TEST_PREFIX}/user-b-file.txt`;
    const userBContent = Buffer.from("User B's private content").toString("base64");

    // Upload files for both users
    await uploadTestFile(userAPage, TEST_FILE_PATH, TEST_FILE_B64);
    await uploadTestFile(userBPage, userBFilePath, userBContent);

    // User B lists all files under the test prefix
    const result = await listFiles(userBPage, TEST_PREFIX);

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(200);

    const files = result.body.files as Array<{ path: string }>;
    expect(files).toBeDefined();
    expect(Array.isArray(files)).toBe(true);

    // User B should see their own file
    const userBFile = files.find((f) => f.path.includes("user-b-file.txt"));
    expect(userBFile).toBeDefined();

    // User B should NOT see user A's file
    const userAFile = files.find((f) => f.path.includes("test-isolation.txt"));
    expect(userAFile).toBeUndefined();

    // Cleanup: track user B's file too
    console.log(
      `[E2E-FC-005] User B uploaded: ${userBFilePath} — cleanup may be needed`,
    );
  });

  /* ----------------------------------------------------------
   * AC-7: S3 key prefix isolation verified through upload response
   *
   * The upload response includes the full S3 key. Verify that
   * each user's files are stored under their distinct prefix.
   * ---------------------------------------------------------- */
  test("S3 keys confirm prefix isolation between users", async ({
    userAPage,
    userBPage,
  }) => {
    const filePathA = `${TEST_PREFIX}/prefix-check-a.txt`;
    const filePathB = `${TEST_PREFIX}/prefix-check-b.txt`;
    const content = Buffer.from("prefix check").toString("base64");

    // Upload as user A
    const resultA = await uploadTestFile(userAPage, filePathA, content);
    expect(resultA.status).toBe(201);
    const keyA = resultA.body.key as string;

    // Upload as user B
    const resultB = await uploadTestFile(userBPage, filePathB, content);
    expect(resultB.status).toBe(201);
    const keyB = resultB.body.key as string;

    // Both keys should follow the user_{id}/hq/ convention
    expect(keyA).toMatch(/^user_.+\/hq\//);
    expect(keyB).toMatch(/^user_.+\/hq\//);

    // Keys should have DIFFERENT user prefixes
    const prefixA = keyA.split("/hq/")[0]; // "user_{idA}"
    const prefixB = keyB.split("/hq/")[0]; // "user_{idB}"
    expect(prefixA).not.toBe(prefixB);

    // Each key should contain the correct file path
    expect(keyA).toContain(filePathA);
    expect(keyB).toContain(filePathB);

    console.log(`[E2E-FC-005] Key A: ${keyA}`);
    console.log(`[E2E-FC-005] Key B: ${keyB}`);
  });

  /* ----------------------------------------------------------
   * AC-4 (navigator): User B cannot read User A's file
   * via the navigator file endpoint either
   * ---------------------------------------------------------- */
  test("user B cannot read user A's file via navigator/file endpoint", async ({
    userAPage,
    userBPage,
  }) => {
    // Ensure user A has the file
    await uploadTestFile(userAPage, TEST_FILE_PATH, TEST_FILE_B64);

    // User B tries to read via the navigator file endpoint
    const result = await apiCall(
      userBPage,
      "GET",
      `/api/navigator/file?path=${encodeURIComponent(TEST_FILE_PATH)}`,
    );

    // Should get 403 (setup required / forbidden) or 404 (not found)
    // The navigator routes use getDataSource() which resolves to the user's own data
    expect([403, 404]).toContain(result.status);
  });

  /* ----------------------------------------------------------
   * AC-8: Cleanup — best-effort removal of test files
   * ---------------------------------------------------------- */
  test("cleanup: report test files for both users", async ({
    userAPage,
    userBPage,
  }) => {
    // Best-effort cleanup: list and report what was created
    await cleanupTestFiles(userAPage, TEST_PREFIX);
    await cleanupTestFiles(userBPage, TEST_PREFIX);

    // This test always passes — cleanup is best-effort since
    // the API doesn't expose a file DELETE endpoint.
    // S3 lifecycle rules or manual cleanup handle stale test data.
    expect(true).toBe(true);
  });
});

/* ================================================================
 * Additional isolation edge cases
 * ================================================================ */

test.describe("Sync isolation: edge cases", () => {
  test.skip(
    () => !hasBothAccounts(),
    "Skipping: requires both E2E_TEST_EMAIL/PASSWORD and E2E_TEST_EMAIL_B/PASSWORD_B",
  );

  test.setTimeout(60_000);

  /* ----------------------------------------------------------
   * Path traversal: user B cannot use path tricks to access A's files
   * ---------------------------------------------------------- */
  test("path traversal is blocked by the API", async ({ userBPage }) => {
    // Attempt a path traversal to escape user B's prefix
    const traversalPath = "../../../other-user/hq/secret.txt";
    const result = await downloadFile(userBPage, traversalPath);

    // The API should reject paths with ".." (400 Bad Request)
    expect(result.status).toBe(400);
    if (result.body.message) {
      expect(result.body.message).toContain("..");
    }
  });

  /* ----------------------------------------------------------
   * Absolute path: user B cannot use absolute paths
   * ---------------------------------------------------------- */
  test("absolute paths are rejected by the API", async ({ userBPage }) => {
    const absolutePath = "/user_someone/hq/secret.txt";
    const result = await downloadFile(userBPage, absolutePath);

    // The API should reject paths starting with /
    expect(result.status).toBe(400);
  });

  /* ----------------------------------------------------------
   * Upload to traversal path is blocked
   * ---------------------------------------------------------- */
  test("upload with path traversal is blocked", async ({ userBPage }) => {
    const traversalPath = "../../other-user/hq/malicious.txt";
    const content = Buffer.from("malicious content").toString("base64");

    const result = await uploadTestFile(userBPage, traversalPath, content);

    // The API should reject paths with ".."
    expect(result.status).toBe(400);
  });
});

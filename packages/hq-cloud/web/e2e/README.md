# HQ Cloud E2E Tests

End-to-end tests for the HQ Cloud web application using Playwright and real Clerk authentication.

## Test Types

### Mock-based E2E tests (existing)
Tests that use `page.route()` to mock API responses. Fast, no real backend needed.

```bash
npx playwright test e2e/agents.spec.ts
npx playwright test e2e/session-lifecycle.spec.ts
```

### Clerk-authenticated smoke tests (E2E-001)
Tests that sign in via real Clerk auth (no mocks) and verify the app loads.

```bash
npx playwright test e2e/smoke.spec.ts
```

### Live ECS session launch (E2E-002)
Tests that sign in via Clerk, create a real session through the UI, and wait for an
actual ECS Fargate container to spin up and become active. Requires ngrok tunnel,
ECS env vars configured on the API, and AWS credentials. See the test file header
for full prerequisites.

```bash
npx playwright test e2e/session-launch.spec.ts
```

### Multi-user isolation tests (E2E-FC-005)
Tests that use two independent Clerk accounts to verify cross-user data isolation
(e.g., user A cannot see user B's S3 files). See [Multi-account setup](#multi-account-setup-two-clerk-test-users) below.

```bash
npx playwright test e2e/sync/isolation.spec.ts
```

### Integration tests (separate config)
Tests that hit the real API server with a mock container.

```bash
npx playwright test --config=playwright.integration.config.ts
```

## Prerequisites for Clerk-authenticated tests

### 1. Clerk keys in `.env.local`
The web app needs Clerk keys to boot:
```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
```

### 2. Test account credentials
Set as environment variables before running tests:
```bash
export E2E_TEST_EMAIL="your-test-account@example.com"
export E2E_TEST_PASSWORD="your-test-password"
```

Or create a `.env.e2e` file (not committed with secrets):
```
E2E_TEST_EMAIL=your-test-account@example.com
E2E_TEST_PASSWORD=your-test-password
```

The test account must exist in the Clerk dev instance with email+password auth enabled.

### 3. API server
The API must be running on port 3001. The Playwright config starts it automatically, or run manually:
```bash
cd ../api && pnpm dev
```

## Multi-account setup (two Clerk test users)

Multi-user isolation tests require **two separate Clerk accounts** (user A and user B)
with distinct Clerk `userId` values. This ensures each user gets a unique S3 key prefix,
enabling the tests to verify that one user cannot access another user's files.

### Why two accounts?

Cross-user isolation is a critical security property. The API enforces that file
paths in S3 are scoped to `{userId}/hq/...`. By signing in as two different users,
the E2E tests can prove that the isolation boundary holds end-to-end.

### Step-by-step setup

1. **Create user A** (if not already done):
   - Go to [Clerk Dashboard](https://dashboard.clerk.com/) > your dev instance > Users > Create User
   - Email: `e2e-test-user-a@getindigo.ai` (or any email you control)
   - Set a password (e.g., a strong random password)
   - Note the email and password for `E2E_TEST_EMAIL` / `E2E_TEST_PASSWORD`

2. **Create user B**:
   - Same Clerk Dashboard > Users > Create User
   - Email: `e2e-test-user-b@getindigo.ai` (must be different from user A)
   - Set a password (different from user A recommended)
   - Note the email and password for `E2E_TEST_EMAIL_B` / `E2E_TEST_PASSWORD_B`

3. **Verify distinct userIds**:
   - In Clerk Dashboard, click each user and note their `User ID` (starts with `user_`)
   - The two users **must** have different IDs (they will, since they are separate accounts)

4. **Configure env vars**:
   Copy the example file and fill in credentials:
   ```bash
   cp .env.e2e.example .env.e2e
   ```

   Or export directly:
   ```bash
   # User A (primary)
   export E2E_TEST_EMAIL="e2e-test-user-a@getindigo.ai"
   export E2E_TEST_PASSWORD="your-password-a"

   # User B (secondary)
   export E2E_TEST_EMAIL_B="e2e-test-user-b@getindigo.ai"
   export E2E_TEST_PASSWORD_B="your-password-b"
   ```

5. **For CI (GitHub Actions)**:
   Add these as repository secrets:
   - `E2E_TEST_EMAIL` / `E2E_TEST_PASSWORD` (user A)
   - `E2E_TEST_EMAIL_B` / `E2E_TEST_PASSWORD_B` (user B)

### Env var reference

| Variable | Required for | Description |
|----------|-------------|-------------|
| `E2E_TEST_EMAIL` | All Clerk auth tests | User A email (primary test account) |
| `E2E_TEST_PASSWORD` | All Clerk auth tests | User A password |
| `E2E_TEST_EMAIL_B` | Multi-user tests only | User B email (secondary test account) |
| `E2E_TEST_PASSWORD_B` | Multi-user tests only | User B password |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | All Clerk tests | Clerk publishable key (in `.env.local`) |
| `CLERK_SECRET_KEY` | All Clerk tests | Clerk secret key (in `.env.local`) |

### Fixtures for multi-user tests

There are two ways to use multi-user auth in tests:

**Option 1: `clerk-auth.ts` fixtures** (same browser context)

For tests that need user A or user B but not simultaneously:

```typescript
import { test, expect } from "./fixtures/clerk-auth";

test("user A test", async ({ clerkPage }) => { /* signed in as user A */ });
test("user B test", async ({ clerkPageB }) => { /* signed in as user B */ });
```

**Option 2: `multi-user-auth.ts` fixtures** (isolated browser contexts)

For tests that need both users active at the same time in separate contexts:

```typescript
import { test, expect } from "./fixtures/multi-user-auth";

test("isolation test", async ({ userAPage, userBPage }) => {
  // userAPage and userBPage run in separate browser contexts
  // with independent cookies, localStorage, and Clerk sessions
  await userAPage.goto("/navigator");
  await userBPage.goto("/navigator");
  // Assert that userB cannot see userA's files
});
```

**Option 3: `createClerkAuth()` factory** (maximum flexibility)

For advanced scenarios (e.g., more than two users):

```typescript
import { createClerkAuth } from "./fixtures/multi-user-auth";

test("custom auth", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await createClerkAuth({
    page,
    email: process.env.CUSTOM_EMAIL!,
    password: process.env.CUSTOM_PASSWORD!,
  });
  // page is now signed in
});
```

## ngrok Tunnel for ECS Container Tests

For E2E tests that launch real ECS containers (E2E-002+), the container must reach
the local API server. Since ECS containers run on AWS, they need a public URL to
connect back via WebSocket.

### Setup

1. Install ngrok: https://ngrok.com/download

2. Start the tunnel (before running tests):
   ```bash
   ngrok http 3001
   ```

3. Copy the `Forwarding` URL (e.g., `https://abc123.ngrok-free.app`)

4. Set `ECS_API_URL` in the API's environment:
   ```bash
   # In packages/hq-cloud/api/.env
   ECS_API_URL=https://abc123.ngrok-free.app
   ```

5. Restart the API server so it picks up the new ECS_API_URL

### How it works

```
[Browser] --> localhost:3000 (Next.js web app)
[Web App] --> localhost:3001 (Fastify API)
[API]     --> ECS (creates container task)
[Container] --> ngrok URL --> localhost:3001 (WebSocket relay back to API)
[API]     --> [Browser] (relays messages via WebSocket)
```

The container runs `claude --sdk-url ws://{ECS_API_URL}/ws/relay/{sessionId}`
which connects through ngrok back to the local API's WebSocket relay endpoint.

### Important notes

- ngrok free tier gives a random URL each time -- update ECS_API_URL on each restart
- The container takes 30-90 seconds to start (ECS Fargate cold start)
- Each test run costs real money (Fargate compute) -- keep test count minimal
- Always clean up sessions after tests to stop containers

## Running tests

```bash
# Mock-based tests only (fast, no auth needed)
npx playwright test e2e/agents.spec.ts e2e/navigation.spec.ts

# Smoke tests only (Clerk auth, fast)
npx playwright test e2e/smoke.spec.ts

# Multi-user isolation tests (requires both test accounts)
npx playwright test e2e/sync/isolation.spec.ts

# Live ECS session launch (requires ngrok + ECS env vars)
npx playwright test e2e/session-launch.spec.ts

# All non-integration E2E tests
npx playwright test

# With UI mode (interactive)
npx playwright test --ui

# Integration tests (requires MongoDB, separate config)
npx playwright test --config=playwright.integration.config.ts
```

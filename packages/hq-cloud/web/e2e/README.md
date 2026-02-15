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
# Smoke tests only (Clerk auth, fast)
npx playwright test e2e/smoke.spec.ts

# Live ECS session launch (requires ngrok + ECS env vars)
npx playwright test e2e/session-launch.spec.ts

# All non-integration E2E tests
npx playwright test

# With UI mode (interactive)
npx playwright test --ui

# Integration tests (requires MongoDB, separate config)
npx playwright test --config=playwright.integration.config.ts
```

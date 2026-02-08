# e2e-testing

Write, run, and debug E2E tests for backend features using Playwright API testing and cloud infrastructure.

## Arguments

`$ARGUMENTS` = `<action>` (required)

Actions:
- `write --target <endpoint|service|flow>` - Write E2E test for a feature
- `run [--filter <pattern>]` - Run E2E tests locally or in CI
- `debug --test <test-name>` - Debug a failing test
- `fix --test <test-name>` - Fix a failing test

Optional:
- `--repo <path>` - Target repository
- `--template <api-endpoints|nextjs-webapp>` - Use specific template
- `--browserbase` - Force Browserbase cloud execution (for UI integration tests)
- `--plan <path>` - Path to test plan JSON (REQUIRED for write action)

## Knowledge References

- **Templates:** knowledge/testing/templates/
  - `api-endpoints.md` - For REST API testing (primary for backend)
  - `nextjs-webapp.md` - For full-stack integration tests
  - `cli-browser-oauth.md` - For CLI tools with browser auth
  - `README.md` - When to use each template
- **Infrastructure:** knowledge/testing/e2e-cloud.md
- **Browserbase:** knowledge/testing/browserbase-integration.md
- **Vercel:** knowledge/testing/vercel-preview-deployments.md

## Process

### write

**PREREQUISITE: A test plan is REQUIRED before writing any E2E test.**

The write action refuses to proceed without a valid test plan. This ensures every test corresponds to real user behavior and real API contracts, not arbitrary endpoint poking.

1. **Locate test plan:**
   - If `--plan <path>` is provided, load that test plan JSON
   - Otherwise, search `workspace/reports/dev-team/qa/{project}-test-plan.json`
   - If no test plan exists, **STOP and trigger test-plan discovery:**
     - Notify: "No test plan found for {project}. Triggering test-plan discovery."
     - Run: `/run qa-tester test-plan --project {project} --repo {repo}`
     - Wait for test plan output before continuing
2. **Read the test plan** and identify the target flow:
   - Match `--target` to a flow in the test plan by name, ID, or endpoint
   - Extract: priority, type, steps, assertions, edge cases, template
   - If the target doesn't match any flow, warn and ask for clarification
3. Identify feature type:
   - API endpoint -> use api-endpoints.md template
   - Full user flow -> use nextjs-webapp.md template
4. Read existing tests for patterns (`tests/e2e/api/`)
5. Generate test file following template structure, incorporating:
   - Steps from the test plan flow specification
   - Assertions from the test plan
   - Edge cases listed in the test plan
   - Include: happy path, error cases, auth, validation
6. Run locally to verify: `npm run test:local`

### run

Supports both local and CI execution modes:

1. **Determine execution mode:**
   - `--local` (default): Run locally via `npm run test:local`
   - `--browserbase` or `--cloud`: Run on Browserbase cloud via `npm run test:browserbase` (for UI integration tests)
   - `--ci`: Triggered on push via GitHub Actions (read-only status check)
2. **Execute tests:**
   - Local: `npm run test:local`
   - Browserbase: `npm run test:browserbase` (for UI tests that need browser)
   - CI: Check GitHub Actions status via `gh run list --workflow=e2e`
3. Parse results from `test-results/test-results.json`
4. Report pass/fail summary with execution mode noted

### debug

1. Run with verbose output: `npm run test:local -- --grep <test> --debug`
2. Check API responses in test results
3. Review request/response logs
4. **Access Browserbase session recording (for UI integration tests):**
   - Retrieve session recording URL for the failing test run
   - Review recording for visual confirmation of failure state
   - Cross-reference with API response logs
5. Identify root cause and suggest fix

### fix

1. Read failing test and error message
2. Check endpoint/service for issues
3. Fix code or update test
4. Re-run to verify fix
5. Commit with clear message

## Output

### write
- New test file: `tests/e2e/api/{endpoint}.spec.ts`
- Test fixtures if needed: `tests/e2e/fixtures/{fixture}.ts`
- Reference to source test plan flow ID

### run
- Pass/fail summary
- Execution mode used (local/browserbase/ci)
- Link to CI results (if available)
- Response details for failures

### debug
- Root cause analysis
- API request/response diff
- Suggested fix
- Session recording URL (Browserbase, for UI integration tests)

### fix
- Fixed code or test
- Verification that tests pass

## API Testing Patterns

```typescript
// Basic endpoint test
test('GET /api/users returns user list', async ({ request }) => {
  const response = await request.get('/api/users');
  expect(response.ok()).toBeTruthy();
  expect(response.status()).toBe(200);

  const data = await response.json();
  expect(data.users).toBeInstanceOf(Array);
});

// Authenticated request
test('POST /api/protected requires auth', async ({ request }) => {
  const response = await request.post('/api/protected', {
    headers: { 'Authorization': `Bearer ${token}` },
    data: { field: 'value' }
  });
  expect(response.ok()).toBeTruthy();
});

// Error handling
test('POST /api/users validates input', async ({ request }) => {
  const response = await request.post('/api/users', {
    data: { invalid: 'data' }
  });
  expect(response.status()).toBe(400);
  const error = await response.json();
  expect(error.message).toContain('validation');
});
```

## Best Practices

- Test real HTTP requests, not mocked handlers
- Verify response status AND body structure
- Test auth flows with valid and invalid tokens
- Test rate limiting and error responses
- Use fixtures for test data setup/teardown
- Every test must trace back to a test plan flow -- no orphan tests

## CI Integration

Tests run automatically via GitHub Actions:
- On push to any non-main branch
- On pull request
- Results posted as PR comment
- API response logs available in artifacts

## Rules

- NEVER write a test without a test plan. If no plan exists, trigger test-plan discovery first.
- Every test must correspond to a flow in the test plan. No ad-hoc tests.
- When the test plan is updated, review existing tests for alignment.
- Prefer local execution for API tests; use Browserbase for UI integration tests.

# e2e-testing

Write, run, and debug E2E tests for frontend features using Playwright and cloud infrastructure.

## Arguments

`$ARGUMENTS` = `<action>` (required)

Actions:
- `write --target <page|component|flow>` - Write E2E test for a feature
- `run [--filter <pattern>]` - Run E2E tests locally or in CI
- `debug --test <test-name>` - Debug a failing test
- `fix --test <test-name>` - Fix a failing test

Optional:
- `--repo <path>` - Target repository
- `--template <nextjs-webapp|cli-browser-oauth>` - Use specific template
- `--browserbase` - Force Browserbase cloud execution
- `--plan <path>` - Path to test plan JSON (REQUIRED for write action)

## Knowledge References

- **Templates:** knowledge/testing/templates/
  - `nextjs-webapp.md` - For Next.js/React apps
  - `cli-browser-oauth.md` - For CLI with browser flows
  - `api-endpoints.md` - For API testing
  - `README.md` - When to use each template
- **Infrastructure:** knowledge/testing/e2e-cloud.md
- **Browserbase:** knowledge/testing/browserbase-integration.md
- **Vercel:** knowledge/testing/vercel-preview-deployments.md

## Process

### write

**PREREQUISITE: A test plan is REQUIRED before writing any E2E test.**

The write action refuses to proceed without a valid test plan. This ensures every test corresponds to real user behavior, not arbitrary button-clicking.

1. **Locate test plan:**
   - If `--plan <path>` is provided, load that test plan JSON
   - Otherwise, search `workspace/reports/dev-team/qa/{project}-test-plan.json`
   - If no test plan exists, **STOP and trigger test-plan discovery:**
     - Notify: "No test plan found for {project}. Triggering test-plan discovery."
     - Run: `/run qa-tester test-plan --project {project} --repo {repo}`
     - Wait for test plan output before continuing
2. **Read the test plan** and identify the target flow:
   - Match `--target` to a flow in the test plan by name, ID, or feature area
   - Extract: priority, type, steps, assertions, edge cases, template
   - If the target doesn't match any flow, warn and ask for clarification
3. Identify feature type and select appropriate template from `knowledge/testing/templates/`
4. Read existing tests for patterns (`tests/e2e/`)
5. Generate test file following template structure, incorporating:
   - Steps from the test plan flow specification
   - Assertions from the test plan
   - Edge cases listed in the test plan
6. Add data-testid attributes to components if needed
7. Run locally to verify: `npm run test:local`

### run

Supports both local and CI execution modes:

1. **Determine execution mode:**
   - `--local` (default): Run with local browser via `npm run test:local`
   - `--browserbase` or `--cloud`: Run on Browserbase cloud via `npm run test:browserbase`
   - `--ci`: Triggered on push via GitHub Actions (read-only status check)
2. **Execute tests:**
   - Local: `npm run test:local` (uses Playwright's built-in browser)
   - Browserbase: `npm run test:browserbase` (connects to Browserbase cloud browser)
   - CI: Check GitHub Actions status via `gh run list --workflow=e2e`
3. Parse results from `test-results/test-results.json`
4. Report pass/fail summary with execution mode noted

### debug

1. Run with Playwright Inspector: `npm run test:debug -- --grep <test>`
2. Check screenshots in `test-results/`
3. **Access Browserbase session recording:**
   - List recent sessions: check Browserbase dashboard or API
   - Retrieve session recording URL for the failing test run
   - Review recording for visual confirmation of failure state
   - Cross-reference with Playwright trace if available
4. Review Browserbase session recording if applicable
5. Identify root cause and suggest fix

### fix

1. Read failing test and error message
2. Check component/page for issues
3. Fix code or update test
4. Re-run to verify fix
5. Commit with clear message

## Output

### write
- New test file: `tests/e2e/{feature}.spec.ts`
- Updated playwright.config.ts (if needed)
- Reference to source test plan flow ID

### run
- Pass/fail summary
- Execution mode used (local/browserbase/ci)
- Link to CI results (if available)
- Screenshots for failures
- Browserbase session URL (if cloud execution)

### debug
- Root cause analysis
- Suggested fix
- Session recording URL (Browserbase)
- Playwright trace viewer link (if available)

### fix
- Fixed code or test
- Verification that tests pass

## Best Practices

- Write tests that mirror real user behavior (as defined in the test plan)
- Use data-testid for stable selectors
- Test both happy paths and error states
- Don't rely on arbitrary timeouts
- Keep tests independent (no shared state)
- Every test must trace back to a test plan flow -- no orphan tests

## CI Integration

Tests run automatically via GitHub Actions:
- On push to any non-main branch
- On pull request
- Results posted as PR comment
- Artifacts (screenshots, traces) uploaded on failure

## Rules

- NEVER write a test without a test plan. If no plan exists, trigger test-plan discovery first.
- Every test must correspond to a flow in the test plan. No ad-hoc tests.
- When the test plan is updated, review existing tests for alignment.
- Prefer Browserbase cloud execution for CI; use local for development iteration.

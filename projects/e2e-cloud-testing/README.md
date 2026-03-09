# E2E Cloud Testing

**Goal:** Every code change in HQ-managed projects is automatically E2E tested in the cloud before merge, with agents both writing and running tests as part of their standard workflow.

**Success:** Agents can trigger E2E tests with a single command, view results clearly, and PRs cannot merge without green E2E tests.

## Overview

Cloud-native E2E testing infrastructure that enables agents to autonomously test all code changes without local resources, with enforcement mechanisms ensuring nothing ships without passing tests.

## User Stories

### US-001: Set up Vercel Preview deployment pipeline
**Description:** As an agent, I want code pushes to automatically create Vercel preview deployments so I have a live URL to test against without manual setup.

**Acceptance Criteria:**
- [x] Vercel project connected to GitHub repo
- [x] Every branch push creates preview deployment
- [x] Preview URL is predictable or discoverable via Vercel API/MCP
- [x] Deployments auto-expire after 7 days to control costs
- [x] Environment variables configured for test mode

### US-002: Create GitHub Actions E2E workflow
**Description:** As an agent, I want a GitHub Action that runs Playwright tests against preview deployments so tests execute automatically on every push.

**Acceptance Criteria:**
- [x] Workflow file created at .github/workflows/e2e.yml
- [x] Workflow triggers on push to any branch
- [x] Waits for Vercel preview deployment to be ready
- [x] Runs Playwright test suite against preview URL
- [x] Uploads test artifacts (screenshots, traces, videos) on failure
- [x] Posts test results as PR comment
- [x] Workflow completes in under 10 minutes for typical test suite

### US-003: Integrate Browserbase for headless execution
**Description:** As an agent, I want tests to run on Browserbase's cloud infrastructure so no local browser resources are needed and tests can parallelize.

**Acceptance Criteria:**
- [x] Browserbase account configured with API key stored in GitHub secrets
- [x] Playwright configured to use Browserbase as browser provider
- [x] Tests run in parallel across multiple browser instances
- [x] Session recordings available for debugging failed tests
- [x] Fallback to standard Playwright if Browserbase unavailable

### US-004: Create E2E test templates for common app types
**Description:** As an agent writing tests, I want templates and examples for each app type so I can quickly create comprehensive E2E tests.

**Acceptance Criteria:**
- [x] Template created: knowledge/testing/templates/nextjs-webapp.md
- [x] Template created: knowledge/testing/templates/cli-browser-oauth.md
- [x] Template created: knowledge/testing/templates/api-endpoints.md
- [x] Each template includes: setup, common patterns, assertions, cleanup

### US-005: Create E2E cloud testing knowledge base
**Description:** As an agent, I need documentation on how to write and run E2E tests so testing is part of my standard implementation workflow.

**Acceptance Criteria:**
- [x] knowledge/testing/e2e-cloud.md documents full workflow
- [x] Documents: how to trigger tests, view results, download artifacts
- [x] Documents: how to interpret failures and debug
- [x] Linked from CLAUDE.md testing section

### US-006: Add e2e-testing skill to dev-team workers
**Description:** As a code worker, I need an e2e-testing skill so I know how to write tests as part of implementation, not as an afterthought.

**Acceptance Criteria:**
- [x] e2e-testing skill added to workers/dev-team/frontend-dev/worker.yaml
- [x] e2e-testing skill added to workers/dev-team/backend-dev/worker.yaml
- [x] Skill definition includes: write tests, run tests, interpret results, fix failures

### US-007: Update PRD schema to require e2eTests field
**Description:** As a PRD author, I must specify e2eTests for each user story so test requirements are defined upfront.

**Acceptance Criteria:**
- [x] PRD schema documented at knowledge/hq-core/prd-schema.md updated
- [x] e2eTests[] array added as required field per user story
- [x] /prd command updated to prompt for e2eTests during story creation
- [x] Validation script created to check PRDs for e2eTests presence

### US-008: Update Ralph loop to require E2E pass before task completion
**Description:** As the Ralph orchestrator, I must verify E2E tests pass before marking any task complete.

**Acceptance Criteria:**
- [x] pure-ralph-base.md updated with E2E verification step
- [x] Ralph checks GitHub Actions status before setting passes: true
- [x] If E2E tests fail, task stays in_progress with failure details logged
- [x] Timeout handling: fail task after 15 minutes of no E2E result

### US-009: Add PR quality gate blocking merge without E2E
**Description:** As a repository maintainer, I want PRs blocked from merging unless E2E tests pass.

**Acceptance Criteria:**
- [x] GitHub branch protection rule configured for main branch
- [x] e2e workflow required to pass before merge
- [x] PR cannot be merged with failing E2E tests

### US-010: Build agent-friendly test result viewer
**Description:** As an agent debugging a test failure, I want clear, parseable test results.

**Acceptance Criteria:**
- [x] Test results output in JSON format to artifacts
- [x] Failed tests include: screenshot path, error message, stack trace
- [x] PR comment template shows: test count, pass/fail, links to failures

### US-011: Add test coverage tracking to /metrics
**Description:** As an HQ operator, I want to see test coverage trends.

**Acceptance Criteria:**
- [x] /metrics command updated to show test statistics
- [x] Shows: total tests, passing tests, coverage percentage
- [x] Tracks trends over time (stored in workspace/metrics/)
- [x] Alerts if coverage drops below 80%

### US-012: Validate infrastructure with hq-installer E2E tests
**Description:** Proof of concept: write and run E2E tests for hq-installer landing page.

**Acceptance Criteria:**
- [x] E2E tests written in installer/tests/e2e/ for landing page
- [x] Tests verify: OS detection works, download buttons present, FAQ accordion works
- [x] Tests run via new infrastructure (Vercel + GH Actions + Browserbase)
- [x] All tests pass on first real execution

## Technical Considerations

- Vercel for preview deployments
- GitHub Actions for CI
- Browserbase for cloud browser execution
- Playwright for test framework

# e2e-perf

**Goal:** Reduce Electron e2e test execution time by 50-60% through elimination of unnecessary waits and optimized infrastructure
**Success:** Full e2e suite runs in under 3 minutes (down from ~5-7 minutes) with zero test regressions
**Repo:** repos/private/indigo-nx
**Branch:** feature/e2e-perf

## Overview

The Electron e2e tests in `apps/electron/` are slow due to hardcoded `setTimeout` and `waitForTimeout` calls throughout the test infrastructure, redundant Electron app launches in the auth suite, and an unoptimized build/install pipeline. This project replaces fixed delays with event-driven Playwright waits, consolidates Electron launches where safe, and leverages Nx build caching.

## Quality Gates

- `pnpm typecheck && pnpm lint`
- `pnpm run build && pnpm exec playwright test --config=playwright.config.ts`

## User Stories

### US-001: Replace hardcoded 5s sleep in launchElectronApp with event-driven wait
**Description:** As a developer, I want the Electron app launch to use Playwright's firstWindow() instead of a hardcoded 5-second setTimeout, so that each launch completes as fast as the app actually starts (~1s) instead of always waiting 5s.
**Priority:** 1
**Depends on:** None

**Acceptance Criteria:**
- [ ] launchElectronApp() in test-utils.ts uses electronApp.firstWindow() instead of setTimeout(5000)
- [ ] All 28 existing tests that use launchElectronApp still pass
- [ ] App launch wait time is under 2s on average (down from fixed 5s)

### US-002: Replace waitForTimeout calls in test-utils.ts with event-driven waits
**Description:** As a developer, I want the shared test utilities (logoutUser, waitForAppReady, waitForAuthWindow, performDeeplinkLogin) to use proper Playwright wait conditions instead of hardcoded sleeps.
**Priority:** 1
**Depends on:** US-001

**Acceptance Criteria:**
- [ ] logoutUser: 3000ms sleep replaced with polling for auth state change
- [ ] logoutUser: 2000ms sleep removed
- [ ] waitForAppReady: 2000ms sleep replaced with waitForSelector on root element
- [ ] waitForAuthWindow: 1500ms sleep reduced to 500ms or removed
- [ ] performDeeplinkLogin: 3000ms sleep removed (networkidle handles it)
- [ ] All 28 existing tests still pass
- [ ] No new flaky test failures (run 3x to verify)

### US-003: Replace waitForTimeout calls in test spec files
**Description:** As a developer, I want the individual test files to use proper Playwright assertions instead of hardcoded sleeps between actions.
**Priority:** 2
**Depends on:** US-002

**Acceptance Criteria:**
- [ ] onboarding.spec.ts: navigateToOnboarding sleep removed, various waitForTimeout calls replaced
- [ ] auth.spec.ts: waitForTimeout calls after logout/reload replaced with element assertions
- [ ] assistant-chat.spec.ts: waitForTimeout between actions replaced with visibility checks
- [ ] chain-of-thought.spec.ts: waitForTimeout replaced with waitForLoadState
- [ ] All 28 existing tests still pass
- [ ] Run 3x to verify no flakiness

### US-004: Reuse Electron instances in auth tests
**Description:** As a developer, I want the auth test suite to share Electron app instances across related tests, reducing total launches from 5 to 3.
**Priority:** 2
**Depends on:** US-001

**Acceptance Criteria:**
- [ ] Auth tests 1-3 share a single Electron app instance via beforeAll/afterAll
- [ ] Auth tests 4 and 5 keep their own launches (different state requirements)
- [ ] Total Electron launches reduced from 5 to 3
- [ ] All 6 auth tests still pass

### US-005: Optimize build and playwright install in e2e target
**Description:** As a developer, I want the Nx e2e target to leverage build caching and skip unnecessary playwright installs.
**Priority:** 3
**Depends on:** None

**Acceptance Criteria:**
- [ ] project.json e2e target uses dependsOn: ['build'] for Nx caching
- [ ] Playwright install gated with version check
- [ ] Second run with no source changes skips build and install

### US-006: Reduce global test timeout and set per-test overrides
**Description:** As a developer, I want the default timeout reduced from 180s to 60s so non-LangGraph tests fail fast.
**Priority:** 3
**Depends on:** None

**Acceptance Criteria:**
- [ ] playwright.config.ts timeout changed from 180000 to 60000
- [ ] assistant-chat.spec.ts uses test.setTimeout(180000) for LangGraph tests
- [ ] All non-chat tests pass with 60s timeout
- [ ] Failing tests now fail ~2x faster

## Non-Goals

- Parallelizing test suites (risk of flaky test failures from shared state)
- Moving unit tests to a different test runner
- Rewriting test logic or adding new test coverage
- Changing what the tests verify

## Technical Considerations

- All changes are in the test infrastructure only — no production code changes
- Removing sleeps requires conservative validation: run 3x to detect flakiness
- Auth tests 1-3 must maintain serial execution order when sharing an Electron instance
- The `firstWindow()` API is a Playwright built-in that resolves on BrowserWindow creation

## Open Questions

- Exact element selector for waitForAppReady replacement (need to identify a reliable "app is ready" indicator in the DOM)
- Whether logoutUser's 3s sleep can be fully replaced with auth state polling or needs a small fallback sleep

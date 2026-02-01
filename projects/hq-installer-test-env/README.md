# hq-installer-test-env

**Goal:** Automated CI testing that verifies hq-installer works from zero to functional HQ on both Windows and macOS

**Success:** Single workflow runs on installer PRs, tests both platforms in parallel, completes in under 10 minutes, outputs clear pass/fail

**Repo:** C:/my-hq (extends installer/tests/)

**Branch:** feature/hq-installer-test-env

## Overview

Automated test environment for hq-installer using GitHub Actions to verify Windows and macOS installers work from zero to functional HQ. Replaces manual VM testing with automated CI that runs on every PR affecting the installer.

## Approach

GitHub Actions with matrix strategy (windows-latest, macos-latest):
- Real OS testing on actual Windows and macOS runners
- Parallel execution for fast feedback
- Caching to minimize Actions minutes
- Triggers only on installer/** changes

## Quality Gates

- CI workflow must pass on both platforms
- Total runtime under 10 minutes

## User Stories

### US-001: Create GitHub Actions workflow structure
**Description:** As a developer, I want a GitHub Actions workflow that triggers on installer changes so that I can automatically verify the installer works before merging
**Priority:** 1
**Depends on:** None

**Acceptance Criteria:**
- [ ] Workflow file created at .github/workflows/test-installer.yml
- [ ] Triggers on pull_request when installer/** files change
- [ ] Triggers on workflow_dispatch for manual runs
- [ ] Matrix strategy defined for windows-latest and macos-latest
- [ ] Jobs run in parallel for faster feedback

---

### US-002: Implement Windows unattended install and test job
**Description:** As a developer, I want the Windows CI job to build and run the installer silently so that I can verify it works without manual interaction
**Priority:** 2
**Depends on:** US-001

**Acceptance Criteria:**
- [ ] Job installs NSIS build tools
- [ ] Job builds the installer from installer/windows/hq-installer.nsi
- [ ] Installer runs in silent/unattended mode (/S flag)
- [ ] Job runs installer/tests/test-windows.ps1 after install
- [ ] Job fails if any test assertion fails
- [ ] Job outputs clear pass/fail summary

---

### US-003: Implement macOS install and test job
**Description:** As a developer, I want the macOS CI job to build and run the installer so that I can verify it works on real macOS
**Priority:** 2
**Depends on:** US-001

**Acceptance Criteria:**
- [ ] Job installs required build tools (pkgbuild, productbuild)
- [ ] Job builds the .pkg from installer/macos/build-pkg.sh
- [ ] Installer runs via sudo installer -pkg ... -target /
- [ ] Job runs installer/tests/test-macos.sh after install
- [ ] Job fails if any test assertion fails
- [ ] Job outputs clear pass/fail summary

---

### US-004: Add caching for faster CI runs
**Description:** As a developer, I want CI runs to be fast so that I don't waste time and Actions minutes waiting for tests
**Priority:** 3
**Depends on:** US-002, US-003

**Acceptance Criteria:**
- [ ] Node.js installer cached between runs (avoid re-download)
- [ ] NSIS tools cached on Windows
- [ ] Total CI time under 10 minutes for both platforms combined
- [ ] Cache keys include relevant file hashes for invalidation

---

### US-005: Create CI-compatible test scripts
**Description:** As a developer, I want test scripts that work in CI headless environments so that tests run reliably without GUI interaction
**Priority:** 3
**Depends on:** US-002, US-003

**Acceptance Criteria:**
- [ ] test-windows.ps1 updated to handle CI environment (no GUI prompts)
- [ ] test-macos.sh updated to handle CI environment (no GUI prompts)
- [ ] Scripts skip Claude OAuth verification (requires browser)
- [ ] Scripts output structured results (exit codes, summary)
- [ ] Scripts handle cleanup on failure

---

### US-006: Add functional verification tests
**Description:** As a developer, I want to verify the installed HQ is actually functional so that I catch real-world failures
**Priority:** 4
**Depends on:** US-005

**Acceptance Criteria:**
- [ ] Test verifies Node.js runs: node --version
- [ ] Test verifies npm runs: npm --version
- [ ] Test verifies Claude CLI installed: claude --version
- [ ] Test verifies my-hq directory structure exists with required files
- [ ] Test verifies claude --help runs from my-hq directory
- [ ] Test runs a basic HQ operation (e.g., /help command)

---

### US-007: Document local testing workflow
**Description:** As a developer, I want documentation on running tests locally so that I can verify changes before pushing
**Priority:** 5
**Depends on:** US-002, US-003

**Acceptance Criteria:**
- [ ] README documents how to run Windows tests locally (Docker or Sandbox)
- [ ] README documents how to run macOS tests locally (fresh user account)
- [ ] README documents how to trigger workflow manually
- [ ] README includes troubleshooting for common CI failures

## Non-Goals

- Full browser-based OAuth testing (requires real credentials)
- Performance benchmarking (just pass/fail)
- Testing on older OS versions (Windows 10 21H2+, macOS 13+ only)
- Local Docker-based testing for macOS (Apple licensing)

## Technical Considerations

- Windows runners include NSIS via chocolatey
- macOS runners have pkgbuild/productbuild built-in
- Claude CLI installation requires npm, which requires Node.js
- Silent install flags: Windows `/S`, macOS `-target /`
- Actions minutes: Windows = 2x, macOS = 10x Linux minutes

## Open Questions

- Should we mock Claude CLI responses for offline testing?
- Add Slack/Discord notification on failure?

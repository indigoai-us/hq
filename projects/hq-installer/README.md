# HQ Installer

**Goal:** Enable non-technical professionals to set up my-hq in under 5 minutes with zero terminal commands.

**Success:** User downloads installer, runs it, and has working my-hq with Claude CLI ready — no terminal commands needed.

## Overview

Zero-friction native installer that gets non-technical users from download to working my-hq in under 5 minutes with no terminal commands. Supports Windows (.exe via NSIS) and macOS (.pkg).

## User Stories

### US-001: Identify minimal dependency set
**Description:** As a developer, I want to identify the absolute minimum dependencies required to run my-hq.

**Acceptance Criteria:**
- [x] Document which my-hq features require Git (if any)
- [x] Document which features require GitHub CLI (if any)
- [x] Confirm Node.js version requirement (18+)
- [x] Confirm Claude CLI is required

### US-002: Create Windows installer with NSIS
**Description:** As a non-technical Windows user, I want to download and run a .exe installer.

**Acceptance Criteria:**
- [x] NSIS installer script created in installer/windows/
- [x] Installer has branded UI with progress indicators
- [x] Detects if Node.js is installed, installs if missing
- [x] Detects if Claude CLI is installed, installs via npm if missing
- [x] Prompts user for install location with sensible default
- [x] Creates Start Menu shortcut

### US-003: Create macOS installer package
**Description:** As a non-technical macOS user, I want to download and run a .pkg installer.

**Acceptance Criteria:**
- [x] macOS .pkg installer created in installer/macos/
- [x] Installer has branded UI with progress indicators
- [x] Detects if Node.js is installed, installs if missing
- [x] Detects if Claude CLI is installed, installs via npm if missing
- [x] Handles macOS Gatekeeper prompts gracefully

### US-004: Implement Claude CLI browser OAuth flow
**Description:** As a user, I want to authenticate Claude CLI by logging into claude.ai in my browser.

**Acceptance Criteria:**
- [x] Installer opens browser to Claude OAuth URL
- [x] Installer waits for OAuth callback or polls for completion
- [x] On success, Claude CLI is configured and ready to use
- [x] Works on both Windows and macOS

### US-005: Download and configure my-hq template
**Description:** As a user, I want the installer to set up my-hq folder automatically.

**Acceptance Criteria:**
- [x] Downloads latest my-hq starter template
- [x] Extracts to user-chosen location
- [x] Runs any necessary npm install or setup scripts
- [x] Does NOT require Git to be installed

### US-006: Run post-install setup wizard
**Description:** As a new user, I want a friendly setup wizard after install.

**Acceptance Criteria:**
- [x] Opens GUI or terminal-based wizard after install completes
- [x] Collects user name/preferences for agents.md
- [x] Offers to run /setup command
- [x] Shows 'Getting Started' guide with next steps

### US-007: Implement auto-update mechanism
**Description:** As a user, I want the installer to check for updates automatically.

**Acceptance Criteria:**
- [x] Installer checks for updates on launch
- [x] If update available, prompts user to download/install
- [x] Update preserves user's my-hq data and configuration
- [x] Works on both Windows and macOS

### US-008: Create download landing page
**Description:** As a potential user, I want a simple download page.

**Acceptance Criteria:**
- [x] Landing page auto-detects OS and shows appropriate download button
- [x] Shows system requirements
- [x] Provides manual/advanced installation instructions
- [x] Includes FAQ for common issues

### US-009: Test installer on clean machines
**Description:** As a developer, I want to verify the installer works on fresh OS installations.

**Acceptance Criteria:**
- [x] Test on clean Windows 10 VM
- [x] Test on clean Windows 11 VM
- [x] Test on clean macOS VM or fresh user
- [x] Verify Claude CLI works after install
- [x] Document any edge cases or workarounds

## Technical Considerations

- Windows: NSIS installer
- macOS: .pkg installer
- Minimal deps: Node.js 18+, Claude CLI
- Optional deps: Git, gh, qmd, pnpm

# hq-cloud-onboarding — As-Built Spec

**Project:** hq-cloud-onboarding
**Branch:** `feature/hq-cloud`
**Completed:** 2026-02-14
**Stories:** 7/7

## Goal

Make hq-cloud zero-config: users install HQ, sign in, store their Claude token, and launch cloud sessions without ever touching AWS credentials, `.env` files, or manual configuration.

## What Was Built

### US-001: S3 File Proxy Endpoints on API

**Status:** Implemented as designed

Files created:
- `packages/hq-cloud/api/src/data/file-proxy.ts` — S3 service layer with upload, download, list, sync diff, quota enforcement
- `packages/hq-cloud/api/src/routes/files.ts` — REST endpoints (POST upload, GET download, GET list, POST sync, GET quota)
- `packages/hq-cloud/api/src/__tests__/files.test.ts` — 29 tests

Key decisions:
- Base64 JSON body for uploads (no multipart) — simpler implementation, sufficient for typical HQ file sizes
- S3 keys scoped under `user_{clerkId}/hq/` prefix — strict per-user isolation
- 500MB default storage quota per user
- ETag-based comparison for sync diff (manifest approach)
- Path traversal validation prevents `../` attacks

### US-002: Clerk Auth Flow in hq-cli

**Status:** Implemented as designed

Files created:
- `packages/hq-cli/src/commands/auth.ts` — `hq auth login|logout|status` commands
- `packages/hq-cli/src/utils/credentials.ts` — Credential storage at `~/.hq/credentials.json`
- `packages/hq-cli/src/utils/api-client.ts` — Authenticated API client with Bearer token
- `packages/hq-cli/src/__tests__/credentials.test.ts` — 14 tests

Key decisions:
- Localhost HTTP callback on port 19750-19850 (auto-finds open port)
- Browser opens to API auth page with device code, callback receives token
- Credentials stored with mode 0o600 (owner read/write only)
- Cross-platform browser open (macOS `open`, Windows `start`, Linux `xdg-open`)
- 5-minute login timeout
- `HQ_CLOUD_API_URL` env var or `~/.hq/config.json` for API URL override

### US-003: Claude Token Setup Command in hq-cli

**Status:** Implemented as designed

Files created:
- `packages/hq-cli/src/commands/cloud-setup.ts` — `hq cloud setup-token|status|upload` commands
- `packages/hq-cli/src/__tests__/cloud-setup.test.ts` — 14 tests

Key decisions:
- Token validation: non-empty, min 20 chars, no internal whitespace
- Sends token to POST `/api/settings/claude-token` via Clerk-authed API client
- `hq cloud status` shows both auth state and Claude token state in one view

### US-004: Cloud Onboarding Step in create-hq Installer

**Status:** Implemented as designed

Files modified:
- `packages/create-hq/src/scaffold.ts` — Replaced placeholder cloud sync with interactive setup
- `packages/create-hq/src/index.ts` — `--skip-cloud` flag (renamed from `--skip-sync`)

Key decisions:
- Uses `spawnSync` with `stdio: 'inherit'` for interactive auth/token prompts
- Each cloud step wrapped in try/catch — failure warns but doesn't block installation
- Three sequential steps: auth login → setup-token → upload note

### US-005: hq sync Commands Use API Proxy

**Status:** Implemented as designed

Files created/rewritten:
- `packages/hq-cli/src/commands/cloud.ts` — Full rewrite of sync commands (push/pull/start/stop/status)
- `packages/hq-cli/src/utils/sync.ts` — Manifest computation, file hashing, upload/download, sync diff (~380 lines)
- `packages/hq-cli/src/sync-worker.ts` — Background sync worker (forked process)
- `packages/hq-cli/src/__tests__/sync.test.ts` — 50 tests

Key decisions:
- SHA-256 hashing for file comparison
- Ignore patterns: `.git/`, `node_modules/`, `.claude/`, `dist/`, `.env`, `.DS_Store`, etc.
- Sync state persisted to `.hq-cloud-sync.json` in HQ root
- Background watcher uses Node.js `fork()` with detached process
- Manifest-based diff: local manifest sent to API, returns `toUpload`/`toDownload` lists
- Quota information shown in `hq sync status`

### US-006: Initial HQ File Upload on First Cloud Setup

**Status:** Implemented as designed

Files created:
- `packages/hq-cli/src/commands/initial-upload.ts` — Core upload logic with progress indicator (~264 lines)
- `packages/hq-cli/src/__tests__/initial-upload.test.ts` — 19 tests

Files modified:
- `packages/hq-cli/src/commands/cloud-setup.ts` — Added `hq cloud upload` subcommand

Key decisions:
- `runInitialUpload()` exported for programmatic use (called by installer)
- Checks remote files first; prompts for merge/replace if conflicts exist
- Progress indicator: `\r` overwrite on TTY for `Uploading: X/Y files (Z%)`
- Options: `--hq-root`, `--on-conflict` (merge/replace/skip)
- Updates sync state after upload so `hq sync status` shows "in sync"

### US-007: Web UI First-Run Onboarding Wizard

**Status:** Implemented as designed

Files created:
- `packages/hq-cloud/web/src/components/OnboardingCard.tsx` — 3-step onboarding card
- `packages/hq-cloud/web/src/components/__tests__/OnboardingCard.test.tsx` — 16 tests

Files modified:
- `packages/hq-cloud/web/src/services/files.ts` — Added `fetchFileCount()` function
- `packages/hq-cloud/web/src/app/(authenticated)/agents/page.tsx` — Integrated OnboardingCard

Key decisions:
- OnboardingCard shown inline on agents page when `sessions.length === 0` and not dismissed
- Dismissal persisted in localStorage (`hq-cloud-onboarding-dismissed`)
- Three steps: Account Created (always green), Claude Token (links to settings), HQ Files Synced (shows count)
- Auto-dismiss after 2 seconds when all steps complete
- "Skip setup" link for early dismissal
- Parallel API fetches (token status + file count) for fast load

## Build Fixes (Pre-existing Issues Resolved)

These were pre-existing build issues in `hq-cli` that blocked compilation:
- `simple-git` import: Changed to named import for NodeNext compatibility
- Test files in build: Added `"exclude": ["src/__tests__"]` to tsconfig.json
- `@indigoai/hq-cloud` missing: Removed non-existent package dependency, created type declarations

## Test Coverage

| Package | Test Files | Tests |
|---------|-----------|-------|
| hq-cli | credentials, cloud-setup, sync, initial-upload | 97 |
| hq-cloud API | files | 29 |
| hq-cloud web | OnboardingCard | 16 |
| **Total new tests** | | **142** |

## Architecture Decisions

1. **API proxy pattern** — All S3 operations go through the hq-cloud API. Clients never need AWS credentials. This is the core architectural choice that enables zero-config.

2. **Clerk device auth** — CLI uses browser redirect with localhost callback. Simple, works cross-platform, no PKCE complexity.

3. **Base64 upload encoding** — Chose JSON body with base64-encoded content over multipart form data. Simpler implementation, works well for typical HQ file sizes (<10MB each).

4. **Manifest-based sync** — Client sends `{path, hash, size}[]` to API, gets back `toUpload`/`toDownload` lists. Minimizes data transfer.

5. **localStorage for UI state** — Onboarding card dismissal is client-side only. No need to persist this server-side.

## Deviations from PRD

- None significant. All acceptance criteria met as specified.

## Known Limitations

- File uploads are base64-encoded in JSON body — adds ~33% overhead. For large files (>10MB), chunked/multipart upload would be more efficient (documented as nice-to-have in PRD).
- Background sync watcher uses polling (configurable interval, default 30s) rather than filesystem events. Sufficient for MVP.
- CLI auth token stored as plaintext JSON at `~/.hq/credentials.json` — OS keychain integration is a future enhancement.
- OnboardingCard has 3 pre-existing TypeScript errors in sibling files (unrelated to this work).

## Dependencies Added

- hq-cli: No new npm dependencies (uses Node.js built-in `crypto`, `http`, `fs`, `child_process`)
- hq-cloud API: No new dependencies (S3 operations use existing AWS SDK)
- hq-cloud web: No new dependencies

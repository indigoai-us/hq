# hq-cloud-initial-sync

**Goal:** Provide seamless automatic initial HQ file sync when users log in via CLI, web, or docs app — with clear progress, fail protection, and retry capability

**Success:** A new user can run `hq auth login` and have their HQ files automatically synced to S3 without any additional manual steps. Navigator shows files immediately after. Web and docs app detect missing setup and guide the user.

**Repo:** `C:\repos\hq`
**Branch:** `feature/hq-cloud` (work on the existing branch — merge to main after sync is stable)

## Overview

When a user logs in to HQ Cloud via any of three channels (CLI, HQ Cloud web, Indigo Docs app), the system should automatically check whether initial sync has been completed and initiate it if not. The sync uploads all HQ files to the user's provisioned S3 path. Failure protection ensures users are notified and can retry if the sync fails entirely, while partial failures (a few files skipped) are treated as success with warnings.

### Known Issues Being Fixed

- `s3Prefix` not automatically set in MongoDB → Navigator shows nothing
- Server-side `walkDirectory()` in `initial-sync.ts` → doesn't work in ECS Fargate
- Empty `.gitkeep` files → "content is required" error
- Large binary files → "Request body is too large" error
- No auto-sync after CLI login → user must manually run `hq sync push`

## Quality Gates

- `cd C:\repos\hq\packages\hq-cloud\api && pnpm test`
- `cd C:\repos\hq\packages\hq-cli && pnpm test`

## User Stories

### US-001: API: Setup status endpoint
**Description:** As a client (CLI, web, docs app), I want a GET /api/auth/setup-status endpoint that returns whether the authenticated user has completed initial sync, so all channels can check setup state consistently.
**Priority:** 1
**Depends on:** None

**Acceptance Criteria:**
- [ ] GET /api/auth/setup-status returns `{ setupComplete, s3Prefix, fileCount }`
- [ ] setupComplete is true only when s3Prefix is set AND at least 1 file exists in S3
- [ ] Returns 401 for unauthenticated requests
- [ ] Works with both Clerk JWT and CLI token auth
- [ ] Unit tests cover all response cases

### US-002: API: Provision S3 prefix on first auth
**Description:** As a new user, I want my S3 prefix automatically provisioned when I first authenticate, so storage is ready before sync.
**Priority:** 1
**Depends on:** None

**Acceptance Criteria:**
- [ ] New users get settings doc with s3Prefix = `{clerkUserId}/hq/`
- [ ] Existing users with null s3Prefix get it backfilled on next auth
- [ ] No double `user_` prefix (clerkUserId already starts with `user_`)
- [ ] Provisioning is idempotent
- [ ] Unit tests verify both new and backfill cases

### US-003: API: Fix file upload for empty and large files
**Description:** As a user syncing HQ files, I want empty files and large files handled gracefully.
**Priority:** 2
**Depends on:** None

**Acceptance Criteria:**
- [ ] Empty files (0 bytes) upload as zero-byte S3 objects
- [ ] Large files return clear error with file name and size
- [ ] Fastify body limit increased to 10MB for upload route
- [ ] Unit tests cover empty file, large file, and error messages

### US-004: CLI: Auto-detect setup status after login
**Description:** As a CLI user, after `hq auth login`, I want the CLI to auto-check if sync is needed and start it.
**Priority:** 1
**Depends on:** US-001

**Acceptance Criteria:**
- [ ] After login, CLI calls GET /api/auth/setup-status
- [ ] If incomplete, auto-starts sync with message
- [ ] If complete, shows status with file count
- [ ] Network errors are warnings, not login failures
- [ ] `--no-sync` flag to skip auto-sync

### US-005: CLI: Resilient initial sync with progress and retry
**Description:** As a CLI user, I want progress, summary, and retry on failure during initial sync.
**Priority:** 2
**Depends on:** US-003, US-004

**Acceptance Criteria:**
- [ ] Progress counter: `Uploading files... (342/1132)`
- [ ] Summary: `Synced 1113 files. 19 skipped.`
- [ ] Total failure (0 uploaded) → prompt retry
- [ ] Partial failure (<50% success) → prompt retry failed files
- [ ] Skipped files (empty, oversized) don't count as failures
- [ ] `--verbose` shows individual file errors

### US-006: HQ Cloud Web: Auto-detect setup on login
**Description:** As a web user, I want the app to detect missing sync and guide me.
**Priority:** 2
**Depends on:** US-001

**Acceptance Criteria:**
- [ ] Web calls setup-status after Clerk auth
- [ ] Shows setup banner if incomplete with CLI instructions
- [ ] Banner dismissible but reappears if still incomplete
- [ ] Setup status cached in React state per session

### US-007: Indigo Docs App: Auto-detect setup on login
**Description:** As a docs app user, I want a notification if sync isn't set up.
**Priority:** 3
**Depends on:** US-001

**Acceptance Criteria:**
- [ ] Docs app calls setup-status after auth
- [ ] Shows non-blocking notification if incomplete
- [ ] Check runs once per app launch

### US-008: API: Remove server-side walkDirectory from initial-sync
**Description:** Remove the server-side filesystem-walking initial sync that doesn't work in ECS.
**Priority:** 2
**Depends on:** US-001, US-002

**Acceptance Criteria:**
- [ ] Remove/deprecate `performInitialSync()` with `walkDirectory()`
- [ ] Sync flow is client-push only (CLI → API → S3)
- [ ] No server-side code reads local filesystem for sync
- [ ] Existing file-proxy.ts operations unchanged

## Non-Goals

- Browser-based file upload (future feature, not MVP)
- Bidirectional real-time sync (this is initial upload only)
- Sync conflict resolution (initial sync is one-way: local → S3)
- Changing the S3 prefix convention (keep `{clerkUserId}/hq/`)

## Technical Considerations

- **Three channels, one API**: All channels use the same `/api/auth/setup-status` endpoint
- **Client-push model**: Files are uploaded by the client (CLI), not pulled by the server
- **S3 prefix provisioning**: Must happen at auth time, before any sync attempt
- **Backward compatibility**: Existing users with files already in S3 must not be disrupted
- **Body size limits**: Fastify default is ~1MB; need to increase for upload route or use presigned URLs

## Open Questions

- Should we implement presigned URL uploads for large files (>10MB) in this project or defer?
- Should the web UI eventually support drag-and-drop browser upload?

# Plan: Per-User Settings in MongoDB + Onboarding

## Problem
`hqDir` is a global env var (`HQ_DIR`). Every user gets the same HQ directory.
This needs to be per-user, stored in MongoDB, and configured during onboarding.
Also: notification settings currently have no backend persistence.

## Architecture

**MongoDB Atlas** → `hq-cloud` database → 2 collections:
- `users` — per-user settings (hqDir, notifications, createdAt, etc.)
- (extensible for future collections)

**New env var:** `MONGODB_URI` (Atlas connection string) replaces `HQ_DIR`.

## Schema: `users` collection

```typescript
interface UserSettings {
  clerkUserId: string;       // from request.user.userId (unique index)
  hqDir: string;             // e.g. "C:\\hq" or "/home/user/hq"
  notifications: {
    enabled: boolean;
    questionsEnabled: boolean;
    permissionsEnabled: boolean;
    statusUpdatesEnabled: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
}
```

## Changes

### 1. API — Add MongoDB connection (`api/src/db/mongo.ts`)
- New file: connect/disconnect, get `Db` instance
- `MONGODB_URI` env var in config.ts (required in prod, optional in dev)
- Connect in `index.ts` startup, disconnect on shutdown
- Add `mongodb` driver to api/package.json

### 2. API — User settings service (`api/src/data/user-settings.ts`)
- `getUserSettings(clerkUserId)` → UserSettings | null
- `createUserSettings(clerkUserId, settings)` → UserSettings
- `updateUserSettings(clerkUserId, partial)` → UserSettings
- `isOnboarded(clerkUserId)` → boolean (has hqDir set)
- Uses `users` collection from mongo.ts

### 3. API — Settings routes (`api/src/routes/settings.ts`)
- `GET /api/settings` → current user's full settings
- `PUT /api/settings` → update settings (hqDir, notifications, etc.)
- `GET /api/settings/onboarding-status` → `{ onboarded: boolean }`
- `POST /api/settings/setup` → called during onboarding AND by setup agents
  - Accepts `{ hqDir: string }` (plus optional other settings)
  - Creates user record if none exists, or updates hqDir

### 4. API — Replace `config.hqDir` with per-request resolution
Every route that reads `config.hqDir` must now resolve from user settings:
- `routes/navigator.ts` (2 occurrences)
- `routes/workers.ts` (2 occurrences — GET /workers, POST /workers/spawn)
- `workers/spawn-queue.ts` (validateWorkerExists)

**Approach:** Add a helper `getUserHqDir(request)` that:
1. Gets `request.user.userId`
2. Looks up user settings in MongoDB
3. Returns hqDir or throws 403 "Setup required"
4. Falls back to `config.hqDir` when `SKIP_AUTH=true` (tests)

### 5. API — Move notification settings to MongoDB
- `routes/push.ts` or wherever notification settings live → read/write from user-settings service
- The frontend already calls `GET/PUT /api/notifications/settings` — just back those endpoints with MongoDB

### 6. Web — Onboarding page (`web/src/app/(authenticated)/setup/page.tsx`)
- Single-page form asking for HQ directory path
- Input field, explanation text, "Save & Continue" button
- On submit → `POST /api/settings/setup` with `{ hqDir }`
- On success → redirect to `/agents`

### 7. Web — Onboarding redirect guard
- In `AuthContext.tsx` or authenticated layout: after auth, check `GET /api/settings/onboarding-status`
- If `{ onboarded: false }` → redirect to `/setup`
- Cache the result so it doesn't re-check on every navigation
- Skip this check if already on `/setup`

### 8. Web — Account settings page (`web/src/app/(authenticated)/settings/account/page.tsx`)
- Shows current hqDir (editable)
- "Save" button → `PUT /api/settings`
- Link from sidebar (update sidebar Settings to go to `/settings` with sub-nav)

### 9. Web — Settings service (`web/src/services/settings.ts`)
- `fetchSettings()` → GET /api/settings
- `updateSettings(partial)` → PUT /api/settings
- `checkOnboardingStatus()` → GET /api/settings/onboarding-status
- `submitSetup(data)` → POST /api/settings/setup

### 10. Web — Update notification settings to use MongoDB backend
- The notification service already calls `/api/notifications/settings`
- Route those through the same user-settings store in MongoDB
- (Or keep a separate route but back it with the same collection)

### 11. Update sidebar navigation
- Settings link → `/settings/account` (default settings page)
- Add settings layout with sub-nav: Account | Notifications

### 12. Tests
- Unit tests for user-settings service (mock MongoDB)
- Unit tests for settings routes
- Update existing tests that mock `config.hqDir` (they use `SKIP_AUTH` so fall back to env var)
- Integration test: onboarding flow (POST setup, verify GET settings returns hqDir)

## File inventory

**New files:**
- `api/src/db/mongo.ts` — MongoDB connection
- `api/src/data/user-settings.ts` — User settings CRUD
- `api/src/routes/settings.ts` — Settings API routes
- `api/src/__tests__/settings.test.ts` — Settings tests
- `web/src/app/(authenticated)/setup/page.tsx` — Onboarding
- `web/src/app/(authenticated)/settings/account/page.tsx` — Account settings
- `web/src/app/(authenticated)/settings/layout.tsx` — Settings sub-nav
- `web/src/services/settings.ts` — Settings API client
- `web/src/hooks/useOnboarding.ts` — Onboarding status hook
- `web/src/types/settings.ts` — Settings types

**Modified files:**
- `api/package.json` — add `mongodb` dependency
- `api/src/config.ts` — add `mongodbUri`, keep `hqDir` as fallback
- `api/src/index.ts` — connect/disconnect MongoDB on start/shutdown
- `api/src/routes/navigator.ts` — resolve hqDir per-user
- `api/src/routes/workers.ts` — resolve hqDir per-user
- `api/src/workers/spawn-queue.ts` — accept hqDir param instead of config
- `web/src/app/(authenticated)/layout.tsx` — onboarding guard + settings nav
- `web/src/contexts/AuthContext.tsx` — onboarding status check
- Existing tests — update where needed for new behavior

## Order of execution

1. MongoDB connection + config (foundation)
2. User settings service (data layer)
3. Settings routes (API)
4. Helper to resolve per-user hqDir
5. Update navigator/workers/spawn-queue to use per-user hqDir
6. Web settings service + types
7. Onboarding page + redirect guard
8. Account settings page + settings layout
9. Move notification settings to MongoDB
10. Tests

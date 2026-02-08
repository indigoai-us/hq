# Browserbase Integration

Cloud browser execution for E2E tests via [Browserbase](https://browserbase.com).

## Overview

Browserbase provides headless browser infrastructure in the cloud, eliminating the need for local browser resources. Key benefits:

- **No local browsers needed** - Tests run entirely in the cloud
- **Parallel execution** - Run multiple browser sessions simultaneously
- **Session recordings** - Video replays for debugging failed tests
- **Consistent environment** - Same browser version across all runs

## Setup

### 1. Create Browserbase Account

1. Sign up at [browserbase.com](https://browserbase.com)
2. Get your API key from the Overview Dashboard
3. Get your Project ID from the Overview Dashboard

### 2. Configure GitHub Secrets

Add these secrets to your GitHub repository:

```
BROWSERBASE_API_KEY=bb_...
BROWSERBASE_PROJECT_ID=prj_...
```

**Settings > Secrets and variables > Actions > New repository secret**

### 3. Local Development

For local testing with Browserbase:

```bash
# Set environment variables
export BROWSERBASE_API_KEY=bb_...
export BROWSERBASE_PROJECT_ID=prj_...

# Run tests via Browserbase
cd tests/e2e
npm run test:browserbase
```

For local-only testing (no cloud):

```bash
npm run test:local
```

## How It Works

### Execution Modes

The test suite supports two execution modes:

| Mode | Trigger | Use Case |
|------|---------|----------|
| **Browserbase** | `BROWSERBASE_API_KEY` set | CI/CD, parallel execution, session recordings |
| **Local** | No credentials or `USE_BROWSERBASE=false` | Development, debugging |

### Configuration Flow

1. Playwright config checks for `BROWSERBASE_API_KEY` and `BROWSERBASE_PROJECT_ID`
2. If present and `USE_BROWSERBASE` != 'false', uses Browserbase
3. Creates session via Browserbase SDK
4. Connects via Chrome DevTools Protocol (CDP)
5. Tests execute in cloud browser
6. Session recording available in Browserbase dashboard

### Fallback Behavior

If Browserbase connection fails:
- SDK not installed -> Falls back to local Playwright
- API key invalid -> Falls back to local Playwright
- Session creation fails -> Falls back to local Playwright
- CDP connection fails -> Falls back to local Playwright

This ensures tests never break due to Browserbase issues.

## Session Recordings

After tests complete, view session recordings at:

```
https://browserbase.com/sessions/{sessionId}
```

Session IDs are:
- Logged to console during test execution
- Included in GitHub Actions step summary
- Available in Browserbase dashboard under project

### Finding Sessions

1. Go to [Browserbase Dashboard](https://browserbase.com)
2. Select your project
3. View recent sessions with:
   - Recording playback
   - Network requests
   - Console logs
   - Screenshots

## Parallel Execution

### Concurrency Limits

Browserbase limits concurrent sessions based on plan:

| Plan | Max Concurrent Sessions |
|------|------------------------|
| Free | 5 |
| Developer | 25 |
| Team | 50+ |

### Configuration

In `playwright.config.ts`:

```typescript
workers: useBrowserbase ? 4 : undefined,
```

Adjust `workers` based on your Browserbase plan's concurrency limit.

### Rate Limits

- **Session creation**: Max 25 sessions per 60 seconds (Developer plan)
- **Each session**: Minimum 1 minute runtime, even if closed early

If rate limited, you'll see HTTP 429 errors. Solutions:
- Reduce parallel workers
- Close sessions explicitly (don't let them timeout)
- Upgrade plan for higher limits

## GitHub Actions Integration

The E2E workflow automatically detects Browserbase configuration:

```yaml
- name: Run Playwright tests
  env:
    BROWSERBASE_API_KEY: ${{ secrets.BROWSERBASE_API_KEY }}
    BROWSERBASE_PROJECT_ID: ${{ secrets.BROWSERBASE_PROJECT_ID }}
    USE_BROWSERBASE: ${{ steps.mode.outputs.mode == 'browserbase' && 'true' || 'false' }}
```

### Manual Override

Force local execution in workflow dispatch:

1. Go to Actions > E2E Tests > Run workflow
2. Set "Use Browserbase" to false
3. Tests run with local Playwright

## Debugging

### View Test Execution

1. Check GitHub Actions step summary for execution mode
2. For Browserbase runs, check dashboard for session recordings
3. Download `e2e-failures` artifact for screenshots/traces

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Tests fail with CDP error | Browserbase unavailable | Check API key, falls back to local |
| Rate limited (429) | Too many sessions | Reduce workers, wait, or upgrade plan |
| Tests slower than expected | Network latency to cloud | Normal - cloud execution adds ~2-3s per test |

## Files

| Path | Purpose |
|------|---------|
| `tests/e2e/fixtures/browserbase.ts` | Custom fixture for Browserbase connection |
| `tests/e2e/playwright.config.ts` | Playwright config with Browserbase detection |
| `.github/workflows/e2e.yml` | GitHub Actions workflow |

## References

- [Browserbase Documentation](https://docs.browserbase.com)
- [Browserbase + Playwright Guide](https://docs.browserbase.com/introduction/playwright)
- [Concurrency & Rate Limits](https://docs.browserbase.com/guides/concurrency-rate-limits)

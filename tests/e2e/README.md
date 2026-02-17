# HQ Cloud E2E Smoke Tests

End-to-end smoke tests that validate the live HQ Cloud API.

## cloud-smoke.sh

Validates the full API flow: health, auth, settings, file upload/list/download, quota, and sync.

### Prerequisites

- **bash** (Git Bash on Windows, or native on Linux/macOS)
- **curl**
- **jq** (`choco install jq` on Windows, `brew install jq` on macOS)
- A valid auth token (CLI token or Clerk JWT)

### Getting a Token

**Option 1: CLI Token (recommended for CI)**

Generate a CLI token via the web app or API:

```bash
# If you have a Clerk JWT, exchange it for a CLI token:
curl -X POST https://api.hq.getindigo.ai/api/auth/cli-token \
  -H "Authorization: Bearer $CLERK_JWT" \
  -H "Content-Type: application/json"
```

CLI tokens start with `hqcli_` and are valid for 30 days.

**Option 2: Clerk JWT**

Get a session token from the Clerk dashboard or browser dev tools.
These are short-lived (typically 60 seconds).

### Running

```bash
# Against the live ALB endpoint (default)
TOKEN=hqcli_xxx bash tests/e2e/cloud-smoke.sh

# Against a custom URL (e.g., local dev)
TOKEN=hqcli_xxx API_URL=http://localhost:3001 bash tests/e2e/cloud-smoke.sh

# With verbose output
TOKEN=hqcli_xxx VERBOSE=true bash tests/e2e/cloud-smoke.sh

# Skip cleanup (leave test files in S3)
TOKEN=hqcli_xxx CLEANUP=false bash tests/e2e/cloud-smoke.sh
```

### Environment Variables

| Variable  | Required | Default | Description |
|-----------|----------|---------|-------------|
| `TOKEN`   | Yes      | -       | Bearer token (CLI token or Clerk JWT) |
| `API_URL` | No       | ALB endpoint | Base URL for the API |
| `VERBOSE` | No       | `false` | Show curl request/response details |
| `CLEANUP` | No       | `true`  | Clean up test files after run |

### Test Steps

1. **Health Check** - GET /api/health, /api/health/ready, /api/health/live (unauthenticated)
2. **Authentication** - GET /api/auth/me, /api/auth/cli-verify
3. **Settings** - GET /api/settings, /api/settings/onboarding-status
4. **File Upload** - POST /api/files/upload (small test file)
5. **File List** - GET /api/files/list (verify uploaded file appears)
6. **File Download** - GET /api/files/download (verify content matches)
7. **File Quota** - GET /api/files/quota
8. **Sync Diff** - POST /api/files/sync (empty manifest)
9. **Sync Status** - GET /api/sync/status

### CI Usage

```yaml
# GitHub Actions example
- name: E2E Smoke Test
  env:
    TOKEN: ${{ secrets.HQ_CLOUD_CLI_TOKEN }}
    API_URL: http://hq-cloud-api-dev-1008856793.us-east-1.elb.amazonaws.com
  run: bash tests/e2e/cloud-smoke.sh
```

### Exit Codes

- `0` - All tests passed
- `1` - One or more tests failed

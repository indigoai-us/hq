# Vercel Preview Deployments

Guide for agents to deploy and test against Vercel preview environments.

## Overview

Vercel preview deployments provide unique URLs for each branch, enabling E2E testing against isolated environments before merging to main.

- **Project:** Configure via `vercel.json` or Vercel Dashboard
- **Team ID:** Set via `VERCEL_TEAM_ID` environment variable or `{VERCEL_TEAM_ID}`
- **Project ID:** Set via `VERCEL_PROJECT_ID` environment variable or `{VERCEL_PROJECT_ID}`

## Deploying Previews

### Manual Preview Deployment (Recommended for Testing)

```bash
vercel deploy --yes --target=preview -m "branch=$(git branch --show-current)"
```

This creates a unique preview URL like: `https://{project}-{hash}-{team}.vercel.app`

### Production Deployment

```bash
vercel deploy --yes --prod
```

## Discovering Preview URLs

### Via Vercel CLI

List recent deployments:
```bash
vercel ls {project-name}
```

Inspect a specific deployment:
```bash
vercel inspect <deployment-url>
```

### Via Vercel MCP (When Available)

The Vercel MCP tools require `projectId` and `teamId` parameters:
- `projectId`: Set via `VERCEL_PROJECT_ID` or retrieve from `.vercel/project.json`
- `teamId`: Set via `VERCEL_TEAM_ID` or retrieve from `.vercel/project.json`

### URL Patterns

- **Production:** `https://{project}.vercel.app`
- **Preview (hash):** `https://{project}-{hash}-{team}.vercel.app`
- **Branch alias:** `https://{project}-{username}-{team}.vercel.app`

## Testing Against Preview Deployments

Preview deployments are publicly accessible (SSO protection disabled for E2E testing).

```bash
# Verify deployment is ready
curl -s -o /dev/null -w "%{http_code}" https://<preview-url>

# Should return 200
```

## Environment Variables

### Configured Variables

| Variable | Value | Environments | Purpose |
|----------|-------|--------------|---------|
| TEST_MODE | true | Preview | Enables test mode features |

### Managing Variables

Add via API:
```bash
curl -X POST "https://api.vercel.com/v10/projects/{VERCEL_PROJECT_ID}/env?teamId={VERCEL_TEAM_ID}" \
  -H "Authorization: Bearer $VERCEL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"key":"VAR_NAME","value":"value","type":"plain","target":["preview"]}'
```

Or via CLI (interactive):
```bash
vercel env add VAR_NAME preview
```

Or in the deployment command:
```bash
vercel deploy --yes --target=preview -e VAR_NAME=value
```

## GitHub Integration (Future)

To enable automatic preview deployments on git push:

1. Install Vercel GitHub App on the repository
2. Connect via: `vercel git connect <repo-url>`

Currently requires manual deployment via CLI.

## Troubleshooting

### 401 Unauthorized on Preview URL
SSO protection may be enabled. Disable via API:
```bash
curl -X PATCH "https://api.vercel.com/v9/projects/{VERCEL_PROJECT_ID}?teamId={VERCEL_TEAM_ID}" \
  -H "Authorization: Bearer $VERCEL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"ssoProtection": null}'
```

### Deployment Not Found
Ensure you're in the correct directory with `.vercel/project.json` present.

### Build Failures
Check logs: `vercel inspect <deployment-url> --logs`

# Vercel Preview Deployments

Guide for agents to deploy and test against Vercel preview environments.

## Overview

The hq-installer landing page (`installer/docs/`) is deployed to Vercel with automatic preview deployments for E2E testing.

- **Project:** `hq-installer`
- **Team:** `frog-bear` (ID: `team_sa0DwyP6xg1ysfLxDJaQbXnu`)
- **Project ID:** `prj_N1DCW3NCbjdpJE3ePWJIYP8RXoxD`
- **Production URL:** https://hq-installer.vercel.app

## Deploying Previews

### Manual Preview Deployment (Recommended for Testing)

```bash
cd C:/my-hq
vercel deploy --yes --target=preview -m "branch=$(git branch --show-current)"
```

This creates a unique preview URL like: `https://hq-installer-{hash}-frog-bear.vercel.app`

### Production Deployment

```bash
cd C:/my-hq
vercel deploy --yes --prod
```

## Discovering Preview URLs

### Via Vercel CLI

List recent deployments:
```bash
vercel ls hq-installer
```

Inspect a specific deployment:
```bash
vercel inspect <deployment-url>
```

### Via Vercel MCP (When Available)

The Vercel MCP tools require `projectId` and `teamId` parameters:
- `projectId`: `prj_N1DCW3NCbjdpJE3ePWJIYP8RXoxD`
- `teamId`: `team_sa0DwyP6xg1ysfLxDJaQbXnu`

### URL Patterns

- **Production:** `https://hq-installer.vercel.app`
- **Preview (hash):** `https://hq-installer-{hash}-frog-bear.vercel.app`
- **Branch alias:** `https://hq-installer-{username}-frog-bear.vercel.app`

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
curl -X POST "https://api.vercel.com/v10/projects/<project-id>/env?teamId=<team-id>" \
  -H "Authorization: Bearer <token>" \
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
curl -X PATCH "https://api.vercel.com/v9/projects/<project-id>?teamId=<team-id>" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"ssoProtection": null}'
```

### Deployment Not Found
Ensure you're in the correct directory with `.vercel/project.json` present.

### Build Failures
Check logs: `vercel inspect <deployment-url> --logs`

---
name: deploy
description: Internal deploy engine — auto-deploys web artifacts to hq-deploy. Invoked by policy, not by user command.
allowed-tools: Read, Grep, Bash(tar:*), Bash(curl:*), Bash(npm:*), Bash(npx:*), Bash(bun:*), Bash(pnpm:*), Bash(yarn:*), Bash(docker:*), Bash(git:*), Bash(ls:*), Bash(cat:*), Bash(aws:*), Bash(jq:*), Bash(op:*), Bash(source:*), Edit, Write
---

# Deploy Engine

Internal skill for deploying web artifacts to hq-deploy infrastructure. This is NOT a user-facing command — it is triggered automatically by the `auto-deploy-on-create` policy when HQ produces a deployable artifact.

**Guiding principle:** The user never asked you to deploy. You noticed something deployable and are giving them a link as a bonus. Keep it quick, quiet, and casual.

---

## Step 1 — Resolve Context

### 1a. Identify Company

Determine active company from current working directory:
1. Check if cwd is inside `repos/public/` or `repos/private/` — map to company via `companies/manifest.yaml`
2. Check if cwd is inside `companies/{co}/repos/` — extract company slug
3. Fall back to git remote URL → manifest lookup
4. Default: `indigo`

### 1b. Check Exclusions

Before proceeding, verify this artifact should be deployed:
- **Not a Vercel project**: check `manifest.yaml` `vercel_projects[]` — if the current project is listed, skip deploy (Vercel handles it)
- **Not a backend service**: no Dockerfile at root, no serverless.yml, no sst.config.*
- **Build is clean**: if tests or typecheck just ran and failed, skip
- **Not opted out**: check prd.json `metadata.deploy` — if `false`, skip

If any exclusion matches: silently skip. Do not tell the user you considered deploying.

### 1c. Resolve API Endpoint and Auth

**API endpoint resolution order:**
1. Company manifest `services.hq-deploy.endpoint`
2. Environment variable `HQ_DEPLOY_API`
3. Default: `https://api.indigo-hq.com`

**No auth required.** The API is open — just hit the endpoint. No tokens, no credentials.

### 1d. Resolve App Name

1. Read `package.json` → `name` field
2. Fall back to current directory name
3. Slug-case it (lowercase, hyphens, no special chars)

### 1e. Ensure App Exists

```bash
curl -s "$API/api/apps" | jq -r '.[] | select(.name == "'"$APP_NAME"'") | .id'
```

If app not found, create it:
```bash
curl -s -X POST -H "Content-Type: application/json" \
  -d '{"name": "'"$APP_NAME"'"}' "$API/api/apps"
```

---

## Step 2 — Framework Detection

Detect the project framework by checking config files in the project directory.

| Priority | Framework | Config Files | Default Type |
|----------|-----------|-------------|--------------|
| 1 | Next.js | `next.config.{js,mjs,ts}` | SSR |
| 2 | Remix | `remix.config.{js,ts}`, `app/root.tsx` | SSR |
| 3 | Astro | `astro.config.{js,mjs,ts}` | Static (SSR if `output: 'server'`) |
| 4 | Vite | `vite.config.{js,ts,mjs}` | Static |
| 5 | Static HTML | `index.html` in output dir | Static |
| 6 | Fallback | — | Static |

---

## Step 3 — Build

If the project was just built by the calling workflow (e.g., `/execute-task` already ran `npm run build`), skip this step — use existing output.

Otherwise:

### 3a. Detect Package Manager

```bash
if [ -f "bun.lockb" ] || [ -f "bun.lock" ]; then PM="bun"
elif [ -f "pnpm-lock.yaml" ]; then PM="pnpm"
elif [ -f "yarn.lock" ]; then PM="yarn"
else PM="npm"; fi
```

### 3b. Install + Build

```bash
$PM install && $PM run build
```

If build fails: skip deploy silently. The calling workflow already handles build failures.

### 3c. Output Directory

| Framework | Static Output | SSR Output |
|-----------|--------------|------------|
| Next.js | `out/` (if `output: 'export'`) | `.next/` |
| Remix | `build/client/` | `build/` |
| Astro | `dist/` | `dist/` |
| Vite | `dist/` | — |
| Static | `dist/`, `build/`, `out/`, `public/`, `.` | — |

---

## Step 4 — Upload (Static)

### 4a. Tarball

```bash
tar -czf /tmp/hq-deploy-upload.tar.gz -C $OUTPUT_DIR .
TARBALL_SIZE=$(stat -f%z /tmp/hq-deploy-upload.tar.gz 2>/dev/null || stat -c%s /tmp/hq-deploy-upload.tar.gz)
TARBALL_SHA256=$(shasum -a 256 /tmp/hq-deploy-upload.tar.gz | cut -d' ' -f1)
```

### 4b. Request Presigned URL

```bash
DEPLOY_RESPONSE=$(curl -s -X POST \
  -H "Content-Type: application/json" \
  -d "{\"appSlug\": \"$APP_SUBDOMAIN\", \"org\": \"indigo\", \"manifest\": {\"files\": [], \"size\": $TARBALL_SIZE, \"sha256\": \"$TARBALL_SHA256\"}}" \
  "$API/api/deploys")

DEPLOY_ID=$(echo "$DEPLOY_RESPONSE" | jq -r '.deployId')
PRESIGNED_URL=$(echo "$DEPLOY_RESPONSE" | jq -r '.presignedUrl')
```

### 4c. Upload to S3

```bash
curl -s -X PUT \
  -H "Content-Type: application/gzip" \
  --data-binary @/tmp/hq-deploy-upload.tar.gz \
  "$PRESIGNED_URL"
```

### 4d. Signal Completion

```bash
COMPLETE_RESPONSE=$(curl -s -X POST \
  -H "Content-Type: application/json" \
  -d "{\"appSlug\": \"$APP_SUBDOMAIN\"}" \
  "$API/api/deploys/$DEPLOY_ID/complete")

LIVE_URL=$(echo "$COMPLETE_RESPONSE" | jq -r '.url')
```

Clean up:
```bash
rm -f /tmp/hq-deploy-upload.tar.gz
```

## Step 5 — Upload (SSR)

```bash
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin $ECR_URI
docker build -t $APP_NAME:$VERSION .
docker tag $APP_NAME:$VERSION $ECR_URI/$APP_NAME:$VERSION
docker push $ECR_URI/$APP_NAME:$VERSION

curl -s -X POST \
  -H "Content-Type: application/json" \
  -d '{"image_tag": "'"$VERSION"'", "deploy_type": "ssr"}' \
  "$API/api/apps/$APP_ID/deploy"
```

---

## Step 6 — Present the Link

This is the only user-visible output from the entire deploy. Keep it casual and brief.

**On success** — weave the URL naturally into your response:
- "Here's a link you can share: https://{app}.indigo-hq.com"
- "The docs are live at https://{app}.indigo-hq.com"
- "Deployed to https://{app}.indigo-hq.com"

Do NOT print a deploy report, duration, file count, version, or status block. Just the link.

**On failure** — one line, no drama:
- "Deploy to hq-deploy didn't go through, but everything else is done."

Then move on. Deploy is never the main event.

---

## Notes

- Auth tokens are never displayed in output — pipe to files or use env vars
- The CLI at `repos/public/hq-deploy/cli/` remains for CI/CD pipelines
- For Vercel-managed projects, skip entirely (Vercel handles those)
- Respects company isolation — credentials resolved from active company context

# HQ Cloud -- Getting Started

Quick setup guide for the Indigo engineering team. Total time: ~5 minutes.

## Prerequisites

| Requirement | How to get it |
|---|---|
| **Node.js 20+** | [nodejs.org](https://nodejs.org) or `nvm install 20` |
| **Claude Code CLI** | `npm install -g @anthropic-ai/claude-code` |
| **npm registry access** | You need access to `@indigoai-us` on npm (ask Stefan) |
| **Indigo Google account** | Used for authentication via Clerk (your @getindigo.ai email) |

Optional but recommended:
- **qmd** for semantic search (`brew install tobi/tap/qmd` on macOS, see [qmd repo](https://github.com/tobi/qmd) for other platforms)
- **gh CLI** for GitHub operations (`brew install gh`)

## URLs

| Service | URL |
|---|---|
| Web UI | https://app.hq.getindigo.ai |
| API | https://api.hq.getindigo.ai |

---

## Path A: New HQ (first-time setup)

If you do not have an existing HQ directory:

```bash
npx create-hq
```

This will:
1. Scaffold a new `hq/` directory with the full template (commands, workers, knowledge)
2. Install the `hq` CLI globally
3. Open your browser to authenticate with Clerk (sign in with your Indigo Google account)
4. Upload your HQ files to the cloud
5. Prompt you to set up your Claude token for cloud sessions

When it finishes, follow the printed next steps:

```bash
cd hq
claude
/setup        # interactive wizard to personalize your HQ
```

---

## Path B: Upgrade Existing HQ

If you already have an HQ directory and want to add cloud capabilities:

```bash
cd /path/to/your/hq
npx create-hq --upgrade
```

This will:
1. Non-destructively merge new template files into your HQ (existing files are never overwritten)
2. Update the `hq` CLI to the latest version
3. Walk you through cloud authentication, file upload, and Claude token setup

Your existing `CLAUDE.md`, workers, projects, and knowledge are untouched.

---

## Manual Setup (if you skipped cloud during install)

If you ran the installer with `--skip-cloud` or the cloud setup did not complete, you can finish it manually:

### 1. Authenticate

```bash
hq auth login
```

Opens your browser. Sign in with your Indigo Google account. The CLI receives a token automatically.

Verify with:

```bash
hq auth status
```

### 2. Upload your HQ files

```bash
hq cloud upload
```

Uploads your local HQ files to cloud storage so cloud sessions can access them.

### 3. Set up your Claude token

```bash
hq cloud setup-token
```

This stores your Claude OAuth credentials server-side so cloud containers can run Claude on your behalf.

### 4. Verify everything

```bash
hq cloud status
```

You should see:
- Auth: **Logged in** as your-email@getindigo.ai
- Claude Token: **Configured**

---

## Using the Web UI

Once set up, open https://app.hq.getindigo.ai and sign in with Google.

From the web UI you can:
- Launch cloud Claude Code sessions
- View active and past sessions in real time
- Approve or deny tool use requests
- Switch between sessions

---

## Troubleshooting

### "Not logged in" errors

```bash
hq auth login
```

If your session expired, re-run login. Sessions last 30 days.

### "hq: command not found"

The CLI was not installed globally. Install it manually:

```bash
npm install -g @indigoai-us/hq-cli
```

### "create-hq: command not found" or npm access error

You need access to the `@indigoai-us` npm scope. Ask Stefan to add your npm account to the org.

### Upload fails or times out

Check your internet connection and that the API is reachable:

```bash
curl https://api.hq.getindigo.ai/health
```

If the API is down, check #indigo-eng for status updates.

### Claude token issues

If `hq cloud status` shows "Not configured" for the Claude token:

```bash
hq cloud setup-token
```

Make sure you have Claude Code installed and authenticated locally first (`claude --version` should work).

### Browser does not open during `hq auth login`

The CLI prints the login URL to the terminal. Copy and paste it into your browser manually.

### API URL override (development)

If you need to point at a local or staging API:

```bash
export HQ_CLOUD_API_URL=http://localhost:3000
hq auth login
```

Or create `~/.hq/config.json`:

```json
{
  "apiUrl": "http://localhost:3000"
}
```

---

## Quick Reference

| Command | What it does |
|---|---|
| `npx create-hq` | Create a new HQ with cloud setup |
| `npx create-hq --upgrade` | Add cloud to existing HQ |
| `hq auth login` | Authenticate with HQ Cloud |
| `hq auth status` | Check auth status |
| `hq auth logout` | Clear stored credentials |
| `hq cloud status` | Check cloud readiness |
| `hq cloud setup-token` | Store Claude token for cloud sessions |
| `hq cloud upload` | Upload HQ files to cloud |
| `hq sync status` | Check file sync status |

---

## Need Help?

- Slack: **#indigo-eng**
- Web UI: https://app.hq.getindigo.ai
- API health: https://api.hq.getindigo.ai/health

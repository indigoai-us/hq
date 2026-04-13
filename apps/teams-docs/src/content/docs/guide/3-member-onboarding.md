---
title: Member Onboarding
description: Accept a team invite and set up your HQ with shared team content.
---

## What you'll receive

Your admin will send you an invite message (via email, Slack, or text) containing:

1. A link to accept a **GitHub organization invite**
2. Instructions to install **Node.js** (if you don't have it)
3. A command to run: `npx create-hq --invite hq_<token>`

## Step 1: Accept the GitHub org invite

Check your email for an invitation from GitHub. Click **"Join @org-name"** to accept.

If you don't have a GitHub account yet, GitHub will guide you through creating one first — then accepting the invite.

## Step 2: Install Node.js (if needed)

**Mac:**
```bash
brew install node
```

**Windows (PowerShell as Administrator):**
```powershell
winget install OpenJS.NodeJS.LTS
```

**Or download from:** [nodejs.org](https://nodejs.org)

## Step 3: Run the installer

```bash
npx create-hq --invite hq_<your-token-here>
```

Paste the full token from your invite message. The `--invite` flag skips the setup wizard and goes straight to the join flow.

### What happens next

1. **GitHub sign-in** — a browser window opens for you to authorize the hq-team-sync app. Enter the code shown in your terminal.

2. **Access check** — the installer verifies you've accepted the org invite and can access the team repo. If your invite is still pending, it gives you 3 chances to accept it.

3. **Clone** — the team repo is cloned into `companies/{slug}/` inside your new HQ.

4. **Setup complete** — your HQ is ready with the team workspace.

```
┌────────────────────────────────────────────────┐
│  All done! Your HQ is ready.                   │
├────────────────────────────────────────────────┤
│                                                │
│  1 team joined:                                │
│  ✓ Indigo → companies/indigo/                  │
│                                                │
│  Get started:                                  │
│    cd hq                                       │
│    claude                                      │
│    /setup  ← personalize your HQ               │
│                                                │
└────────────────────────────────────────────────┘
```

## Step 4: Start using HQ

```bash
cd hq
claude
```

Run `/setup` to personalize your profile, then you're ready to work with your team's shared content.

## Joining without a token

If you don't have an invite token but your admin has added you to the GitHub org, you can run:

```bash
npx create-hq
```

Choose **"Do you have an HQ Teams account?"** → Yes. The installer will auto-discover teams by scanning GitHub App installations for `hq-*` repos you have access to.

## Multiple teams

HQ supports multiple teams. Each team gets its own `companies/{slug}/` directory. If you're invited to additional teams later, run:

```bash
npx create-hq --invite hq_<new-token>
```

The new team is added alongside your existing ones.

## Syncing team content

To pull the latest changes from your team:

```bash
cd ~/hq/companies/{slug}
git pull
```

A dedicated sync command is coming soon.

## Troubleshooting

### "Repository not found" during clone

Your GitHub org invite may still be pending. Check your email for the invite from GitHub, accept it, then press Enter in the installer to retry.

### "Invalid invite code"

Make sure you copied the full token including the `hq_` prefix. The token is a single string with no spaces.

### Device flow times out

The GitHub authorization code expires after 15 minutes. If it times out, run the installer again — you'll get a fresh code.

### Already have an HQ

If you already have a personal HQ and want to add a team to it, the `--invite` flag currently creates a new HQ. To add the team to an existing HQ, clone the repo manually:

```bash
cd ~/hq/companies
git clone https://github.com/{org}/hq-{slug}.git {slug}
```

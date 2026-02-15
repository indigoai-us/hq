# HIAMP Manual Integration Testing Guide

This document describes how to perform manual end-to-end verification of the HIAMP protocol using a real Slack workspace.

## Prerequisites

### 1. Slack Workspace Setup

1. Create a dedicated Slack workspace for testing (or use an existing dev workspace)
2. Create a channel named `#hq-interagent` for HIAMP protocol messages
3. Note the workspace ID (found in Slack admin settings under "About This Workspace")

### 2. Create Two Slack Apps

You need two separate Slack apps to simulate two HQ instances:

**App 1: "HQ Stefan"**
- Go to https://api.slack.com/apps and click "Create New App"
- Choose "From scratch", name it "HQ Stefan", select your workspace
- Under "OAuth & Permissions", add these Bot Token Scopes:
  - `chat:write` - Post messages
  - `channels:read` - View channels
  - `channels:history` - Read message history
  - `im:write` - Open DMs
- Install the app to the workspace
- Copy the Bot User OAuth Token (starts with `xoxb-`)
- Note the App ID and Bot User ID

**App 2: "HQ Alex"**
- Repeat the same process with name "HQ Alex"
- Copy its Bot User OAuth Token, App ID, and Bot User ID

### 3. Invite Both Bots to the Channel

In `#hq-interagent`, run:
```
/invite @HQ Stefan
/invite @HQ Alex
```

### 4. Create HIAMP Config Files

Create `hiamp-stefan.yaml`:
```yaml
identity:
  owner: stefan
  instance-id: stefan-hq-test
  display-name: Stefan

peers:
  - owner: alex
    display-name: Alex
    slack-bot-id: <ALEX_BOT_USER_ID>
    trust-level: channel-scoped
    workers:
      - id: backend-dev
        description: Backend developer

slack:
  bot-token: $STEFAN_SLACK_BOT_TOKEN
  app-id: <STEFAN_APP_ID>
  workspace-id: <WORKSPACE_ID>
  channel-strategy: dedicated
  channels:
    dedicated:
      name: "#hq-interagent"
      id: <CHANNEL_ID>
  event-mode: socket

worker-permissions:
  default: allow
  workers:
    - id: architect
      send: true
      receive: true
      allowed-peers: ["*"]

settings:
  enabled: true
  inbox-path: workspace/inbox
  thread-log-path: workspace/threads/hiamp
```

Create `hiamp-alex.yaml` similarly with Alex's credentials and Stefan as peer.

### 5. Set Environment Variables

```bash
export STEFAN_SLACK_BOT_TOKEN=xoxb-stefan-token-here
export ALEX_SLACK_BOT_TOKEN=xoxb-alex-token-here
```

## Manual Test Procedures

### Test 1: One-Shot Message

**Send from Stefan:**
```bash
npx tsx src/cli.ts send \
  --config hiamp-stefan.yaml \
  --to alex/backend-dev \
  --worker architect \
  --intent handoff \
  --body "The API contract is ready. Please implement the endpoints."
```

**Verify in Slack:**
- Open `#hq-interagent`
- Confirm the message appears with proper formatting:
  - Header: `stefan/architect -> alex/backend-dev`
  - Body text
  - Separator line (15 box-drawing characters)
  - Envelope with `hq-msg:v1 | id:msg-... | ...`

**Check Alex's inbox:**
```bash
npx tsx src/cli.ts inbox \
  --config hiamp-alex.yaml \
  --worker backend-dev
```

### Test 2: Ack Round-Trip

**Send with ack:requested:**
```bash
npx tsx src/cli.ts send \
  --config hiamp-stefan.yaml \
  --to alex/backend-dev \
  --worker architect \
  --intent request \
  --body "Please review PR #42 by EOD." \
  --ack requested
```

**Verify in Slack:**
- Original message appears in `#hq-interagent`
- An auto-ack response appears (either in-thread or as a new message)
- Ack has intent `acknowledge` and `reply-to` pointing to the original message ID

### Test 3: Threaded Conversation

**Message 1 (Stefan):**
```bash
npx tsx src/cli.ts send \
  --config hiamp-stefan.yaml \
  --to alex/backend-dev \
  --worker architect \
  --intent query \
  --body "What is the auth module status?"
```

Note the thread ID from the output.

**Message 2 (Alex, same thread):**
```bash
npx tsx src/cli.ts send \
  --config hiamp-alex.yaml \
  --to stefan/architect \
  --worker backend-dev \
  --intent response \
  --body "80% complete. JWT done, OAuth needs testing." \
  --thread <THREAD_ID_FROM_ABOVE>
```

**Message 3 (Stefan, same thread):**
```bash
npx tsx src/cli.ts send \
  --config hiamp-stefan.yaml \
  --to alex/backend-dev \
  --worker architect \
  --intent query \
  --body "Can you share the OAuth test plan?" \
  --thread <SAME_THREAD_ID>
```

**Verify:**
- All 3 messages share the same thread ID in the envelope
- Reply-to chains are correct
- Thread log files on disk contain all messages

### Test 4: Error - Unknown Worker

**Send to nonexistent worker:**
```bash
npx tsx src/cli.ts send \
  --config hiamp-stefan.yaml \
  --to alex/nonexistent-worker \
  --worker architect \
  --intent handoff \
  --body "This should fail."
```

**Verify:**
- The sender should get a validation error (unknown worker in peer config)
- If bypassed via raw compose, the receiver generates an `error` intent bounce with `ERR_UNKNOWN_RECIPIENT`

### Test 5: Share with Attachment

**Send a share:**
```bash
npx tsx src/cli.ts send \
  --config hiamp-stefan.yaml \
  --to alex/backend-dev \
  --worker architect \
  --intent share \
  --body "Here is the auth config interface." \
  --attach auth-config.ts
```

**Verify:**
- Message appears in Slack with `share` intent
- Alex's inbox shows the message with `attach` field
- If inline attachment format was used, check `workspace/inbox/backend-dev/shared/stefan/` for the staged file

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| "HIAMP subsystem is disabled" | `settings.enabled: false` | Set to `true` in config |
| "Kill switch is active" | `security.kill-switch: true` | Set to `false` |
| "Unknown peer" | Peer not in config | Add peer to `peers` section |
| "Unknown worker" | Worker not in peer's worker list | Add worker to peer config |
| "Permission denied" | Worker permissions restrict sending | Update `worker-permissions` |
| No message in Slack | Bot token invalid or bot not in channel | Verify token and channel membership |
| Rate limited | Too many messages sent | Wait and retry; check rate-limiting config |

## CI vs Manual

The automated tests in `e2e-simulation.test.ts` mock the Slack API and validate the full protocol lifecycle without network calls. They provide confidence that the protocol logic is sound.

Manual testing with real Slack validates:
- Actual Slack API compatibility (message formatting, threading)
- Bot permissions and channel access
- Network reliability and error handling
- Visual message formatting in Slack UI

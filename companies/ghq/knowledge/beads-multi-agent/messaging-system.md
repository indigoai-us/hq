---
title: "Beads Messaging System"
category: beads-multi-agent
tags: ["task-management", "coordination", "agent-loop", "multi-agent", "ephemeral"]
source: "https://github.com/steveyegge/beads/blob/main/docs/messaging.md, https://github.com/beadhub/beadhub, https://beadhub.ai/, https://juanreyero.com/article/ai/beadhub"
confidence: 0.82
created_at: "2026-03-20T00:00:00Z"
updated_at: "2026-03-20T00:00:00Z"
---

Beads' messaging is a first-class issue type enabling inter-agent and human-agent communication via the same Dolt-backed data model as tasks.

## Message Issues

Messages are stored as issues with `type: message`. Key fields:

| Field | Purpose |
|-------|---------|
| `sender` | Originator (resolved via: flag → `BD_ACTOR` → `BEADS_ACTOR` → git config → `$USER` → "unknown") |
| `assignee` | Recipient |
| `title` | Subject line |
| `description` | Message body |
| `status` | `open` = unread, `closed` = read |
| `ephemeral` | `true` = bulk cleanup eligible |

## Threading

Messages chain into conversations via `replies_to` dependencies — the same dependency mechanism used for task blocking:

```bash
bd show msg-123 --thread   # traces dependency chain, renders full conversation
```

Output is indented to show sender, recipient, timestamp, subject, and body at each level.

## Mail Delegation

`bd mail` delegates to an external provider via the `BEADS_MAIL_DELEGATE` env var:

```bash
export BEADS_MAIL_DELEGATE="gt mail"
bd mail send --to agent-b "Review PR"
bd mail inbox
bd mail read msg-123
bd mail reply msg-123 "Done"
```

Useful when a team already uses a mail tool (e.g., `gt` / Graphite) and wants `bd` to act as a thin wrapper.

## Ephemeral vs. Persistent Messages

**Ephemeral** (`ephemeral: true`):
- Not synced to remotes
- Not returned in normal queries
- Bulk-deleted with: `bd cleanup --ephemeral --force` (supports age filters)
- Backed by the Dolt **wisps table** with `dolt_ignore` — so they never enter version history

**Persistent** (default):
- Synced via Dolt remotes like any other issue
- Appear in `bd list`, `bd show`, etc.
- Remain in commit history

## Infra Types and the Wisps Table

`message` is one of six **infra types** (configurable via `types.infra`):

```
agent | rig | role | message | gate | slot
```

All infra-type issues are routed to the Dolt-backed `wisps` table with `dolt_ignore`. This means they are transient by nature: visible to running agents but not committed to version history.

## Event Hooks

Scripts in `.beads/hooks/` fire after create, update, or close events, receiving JSON on stdin. This allows an external orchestrator to react to new messages (e.g., trigger a notification or route to another agent).

## BeadHub: Community Coordination Layer

[BeadHub](https://beadhub.ai/) is a community-built coordination layer (`bdh` CLI) that adds real-time messaging on top of core `bd`:

| Mode | Use Case |
|------|---------|
| **Async mail** | Status updates, review requests, FYI — fire-and-forget |
| **Sync chat** | Blocking asks when a reply is needed before proceeding (60s–5min timeout) |

`bdh` wraps `bd` transparently: all existing `bd` commands work, plus coordination features like live work-claim visibility and advisory file locks.

## Design Principle

Beads treats Beads as the **data plane** (stores messages as issues) and delegates control-plane concerns (routing, delivery, notifications) to an external orchestrator or `BEADS_MAIL_DELEGATE`. This keeps the core lean and composable.

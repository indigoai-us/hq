---
last_updated: 2026-01-27
last_verified: 2026-01-27
verified_by: context-manager
---

# Distributed Tracking Architecture

## Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| Storage | JSON files | PRD, claims, sync log |
| Sync | Git | Push/pull mechanism |
| Commands | Claude slash commands | User interface |
| Validation | JSON Schema | File validation |

## Structure

The project adds a `.hq/` directory to target repos:

```
{target-repo}/
└── .hq/
    ├── prd.json       # Synced PRD with task status
    ├── claims.json    # Task claim tracking
    └── sync-log.json  # Sync history
```

Within my-hq, the relevant files are:

```
my-hq/
├── .claude/commands/
│   └── sync-tasks.md    # Slash command
├── knowledge/
│   └── distributed-tracking/  # Documentation
└── prompts/
    └── pure-ralph-base.md     # Updated with sync rules
```

## Patterns

### Pattern 1: Git-Based Sync

**What:** All synchronization happens via git commit/push/pull rather than direct API calls or real-time sync.

**Where:** Push and pull functions (US-002, US-003)

**Why:** Leverages existing git infrastructure, works offline, provides audit trail, and integrates naturally with developer workflow.

### Pattern 2: Optimistic Claiming

**What:** Claims are advisory rather than enforced locks. A claim indicates intent but doesn't block others.

**Where:** `claims.json` (US-006)

**Why:** Distributed teams can't enforce true locks via git. Advisory claims with expiration (24h default) balance coordination with flexibility.

### Pattern 3: Timestamp-Based Merge

**What:** When local and repo PRDs conflict, the newer `updated_at` timestamp wins on a per-task basis.

**Where:** Conflict merge (US-004)

**Why:** Simple, deterministic merge strategy that doesn't require complex conflict resolution UI.

## Dependencies

### External Services

| Service | Purpose | Credentials |
|---------|---------|-------------|
| Git | Version control and sync | User's existing git credentials |

### Key Libraries

| Library | Version | Purpose |
|---------|---------|---------|
| N/A | - | Uses built-in git and file operations |

## Data Flow

```
[HQ Instance A]                    [Target Repo]                    [HQ Instance B]
      |                                 |                                 |
      | -- git push .hq/ ------------> |                                 |
      |                                 | <-- git pull .hq/ ------------ |
      |                                 |                                 |
      |                            [.hq/prd.json]                        |
      |                            [.hq/claims.json]                     |
      |                                 |                                 |
      | <-- conflict detected -------- | -------- conflict detected --> |
      |                                 |                                 |
      | -- merge & push -------------> | <-- merge & push ------------- |
```

## Configuration

| Variable | Purpose | Required |
|----------|---------|----------|
| `target_repo` | Path to repo being synced | Yes (in PRD) |
| `hq_identifier` | Unique ID for this HQ instance | Yes (for claim attribution) |
| `claim_expiry` | Hours before claims expire | No (default: 24) |

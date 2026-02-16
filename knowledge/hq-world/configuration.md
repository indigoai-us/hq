# HQ World Protocol -- Local Configuration & State

**Version:** 1.0-draft
**Date:** 2026-02-16
**Status:** Draft
**Companion to:** [World Protocol Spec](world-protocol-spec.md), [Manifest Schema](manifest-schema.md), [Peering Ceremony](peering-ceremony.md), [Transfer Protocol](transfer-protocol.md)

---

## Table of Contents

1. [Overview](#1-overview)
2. [File Layout](#2-file-layout)
3. [config/world.yaml -- Schema](#3-configworldyaml--schema)
4. [Identity Section](#4-identity-section)
5. [Connections Section](#5-connections-section)
6. [Preferences Section](#6-preferences-section)
7. [Auto-Approval Rules](#7-auto-approval-rules)
8. [Relationship to config/hiamp.yaml](#8-relationship-to-confighiampyaml)
9. [workspace/world/peers/ -- Peer Manifest Cache](#9-workspaceworldpeers--peer-manifest-cache)
10. [workspace/world/transfers/ -- Transfer Log](#10-workspaceworldtransfers--transfer-log)
11. [workspace/world/inbox/ -- Incoming Transfers](#11-workspaceworldinbox--incoming-transfers)
12. [workspace/world/quarantine/ -- Held Transfers](#12-workspaceworldquarantine--held-transfers)
13. [workspace/world/context/ -- Ephemeral Context](#13-workspaceworldcontext--ephemeral-context)
14. [Auto-Generation from Existing HQ Files](#14-auto-generation-from-existing-hq-files)
15. [JSON Schema for world.yaml Validation](#15-json-schema-for-worldyaml-validation)
- [Appendix A: Transfer Log Entry Schema](#appendix-a-transfer-log-entry-schema)
- [Appendix B: Quick Reference](#appendix-b-quick-reference)

---

## 1. Overview

### 1.1 What This Document Covers

This document specifies the **local configuration and state structure** for an HQ instance's participation in the World Protocol. It defines two concerns:

1. **Configuration** (`config/world.yaml`) -- the operator-authored declaration of identity, peer connections, transport preferences, and trust settings. This is the file the operator edits to configure their World presence.

2. **State** (`workspace/world/`) -- the runtime-managed directory structure where the HQ instance caches peer manifests, logs transfers, stages incoming data, and quarantines suspicious transfers. This directory is managed by the World Protocol implementation, not hand-edited by the operator.

### 1.2 Design Goals

- **Natural alongside existing HQ config.** `config/world.yaml` sits beside `config/hiamp.yaml`. Same directory, same YAML conventions, same identity fields where they overlap.
- **No field duplication with HIAMP.** Identity fields that exist in `config/hiamp.yaml` are referenced by the World config, not re-declared. When both protocols are active, identity MUST be consistent.
- **Config is declarative, state is append-only.** The operator declares intent in `config/world.yaml`. The system maintains state in `workspace/world/`. Config changes take effect immediately; state accumulates over time.
- **Auto-generatable.** A fresh HQ instance can generate a valid `config/world.yaml` from existing files (`agents.md`, `config/hiamp.yaml`, `workers/registry.yaml`, `knowledge/`).

### 1.3 Relationship to Other Documents

| Document | What It Provides | How This Document Uses It |
|----------|-----------------|--------------------------|
| [World Protocol Spec](world-protocol-spec.md) | Identity model, connection states, transfer envelope | This document specifies where those models are stored locally. |
| [Manifest Schema](manifest-schema.md) | Manifest format, auto-generation | The manifest is generated from HQ files and cached for peers in `workspace/world/peers/`. |
| [Peering Ceremony](peering-ceremony.md) | Connection lifecycle, state machine | Connection records in `config/world.yaml` track ceremony progress and state transitions. |
| [Transfer Protocol](transfer-protocol.md) | Transfer envelope, payload types, versioning | Transfer logs in `workspace/world/transfers/` record all transfer activity. |
| [HIAMP Configuration](../agent-protocol/configuration.md) | HIAMP identity, peer directory, Slack config | World config shares identity fields; does not duplicate HIAMP-specific fields (Slack, messaging). |

---

## 2. File Layout

### 2.1 Configuration (Operator-Managed)

```
{HQ_ROOT}/
├── config/
│   ├── hiamp.yaml              # HIAMP messaging config (if HIAMP is active)
│   ├── world.yaml              # World Protocol config (this document)
│   └── manifest.yaml           # Manifest generation config + redaction rules
```

`config/world.yaml` is the primary configuration file. `config/manifest.yaml` is a companion file for manifest generation settings (redaction, manual overrides) -- defined in [Manifest Schema](manifest-schema.md), not this document.

### 2.2 State (System-Managed)

```
{HQ_ROOT}/
├── workspace/
│   └── world/
│       ├── peers/                       # Cached peer manifests
│       │   ├── {owner}/
│       │   │   ├── manifest.yaml        # Peer's latest manifest
│       │   │   └── manifest-history/    # Previous manifest versions
│       │   │       └── manifest-{date}.yaml
│       │   └── {owner}/
│       │       └── manifest.yaml
│       ├── transfers/                   # Transfer event log
│       │   ├── {YYYY-MM-DD}.yaml        # Daily transfer log
│       │   └── ...
│       ├── inbox/                       # Incoming transfers staged for review
│       │   └── {sender}/
│       │       ├── knowledge/
│       │       │   └── {transfer-id}/   # Staged knowledge transfer
│       │       ├── worker-pattern/
│       │       │   └── {pattern-name}/  # Staged worker pattern
│       │       └── context/
│       │           └── {project}/       # Staged context transfer
│       ├── quarantine/                  # Transfers that failed verification
│       │   └── {transfer-id}/
│       │       ├── envelope.yaml
│       │       ├── payload/
│       │       └── error.yaml           # What went wrong
│       └── context/                     # Integrated ephemeral context from peers
│           └── {sender}/
│               └── {project}/
│                   ├── project-brief.md
│                   ├── status.yaml
│                   └── coordination.yaml
```

### 2.3 Ownership Rules

| Path | Who Creates | Who Modifies | Persisted In Git? |
|------|------------|-------------|-------------------|
| `config/world.yaml` | Operator (or auto-gen) | Operator | Yes |
| `config/manifest.yaml` | Operator (or auto-gen) | Operator | Yes |
| `workspace/world/peers/` | System (on connection activation) | System (on manifest refresh) | No (gitignored) |
| `workspace/world/transfers/` | System (on every transfer event) | System (append-only) | No (gitignored) |
| `workspace/world/inbox/` | System (on transfer receipt) | System + Operator (review/integration) | No (gitignored) |
| `workspace/world/quarantine/` | System (on verification failure) | Operator (review/delete) | No (gitignored) |
| `workspace/world/context/` | System (on context integration) | Operator (delete when stale) | No (gitignored) |

The `config/` files are version-controlled (part of the HQ repo). The `workspace/world/` directory is ephemeral/cached state and should be gitignored.

---

## 3. config/world.yaml -- Schema

### 3.1 Top-Level Structure

```yaml
# HQ World Protocol Configuration
# World Protocol: v1
# See: knowledge/hq-world/configuration.md

identity:
  # Who this HQ instance is in the World (Section 4)

connections:
  # Peer connections and their state (Section 5)

preferences:
  # Default settings for World Protocol behavior (Section 6)
```

All three top-level sections are required. An HQ instance with no connections has an empty `connections` list.

### 3.2 Encoding and Conventions

- File encoding: UTF-8
- YAML version: 1.2
- Field naming: lowercase with hyphens (e.g., `trust-level`, `instance-id`) -- consistent with `hiamp.yaml` and `registry.yaml`
- Timestamps: ISO 8601 in UTC with `Z` suffix (e.g., `"2026-02-16T14:30:00Z"`)
- Duration strings: `{number}{unit}` where unit is `d` (days), `h` (hours), or `m` (minutes). Single unit only.
- Identifiers: `[a-z0-9][a-z0-9-]*[a-z0-9]` -- same pattern used throughout HQ and the World Protocol

---

## 4. Identity Section

The `identity` section declares this HQ instance's identity in the World. These fields determine how the instance is addressed, how it appears in peer manifests, and how its transfers are signed.

```yaml
identity:
  owner: stefan                        # Required. Operator's unique name.
  instance-id: stefan-hq-primary       # Required. Globally unique instance ID.
  display-name: "Stefan's HQ"         # Optional. Human-readable label.
  world-version: v1                    # Required. Protocol version.
```

### 4.1 Field Reference

| Field | Required | Format | Description |
|-------|----------|--------|-------------|
| `owner` | Yes | `[a-z0-9][a-z0-9-]*[a-z0-9]` (2-32 chars) | The operator's unique name. Used as the sender identifier in all transfers (`envelope.from`). Must be unique among connected peers. |
| `instance-id` | Yes | `[a-z0-9][a-z0-9-]*[a-z0-9]` (2-64 chars) | Globally unique identifier for this HQ instance. Disambiguates when an operator runs multiple instances (primary, staging, experimental). |
| `display-name` | No | Free-form string (max 128 chars) | Human-readable label. Shown to peers during the peering ceremony and in capability queries. |
| `world-version` | Yes | `v{major}` | The World Protocol version this config conforms to. `v1` for this spec. Used for version negotiation during peering. |

### 4.2 Consistency with HIAMP Identity

When both `config/world.yaml` and `config/hiamp.yaml` exist, the following fields **MUST** be identical:

| HIAMP Field (`config/hiamp.yaml`) | World Field (`config/world.yaml`) | Rule |
|-----------------------------------|-----------------------------------|------|
| `identity.owner` | `identity.owner` | MUST match. Same operator, same namespace. |
| `identity.instance-id` | `identity.instance-id` | MUST match. Same instance. |
| `identity.display-name` | `identity.display-name` | MUST match if both are set. |

The World config adds `identity.world-version`, which has no HIAMP equivalent. HIAMP-specific fields (`slack-bot-id`, etc.) have no World equivalent.

**Validation rule:** Implementations SHOULD validate consistency between the two config files at startup and warn if fields diverge.

### 4.3 Identity Derivation

When auto-generating `config/world.yaml` (see Section 14), the identity block is assembled from existing HQ files:

| Field | Primary Source | Fallback Source |
|-------|---------------|----------------|
| `owner` | `config/hiamp.yaml` `identity.owner` | `agents.md` operator name (lowercased, hyphenated) |
| `instance-id` | `config/hiamp.yaml` `identity.instance-id` | Generated: `{owner}-hq-{random-4}` |
| `display-name` | `config/hiamp.yaml` `identity.display-name` | `agents.md` operator name + `'s HQ` |
| `world-version` | Constant: `v1` | -- |

This means an HQ instance that already has HIAMP configured can join the World with zero manual identity setup.

---

## 5. Connections Section

The `connections` section is the most substantive part of the World config. It records every peer relationship -- active, suspended, proposed, or disconnected.

```yaml
connections:
  - peer: alex
    instance-id: alex-hq-primary
    display-name: "Alex's HQ"
    status: active
    trust-level: verified
    transport: file
    transport-config:
      export-path: ~/hq-exports/alex/
      import-path: ~/hq-imports/alex/
    proposal-id: prop-7f3e2d1c
    connected-at: "2026-02-16T11:00:00Z"
    approved-at: "2026-02-16T11:00:00Z"
    approved-by: stefan
    manifest-last-refreshed: "2026-02-16T11:00:00Z"
    manifest-refresh-interval: 7d
    auto-approve: []
    notes: "hq-cloud project collaboration"
```

### 5.1 Connection Record Fields

| Field | Required | Format | Description |
|-------|----------|--------|-------------|
| `peer` | Yes | Owner name (2-32 chars) | The connected peer's `owner` name. Primary key for the connection record. |
| `instance-id` | Yes | Instance-id format (2-64 chars) | The peer's HQ instance identifier. Set during manifest exchange. |
| `display-name` | No | String (max 128 chars) | Human-readable name for the peer. From the peer's manifest. |
| `status` | Yes | `proposed` \| `pending` \| `active` \| `suspended` \| `disconnected` \| `rejected` \| `expired` | Current connection state. See [Peering Ceremony](peering-ceremony.md), Section 3. |
| `trust-level` | Yes | `open` \| `verified` \| `trusted` | Trust level for this peer. Governs how incoming transfers are handled. |
| `transport` | Yes | `file` \| `git` \| `http` \| `hiamp` | Default transport for sending transfers to this peer. |
| `transport-config` | No | Object | Transport-specific settings. Structure depends on transport type. |
| `proposal-id` | Yes | `prop-{8-hex-chars}` | The ID of the proposal that initiated this connection. Links to the peering ceremony record. |
| `connected-at` | No | ISO 8601 datetime (UTC) | When the connection became active. Null for connections not yet active. |
| `approved-at` | No | ISO 8601 datetime (UTC) | When this operator approved the connection. |
| `approved-by` | No | String | The human operator who approved (for audit). |
| `suspended-at` | No | ISO 8601 datetime (UTC) | When the connection was suspended (if applicable). |
| `suspended-by` | No | String | Who suspended the connection. |
| `suspension-reason` | No | String (max 512 chars) | Why the connection was suspended. |
| `suspension-expires` | No | ISO 8601 datetime (UTC) | When the suspension auto-expires. |
| `disconnected-at` | No | ISO 8601 datetime (UTC) | When the connection was disconnected. |
| `disconnected-by` | No | String | Who disconnected. |
| `disconnection-reason` | No | String (max 512 chars) | Why the connection was disconnected. |
| `manifest-last-refreshed` | No | ISO 8601 datetime (UTC) | When the cached peer manifest was last updated. |
| `manifest-refresh-interval` | No | Duration string | How often to refresh this peer's manifest. Overrides `preferences.manifest-refresh-interval`. Default: `7d`. |
| `auto-approve` | No | List of auto-approval rules | Auto-approval configuration for Trust Level 2 connections. See Section 7. |
| `notes` | No | String (max 1024 chars) | Human-readable notes about this connection. |

### 5.2 Transport Config by Transport Type

The `transport-config` field contains settings specific to the configured transport:

#### File Transport

```yaml
transport: file
transport-config:
  export-path: ~/hq-exports/alex/      # Where to write export bundles for this peer
  import-path: ~/hq-imports/alex/      # Where to watch for import bundles from this peer
```

| Field | Required | Description |
|-------|----------|-------------|
| `export-path` | No | Directory for outgoing transfer bundles. Default: `~/hq-exports/{peer}/` |
| `import-path` | No | Directory for incoming transfer bundles. Default: `~/hq-imports/{peer}/` |

#### Git Transport (Future)

```yaml
transport: git
transport-config:
  repo: git@github.com:team/hq-transfers.git
  branch: main
  remote: origin
```

#### HTTP Transport (Future)

```yaml
transport: http
transport-config:
  endpoint: https://alex-hq.example.com/world
  api-key-ref: $WORLD_API_KEY_ALEX     # Environment variable reference
```

#### HIAMP Transport (Future)

```yaml
transport: hiamp
transport-config:
  worker-id: system                     # Reserved worker ID for protocol-level messages
```

### 5.3 Connection Record Lifecycle

Connection records are created during the peering ceremony and updated as the connection progresses through states:

| Event | Fields Set | Fields Cleared |
|-------|-----------|----------------|
| Proposal sent (outgoing) | `peer`, `status: proposed`, `proposal-id` | -- |
| Proposal received (incoming) | `peer`, `instance-id`, `display-name`, `status: pending`, `proposal-id` | -- |
| Connection approved | `status: active`, `trust-level`, `transport`, `connected-at`, `approved-at`, `approved-by`, `manifest-last-refreshed` | -- |
| Connection suspended | `status: suspended`, `suspended-at`, `suspended-by`, `suspension-reason`, `suspension-expires` | -- |
| Suspension lifted | `status: active` | `suspended-at`, `suspended-by`, `suspension-reason`, `suspension-expires` |
| Connection disconnected | `status: disconnected`, `disconnected-at`, `disconnected-by`, `disconnection-reason` | -- |
| Connection rejected | `status: rejected` | -- |

**Disconnected and rejected records are retained** for audit purposes. They remain in the `connections` list with their terminal status. This allows the operator to review connection history and informs trust decisions for future reconnections.

### 5.4 Peer Uniqueness

Each `peer` value MUST be unique in the connections list. An HQ instance cannot have two connection records for the same peer owner name. If a disconnected peer reconnects, the old record is replaced by the new one (the old record is preserved in the transfer log for audit).

---

## 6. Preferences Section

The `preferences` section defines default settings for the World Protocol. These are global defaults -- individual connections can override most of these with per-connection settings.

```yaml
preferences:
  default-transport: file                      # Default transport for new connections
  default-trust-level: verified                # Default trust for new peers
  manifest-refresh-interval: 7d                # Default refresh interval
  connection-expiry: 90d                       # Inactivity threshold before expiry
  suspension-max-duration: 30d                 # Max suspension before auto-disconnect
  transfer-retention:
    bundles: 90d                               # How long to retain transfer bundles
    logs: 365d                                 # How long to retain transfer log entries
  inbox-auto-cleanup: 30d                      # Auto-clean inbox items older than this
  accepting-connections: true                  # Whether to accept new peer proposals
```

### 6.1 Preference Fields

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `default-transport` | No | `file` | Transport used for new connections when not specified during the peering ceremony. |
| `default-trust-level` | No | `verified` | Trust level assigned to new connections when not specified during approval. |
| `manifest-refresh-interval` | No | `7d` | Default interval for refreshing cached peer manifests. Per-connection override available. |
| `connection-expiry` | No | `90d` | Duration of inactivity (no transfers, no health checks) before a connection is flagged for expiry review. |
| `suspension-max-duration` | No | `30d` | Maximum duration of a suspension before the system flags it for operator action (disconnect or reactivate). |
| `transfer-retention.bundles` | No | `90d` | How long to retain transfer bundle files in `workspace/world/`. Supports rollback. |
| `transfer-retention.logs` | No | `365d` | How long to retain transfer log entries. Logs are kept longer than bundles for audit. |
| `inbox-auto-cleanup` | No | `30d` | Auto-remove unreviewed inbox items older than this duration. Prevents inbox accumulation. |
| `accepting-connections` | No | `true` | Whether this HQ instance is currently accepting new connection proposals. Reflected in the manifest's `connection.accepting-connections` field. |

### 6.2 Override Hierarchy

Per-connection settings override global preferences. The resolution order:

1. Connection-specific value (e.g., `connections[].manifest-refresh-interval`)
2. Global preference (e.g., `preferences.manifest-refresh-interval`)
3. Protocol default (documented in this spec)

---

## 7. Auto-Approval Rules

Auto-approval is available at Trust Level 2 (Trusted) and allows specific transfer types to be staged to the inbox without operator review. Auto-approved transfers are still logged and can be reviewed retroactively.

### 7.1 Per-Connection Auto-Approval

Auto-approval rules are defined per-connection in the `auto-approve` list:

```yaml
connections:
  - peer: alex
    trust-level: trusted
    auto-approve:
      - type: knowledge
        domains: [testing, infrastructure]
      - type: context
        projects: [hq-cloud]
```

### 7.2 Auto-Approval Rule Fields

| Field | Required | Format | Description |
|-------|----------|--------|-------------|
| `type` | Yes | `knowledge` \| `context` | Transfer type to auto-approve. Only `knowledge` and `context` are eligible. `worker-pattern` and `system` cannot be auto-approved (worker patterns always require manual review; system transfers have their own auto-processing rules). |
| `domains` | Conditional | List of domain labels | For `type: knowledge`: only auto-approve transfers in these knowledge domains. Required when `type` is `knowledge`. |
| `projects` | Conditional | List of project names | For `type: context`: only auto-approve context for these projects. Required when `type` is `context`. |

### 7.3 Auto-Approval Behavior

When a transfer arrives from a Trusted peer with matching auto-approval rules:

1. Integrity verification runs as normal.
2. If verification passes, the transfer is staged to inbox AND marked as auto-approved.
3. The transfer log entry includes `auto-approved: true`.
4. The operator is notified (but does not need to act).
5. Integration still requires a manual step -- auto-approval stages the transfer, it does not integrate it.

When a transfer arrives that does NOT match auto-approval rules (wrong type, wrong domain, wrong project), it follows the standard review flow regardless of trust level.

### 7.4 Constraints

- Auto-approval rules MUST NOT be configured for connections at Trust Level 0 (Open) or 1 (Verified). Implementations MUST ignore auto-approve rules on non-Trusted connections.
- `worker-pattern` transfers are NEVER auto-approved. They are structural changes that require human judgment.
- The `domains` and `projects` lists act as whitelists. An empty list means nothing is auto-approved for that type.

---

## 8. Relationship to config/hiamp.yaml

### 8.1 Separation of Concerns

`config/hiamp.yaml` and `config/world.yaml` serve different purposes in the HQ communication stack:

| Concern | Governed By | Config File |
|---------|-----------|-------------|
| HQ identity (owner, instance-id) | Both (shared) | Both (must be consistent) |
| Peer connections for structured data exchange | World Protocol | `config/world.yaml` |
| Peer directory for real-time messaging | HIAMP | `config/hiamp.yaml` |
| Slack integration (bot token, channels, events) | HIAMP | `config/hiamp.yaml` |
| Transport configuration for transfers | World Protocol | `config/world.yaml` |
| Trust levels for transfers | World Protocol | `config/world.yaml` |
| Trust levels for messaging | HIAMP | `config/hiamp.yaml` |
| Worker messaging permissions | HIAMP | `config/hiamp.yaml` |
| Transfer logs and audit trail | World Protocol | `workspace/world/transfers/` |
| Message audit logs | HIAMP | `workspace/audit/hiamp/` |
| Manifest generation and redaction | World Protocol | `config/manifest.yaml` |

### 8.2 Shared Fields (Cross-Reference)

These fields appear in both configs and MUST be kept in sync:

```yaml
# config/hiamp.yaml                      # config/world.yaml
identity:                                identity:
  owner: stefan          # <-- MUST -->    owner: stefan
  instance-id: stefan-hq-primary  # <-->   instance-id: stefan-hq-primary
  display-name: "Stefan's HQ"    # <-->    display-name: "Stefan's HQ"
```

### 8.3 Fields NOT Duplicated

The World config does NOT include:

| HIAMP Field | Why Not In World Config |
|-------------|------------------------|
| `slack.bot-token` | Slack is HIAMP's transport, not the World Protocol's. |
| `slack.channel-strategy` | Channel routing is a messaging concern. |
| `slack.channels` | Channel mappings are HIAMP-specific. |
| `security.tokens.shared-secrets` | HIAMP uses shared secrets for JWT tokens. World Protocol does not use JWTs in v1. |
| `worker-permissions` | Worker-to-worker messaging permissions are HIAMP's domain. World Protocol transfers are HQ-to-HQ, not worker-to-worker. |
| `settings.ack-timeout` | Message acknowledgment is a real-time messaging concern. |

The World config does NOT include:

| World Field | Why Not In HIAMP Config |
|-------------|------------------------|
| `connections[].transport-config` | Transfer transport is World Protocol's domain. |
| `connections[].auto-approve` | Transfer auto-approval is World Protocol's domain. |
| `preferences.transfer-retention` | Transfer lifecycle is World Protocol's domain. |
| `preferences.connection-expiry` | Connection lifecycle beyond messaging is World Protocol's domain. |
| `identity.world-version` | Protocol version has no HIAMP equivalent. |

### 8.4 Peer Directory Relationship

HIAMP's `peers` section and World's `connections` section overlap but serve different purposes:

| HIAMP `peers[]` | World `connections[]` | Relationship |
|-----------------|----------------------|--------------|
| Lists peers for messaging | Lists peers for structured transfers | An HQ instance may have a peer in HIAMP but not in World (messaging only) or in World but not in HIAMP (transfers only). |
| `workers[]` lists remote workers for addressing | No worker list (use cached manifest instead) | World Protocol discovers worker capabilities through manifests, not config. |
| `slack-bot-id` for identity verification | Not needed (identity verified during peering ceremony) | Different trust models. |
| `trust-level: open/channel-scoped/token-verified` | `trust-level: open/verified/trusted` | Different trust taxonomies for different concerns. HIAMP trust governs message verification; World trust governs transfer handling. |

### 8.5 Migration Path

An HQ instance with HIAMP configured can adopt the World Protocol incrementally:

1. **Create `config/world.yaml`** -- auto-generate identity from `config/hiamp.yaml`.
2. **No changes to HIAMP** -- existing messaging continues unchanged.
3. **For each HIAMP peer you want World connections with** -- run the peering ceremony. The HIAMP peer entry stays for messaging; the World connection entry is added for transfers.
4. **Use both** -- HIAMP for real-time worker conversations, World Protocol for structured knowledge/pattern/context transfers.

---

## 9. workspace/world/peers/ -- Peer Manifest Cache

### 9.1 Purpose

The `workspace/world/peers/` directory caches the manifests of connected peers. These cached manifests are the data source for capability queries ("does Alex have a qa-tester worker?"), transfer routing decisions, and manifest freshness checks.

### 9.2 Directory Structure

```
workspace/world/peers/
├── alex/
│   ├── manifest.yaml                   # Alex's latest manifest
│   └── manifest-history/               # Previous manifests (for diffing)
│       ├── manifest-2026-02-16.yaml
│       └── manifest-2026-02-23.yaml
├── maria/
│   ├── manifest.yaml
│   └── manifest-history/
│       └── manifest-2026-01-20.yaml
```

### 9.3 Manifest Cache Rules

| Rule | Description |
|------|-------------|
| **Created on activation** | The peer directory is created when a connection reaches ACTIVE state. |
| **Updated on refresh** | When a peer sends a manifest-refresh system transfer, the cached manifest is replaced. The old manifest is moved to `manifest-history/`. |
| **Read-only for workers** | Workers can read cached manifests for capability queries. They cannot modify them. |
| **Deleted on disconnection** | When a connection is disconnected, the peer's manifest cache is deleted. History is also deleted (the transfer log retains the record of manifest exchanges). |
| **Preserved during suspension** | When a connection is suspended, the manifest cache is retained. It may become stale during suspension. |

### 9.4 Manifest History

The `manifest-history/` subdirectory retains previous manifest versions, named by the date of the refresh. This enables:

- **Change tracking** -- diff current vs. previous to see what capabilities changed.
- **Trend analysis** -- observe how a peer's HQ evolves over time.
- **Rollback** -- if a manifest refresh contains errors, the previous version is available.

Manifest history follows the same retention policy as transfer bundles (`preferences.transfer-retention.bundles`, default 90 days).

### 9.5 Manifest Cache File Format

The cached manifest is an exact copy of the peer's manifest as received during the peering ceremony or the most recent manifest-refresh system transfer. The format is defined in [Manifest Schema](manifest-schema.md).

---

## 10. workspace/world/transfers/ -- Transfer Log

### 10.1 Purpose

The transfer log is the authoritative record of all World Protocol activity for this HQ instance. Every transfer sent, received, approved, rejected, quarantined, integrated, or rolled back is logged here. The log serves as:

- **Audit trail** -- who sent what, when, and what happened to it.
- **Conflict detection data** -- tracks integration hashes for detecting local modifications.
- **Trust decision input** -- transfer history informs trust escalation/downgrade decisions.
- **Connection health metric** -- activity tracking per peer.

### 10.2 File Organization

Transfer logs are organized by date, one YAML file per day:

```
workspace/world/transfers/
├── 2026-02-16.yaml
├── 2026-02-17.yaml
├── 2026-02-20.yaml
└── ...
```

Files are only created on days when transfer activity occurs. Empty days have no file.

### 10.3 Transfer Log Entry Format

Each log file contains a `transfers` array. Entries are appended chronologically:

```yaml
# workspace/world/transfers/2026-02-16.yaml
transfers:
  # --- Transfer events ---
  - id: txfr-e2e4a7b8c9d0
    event: sent
    direction: outbound
    type: knowledge
    from: stefan
    to: alex
    timestamp: "2026-02-16T14:30:00Z"
    payload-hash: sha256:3f2b7c9d...
    payload-size: 5632
    description: "E2E testing patterns"
    supersedes: null
    sequence: 1
    transport: file

  - id: txfr-qa7b8c9d0e1f2
    event: received
    direction: inbound
    type: worker-pattern
    from: alex
    to: stefan
    timestamp: "2026-02-16T15:00:00Z"
    payload-hash: sha256:9d0e1f2a...
    payload-size: 12288
    description: "Backend dev worker pattern"
    state: staged
    staged-to: workspace/world/inbox/alex/worker-pattern/backend-dev/

  - id: txfr-qa7b8c9d0e1f2
    event: approved
    direction: inbound
    type: worker-pattern
    from: alex
    timestamp: "2026-02-16T15:15:00Z"
    approved-by: stefan

  - id: txfr-qa7b8c9d0e1f2
    event: integrated
    direction: inbound
    type: worker-pattern
    from: alex
    timestamp: "2026-02-16T15:30:00Z"
    integrated-to: workers/dev-team/backend-dev/
    integration-hash: sha256:abcdef12...   # Hash at integration time (for conflict detection)

  # --- Connection events ---
  - id: null
    event: connection-activated
    peer: alex
    proposal-id: prop-7f3e2d1c
    timestamp: "2026-02-16T11:00:00Z"
    trust-level: verified
    transport: file
    details: "Peering ceremony completed."

  - id: null
    event: trust-upgraded
    peer: alex
    timestamp: "2026-02-16T18:00:00Z"
    from-level: verified
    to-level: trusted
    reason: "Strong track record of successful transfers"
```

### 10.4 Log Entry Fields

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes (null for connection events) | Transfer ID or null for connection-level events. |
| `event` | Yes | Event type: `sent`, `received`, `verified`, `staged`, `approved`, `rejected`, `quarantined`, `integrated`, `auto-approved`, `rollback`, `connection-activated`, `connection-suspended`, `connection-disconnected`, `trust-upgraded`, `trust-downgraded`, `manifest-refreshed`. |
| `direction` | No | `inbound` or `outbound`. Null for connection events. |
| `type` | No | Transfer type (`knowledge`, `worker-pattern`, `context`, `system`). |
| `from` | No | Sender owner name. |
| `to` | No | Receiver owner name. |
| `timestamp` | Yes | When this event occurred (ISO 8601 UTC). |
| `peer` | No | For connection events: which peer. |
| Additional fields | Varies | Event-specific fields (see above examples). |

### 10.5 Log Retention

Transfer log files are retained according to `preferences.transfer-retention.logs` (default: 365 days). After the retention period, log files may be archived or deleted. The operator can override retention per-file.

### 10.6 Integration Hash Tracking

When a transfer is integrated, the `integration-hash` field records the SHA-256 hash of the integrated content at integration time. This hash is used later for conflict detection:

1. A new transfer arrives that supersedes a previously integrated transfer.
2. The system computes the current hash of the integrated content.
3. If the current hash differs from the `integration-hash`, the content was modified locally.
4. A conflict is flagged for operator resolution.

---

## 11. workspace/world/inbox/ -- Incoming Transfers

### 11.1 Purpose

The inbox is the staging area for incoming transfers that have passed integrity verification. Files here await operator review and approval before integration into the HQ.

### 11.2 Directory Structure

```
workspace/world/inbox/
└── {sender-owner}/
    ├── knowledge/
    │   └── {transfer-id}/
    │       ├── envelope.yaml          # Copy of the transfer envelope
    │       ├── payload/               # Extracted payload
    │       │   ├── manifest.yaml
    │       │   ├── knowledge/
    │       │   │   └── ...
    │       │   └── metadata/
    │       │       └── provenance.yaml
    │       └── status.yaml            # Staging metadata
    ├── worker-pattern/
    │   └── {pattern-name}/
    │       ├── envelope.yaml
    │       ├── payload/
    │       └── status.yaml
    └── context/
        └── {project-name}/
            ├── envelope.yaml
            ├── payload/
            └── status.yaml
```

### 11.3 Status File

Each staged transfer has a `status.yaml` file tracking its review state:

```yaml
transfer-id: txfr-e2e4a7b8c9d0
staged-at: "2026-02-16T14:35:00Z"
auto-approved: false
reviewed: false
reviewed-at: null
reviewed-by: null
decision: null                          # pending | approved | rejected
integrated-at: null
integrated-to: null
```

### 11.4 Inbox Cleanup

Unreviewed inbox items older than `preferences.inbox-auto-cleanup` (default: 30 days) are automatically removed. A warning is logged before cleanup.

---

## 12. workspace/world/quarantine/ -- Held Transfers

### 12.1 Purpose

Transfers that fail integrity verification or arrive from suspended peers are quarantined. Quarantined transfers are isolated for inspection -- they cannot be integrated until the issue is resolved.

### 12.2 Directory Structure

```
workspace/world/quarantine/
└── {transfer-id}/
    ├── envelope.yaml                   # The transfer's envelope
    ├── payload/                        # The (potentially corrupted) payload
    ├── VERIFY.sha256                   # The checksums from the bundle
    └── error.yaml                      # What went wrong
```

### 12.3 Error File

```yaml
transfer-id: txfr-suspicious-001
quarantined-at: "2026-02-16T15:00:00Z"
reason: hash-mismatch
error-code: ERR_TXFR_HASH_MISMATCH
details: |
  Payload hash in envelope:  sha256:abcdef1234567890...
  Computed payload hash:     sha256:9876543210fedcba...
  Mismatching files:
    - payload/knowledge/patterns.md (expected sha256:aaa..., got sha256:bbb...)
from: alex
type: knowledge
```

### 12.4 Quarantine Resolution

The operator can:

1. **Delete** the quarantined transfer (discard it).
2. **Re-verify** after investigation (if the issue was a transient corruption, re-request the transfer from the peer).
3. **Force-accept** with acknowledgment that integrity is unverified (not recommended, available for edge cases).

---

## 13. workspace/world/context/ -- Ephemeral Context

### 13.1 Purpose

Context transfers (project briefs, status snapshots, coordination maps) are ephemeral by nature. After integration, they are placed in `workspace/world/context/` -- a transient location separate from the permanent knowledge base.

### 13.2 Directory Structure

```
workspace/world/context/
└── {sender-owner}/
    └── {project-name}/
        ├── project-brief.md
        ├── status.yaml
        └── coordination.yaml
```

### 13.3 Freshness and Cleanup

Context files should be treated as time-sensitive. Workers reading context files should check the `snapshot-at` timestamp and treat old context with caution.

Operators should periodically clean stale context. There is no auto-cleanup for context files because staleness is project-dependent -- an active project's context from last week may still be relevant.

---

## 14. Auto-Generation from Existing HQ Files

### 14.1 Purpose

A new HQ instance can generate a valid `config/world.yaml` from existing HQ files. This lowers the barrier to joining the World -- the operator does not need to author the config from scratch.

### 14.2 Source Files

| World Config Field | Source File | Derivation |
|-------------------|------------|------------|
| `identity.owner` | `config/hiamp.yaml` > `identity.owner` | Direct copy. Falls back to `agents.md` operator name (lowercased, hyphenated). |
| `identity.instance-id` | `config/hiamp.yaml` > `identity.instance-id` | Direct copy. Falls back to `{owner}-hq-{random-4}`. |
| `identity.display-name` | `config/hiamp.yaml` > `identity.display-name` | Direct copy. Falls back to `"{Name}'s HQ"` from `agents.md`. |
| `identity.world-version` | Constant | Always `v1`. |
| `connections` | (empty) | New instances start with no connections. If HIAMP peers exist, they can be suggested as connection candidates (but not auto-connected). |
| `preferences.default-transport` | Constant | `file` (MVP transport). |
| `preferences.default-trust-level` | Constant | `verified` (recommended default). |
| `preferences.accepting-connections` | Constant | `true` (default). |
| Other preferences | Defaults | Protocol defaults documented in Section 6. |

### 14.3 Generation Algorithm

```
FUNCTION generate_world_config(hq_root):
  config = {}

  # Step 1: Identity (from HIAMP or agents.md)
  hiamp = read_yaml(hq_root / "config/hiamp.yaml")  # may not exist
  agents = parse(hq_root / "agents.md")               # must exist

  IF hiamp EXISTS AND hiamp.identity EXISTS:
    config.identity.owner = hiamp.identity.owner
    config.identity.instance_id = hiamp.identity.instance_id
    config.identity.display_name = hiamp.identity.display_name
  ELSE:
    config.identity.owner = slugify(agents.operator_name)
    config.identity.instance_id = "{owner}-hq-{random_hex(4)}"
    config.identity.display_name = "{agents.operator_name}'s HQ"

  config.identity.world_version = "v1"

  # Step 2: Connections (empty for new instances)
  config.connections = []

  # Step 3: Preferences (defaults)
  config.preferences = {
    default_transport: "file",
    default_trust_level: "verified",
    manifest_refresh_interval: "7d",
    connection_expiry: "90d",
    suspension_max_duration: "30d",
    transfer_retention: {
      bundles: "90d",
      logs: "365d"
    },
    inbox_auto_cleanup: "30d",
    accepting_connections: true
  }

  # Step 4: Suggest HIAMP peers as connection candidates (informational)
  IF hiamp EXISTS AND hiamp.peers EXISTS:
    FOR each peer IN hiamp.peers:
      log("Suggested peer for World connection: {peer.owner} ({peer.display_name})")

  RETURN config
```

### 14.4 Command Integration

```
> /run architect world init
```

This command:

1. Checks if `config/world.yaml` already exists (abort if so, to prevent overwriting).
2. Reads source files (`config/hiamp.yaml`, `agents.md`).
3. Generates the config using the algorithm above.
4. Writes to `config/world.yaml`.
5. Creates the `workspace/world/` directory structure (empty).
6. Displays a summary of the generated config.
7. Lists suggested connection candidates from HIAMP peers (if any).

### 14.5 Regeneration

The `init` command only runs once. To regenerate the config (e.g., after changing the operator name in `agents.md`), the operator must delete or rename the existing `config/world.yaml` first. This prevents accidental overwriting of connection records.

---

## 15. JSON Schema for world.yaml Validation

The following JSON Schema validates the `config/world.yaml` configuration file. Implementations SHOULD validate the config at startup and warn on structural issues.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://hq.dev/schemas/world-config-v1.json",
  "title": "HQ World Protocol Configuration",
  "description": "Configuration schema for an HQ instance's World Protocol presence — identity, connections, and preferences",
  "type": "object",
  "required": ["identity", "connections", "preferences"],
  "additionalProperties": false,
  "properties": {
    "identity": {
      "type": "object",
      "required": ["owner", "instance-id", "world-version"],
      "additionalProperties": false,
      "properties": {
        "owner": {
          "type": "string",
          "pattern": "^[a-z0-9][a-z0-9-]*[a-z0-9]$",
          "minLength": 2,
          "maxLength": 32,
          "description": "Operator's unique name — used as sender identifier in transfers"
        },
        "instance-id": {
          "type": "string",
          "pattern": "^[a-z0-9][a-z0-9-]*[a-z0-9]$",
          "minLength": 2,
          "maxLength": 64,
          "description": "Globally unique HQ instance identifier"
        },
        "display-name": {
          "type": "string",
          "maxLength": 128,
          "description": "Human-readable label for this HQ instance"
        },
        "world-version": {
          "type": "string",
          "pattern": "^v[0-9]+$",
          "description": "World Protocol version this config conforms to"
        }
      }
    },
    "connections": {
      "type": "array",
      "items": {
        "$ref": "#/$defs/connection-record"
      },
      "description": "List of peer connections — active, suspended, proposed, or historical"
    },
    "preferences": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "default-transport": {
          "type": "string",
          "enum": ["file", "git", "http", "hiamp"],
          "default": "file",
          "description": "Default transport for new connections"
        },
        "default-trust-level": {
          "type": "string",
          "enum": ["open", "verified", "trusted"],
          "default": "verified",
          "description": "Default trust level for new connections"
        },
        "manifest-refresh-interval": {
          "type": "string",
          "pattern": "^[0-9]+(d|h|m)$",
          "default": "7d",
          "description": "Default interval for peer manifest refresh"
        },
        "connection-expiry": {
          "type": "string",
          "pattern": "^[0-9]+(d|h|m)$",
          "default": "90d",
          "description": "Inactivity threshold before connection expiry review"
        },
        "suspension-max-duration": {
          "type": "string",
          "pattern": "^[0-9]+(d|h|m)$",
          "default": "30d",
          "description": "Max suspension duration before operator action required"
        },
        "transfer-retention": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "bundles": {
              "type": "string",
              "pattern": "^[0-9]+(d|h|m)$",
              "default": "90d",
              "description": "How long to retain transfer bundle files"
            },
            "logs": {
              "type": "string",
              "pattern": "^[0-9]+(d|h|m)$",
              "default": "365d",
              "description": "How long to retain transfer log entries"
            }
          }
        },
        "inbox-auto-cleanup": {
          "type": "string",
          "pattern": "^[0-9]+(d|h|m)$",
          "default": "30d",
          "description": "Auto-remove unreviewed inbox items older than this"
        },
        "accepting-connections": {
          "type": "boolean",
          "default": true,
          "description": "Whether this HQ is currently accepting new connection proposals"
        }
      }
    }
  },
  "$defs": {
    "connection-record": {
      "type": "object",
      "required": ["peer", "status", "trust-level", "transport", "proposal-id"],
      "additionalProperties": false,
      "properties": {
        "peer": {
          "type": "string",
          "pattern": "^[a-z0-9][a-z0-9-]*[a-z0-9]$",
          "minLength": 2,
          "maxLength": 32,
          "description": "Connected peer's owner name"
        },
        "instance-id": {
          "type": "string",
          "pattern": "^[a-z0-9][a-z0-9-]*[a-z0-9]$",
          "minLength": 2,
          "maxLength": 64,
          "description": "Peer's HQ instance identifier"
        },
        "display-name": {
          "type": "string",
          "maxLength": 128,
          "description": "Peer's human-readable name"
        },
        "status": {
          "type": "string",
          "enum": ["proposed", "pending", "active", "suspended", "disconnected", "rejected", "expired"],
          "description": "Current connection state"
        },
        "trust-level": {
          "type": "string",
          "enum": ["open", "verified", "trusted"],
          "description": "Trust level for this peer"
        },
        "transport": {
          "type": "string",
          "enum": ["file", "git", "http", "hiamp"],
          "description": "Default transport for this peer"
        },
        "transport-config": {
          "type": "object",
          "description": "Transport-specific configuration — structure depends on transport type",
          "additionalProperties": true
        },
        "proposal-id": {
          "type": "string",
          "pattern": "^prop-[a-f0-9]{8}$",
          "description": "ID of the proposal that initiated this connection"
        },
        "connected-at": {
          "oneOf": [
            { "type": "string", "format": "date-time" },
            { "type": "null" }
          ],
          "description": "When the connection became active"
        },
        "approved-at": {
          "oneOf": [
            { "type": "string", "format": "date-time" },
            { "type": "null" }
          ],
          "description": "When this operator approved the connection"
        },
        "approved-by": {
          "oneOf": [
            { "type": "string" },
            { "type": "null" }
          ],
          "description": "The human operator who approved"
        },
        "suspended-at": {
          "oneOf": [
            { "type": "string", "format": "date-time" },
            { "type": "null" }
          ],
          "description": "When the connection was suspended"
        },
        "suspended-by": {
          "oneOf": [
            { "type": "string" },
            { "type": "null" }
          ],
          "description": "Who suspended the connection"
        },
        "suspension-reason": {
          "oneOf": [
            { "type": "string", "maxLength": 512 },
            { "type": "null" }
          ],
          "description": "Why the connection was suspended"
        },
        "suspension-expires": {
          "oneOf": [
            { "type": "string", "format": "date-time" },
            { "type": "null" }
          ],
          "description": "When the suspension auto-expires"
        },
        "disconnected-at": {
          "oneOf": [
            { "type": "string", "format": "date-time" },
            { "type": "null" }
          ],
          "description": "When the connection was disconnected"
        },
        "disconnected-by": {
          "oneOf": [
            { "type": "string" },
            { "type": "null" }
          ],
          "description": "Who disconnected"
        },
        "disconnection-reason": {
          "oneOf": [
            { "type": "string", "maxLength": 512 },
            { "type": "null" }
          ],
          "description": "Why the connection was disconnected"
        },
        "manifest-last-refreshed": {
          "oneOf": [
            { "type": "string", "format": "date-time" },
            { "type": "null" }
          ],
          "description": "When the peer's cached manifest was last updated"
        },
        "manifest-refresh-interval": {
          "type": "string",
          "pattern": "^[0-9]+(d|h|m)$",
          "default": "7d",
          "description": "How often to refresh this peer's manifest"
        },
        "auto-approve": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/auto-approval-rule"
          },
          "default": [],
          "description": "Auto-approval rules (Trust Level 2 only)"
        },
        "notes": {
          "oneOf": [
            { "type": "string", "maxLength": 1024 },
            { "type": "null" }
          ],
          "description": "Human-readable notes about this connection"
        }
      }
    },
    "auto-approval-rule": {
      "type": "object",
      "required": ["type"],
      "additionalProperties": false,
      "properties": {
        "type": {
          "type": "string",
          "enum": ["knowledge", "context"],
          "description": "Transfer type to auto-approve (worker-pattern is never auto-approved)"
        },
        "domains": {
          "type": "array",
          "items": {
            "type": "string",
            "pattern": "^[a-z0-9][a-z0-9-]*[a-z0-9]$",
            "maxLength": 64
          },
          "description": "For knowledge transfers: only auto-approve these domains"
        },
        "projects": {
          "type": "array",
          "items": {
            "type": "string",
            "maxLength": 128
          },
          "description": "For context transfers: only auto-approve these projects"
        }
      },
      "allOf": [
        {
          "if": {
            "properties": { "type": { "const": "knowledge" } }
          },
          "then": {
            "required": ["domains"]
          }
        },
        {
          "if": {
            "properties": { "type": { "const": "context" } }
          },
          "then": {
            "required": ["projects"]
          }
        }
      ]
    }
  }
}
```

### 15.1 Validation Notes

- The schema uses JSON Schema Draft 2020-12, consistent with the World Protocol envelope schema and manifest schema.
- Connection records use `$defs/connection-record` for reusability.
- Auto-approval rules use conditional validation (`if`/`then`) to require `domains` for knowledge and `projects` for context.
- Nullable fields use `oneOf` with `string` and `null` types.
- `transport-config` uses `additionalProperties: true` because its structure varies by transport type.
- Implementations SHOULD validate at startup and warn (not fail) on structural issues -- a config with disconnected peers having missing fields should not prevent operation.

---

## Appendix A: Transfer Log Entry Schema

The transfer log entry does not have a formal JSON Schema because entries are polymorphic (different events have different fields). However, the following fields are common to all entries:

```yaml
# Required for all entries
id: {string|null}              # Transfer ID (null for connection events)
event: {string}                # Event type
timestamp: {ISO 8601 UTC}     # When this event occurred

# Common optional fields
direction: {inbound|outbound}  # Transfer direction
type: {string}                 # Transfer type
from: {string}                 # Sender owner
to: {string}                   # Receiver owner
peer: {string}                 # Peer owner (for connection events)
```

### Event-Specific Fields

| Event | Additional Fields |
|-------|-------------------|
| `sent` | `payload-hash`, `payload-size`, `description`, `supersedes`, `sequence`, `transport` |
| `received` | `payload-hash`, `payload-size`, `description`, `state`, `staged-to` |
| `verified` | (none beyond common) |
| `staged` | `staged-to` |
| `approved` | `approved-by` |
| `auto-approved` | `auto-approve-rule` (which rule matched) |
| `rejected` | `rejected-by`, `reason` |
| `quarantined` | `error-code`, `details` |
| `integrated` | `integrated-to`, `integration-hash` |
| `rollback` | `target-transfer-id`, `reason` |
| `connection-activated` | `proposal-id`, `trust-level`, `transport`, `details` |
| `connection-suspended` | `reason`, `suspended-by` |
| `connection-disconnected` | `reason`, `disconnected-by` |
| `trust-upgraded` | `from-level`, `to-level`, `reason` |
| `trust-downgraded` | `from-level`, `to-level`, `reason` |
| `manifest-refreshed` | `previous-hash`, `new-hash` |

---

## Appendix B: Quick Reference

### File Locations

| File | Purpose | Managed By |
|------|---------|-----------|
| `config/world.yaml` | World Protocol configuration | Operator |
| `config/manifest.yaml` | Manifest generation config + redaction | Operator |
| `config/hiamp.yaml` | HIAMP messaging config | Operator |
| `workspace/world/peers/{owner}/manifest.yaml` | Cached peer manifest | System |
| `workspace/world/transfers/{date}.yaml` | Transfer event log | System |
| `workspace/world/inbox/{owner}/{type}/` | Staged incoming transfers | System |
| `workspace/world/quarantine/{transfer-id}/` | Failed-verification transfers | System |
| `workspace/world/context/{owner}/{project}/` | Integrated ephemeral context | System |

### Identity Consistency Rules

| Field | `config/hiamp.yaml` | `config/world.yaml` | `config/manifest.yaml` (generated) |
|-------|---------------------|---------------------|-------------------------------------|
| `owner` | `identity.owner` | `identity.owner` | `identity.owner` |
| `instance-id` | `identity.instance-id` | `identity.instance-id` | `identity.instance-id` |
| `display-name` | `identity.display-name` | `identity.display-name` | `identity.display-name` |

All three files MUST use the same values for shared identity fields.

### Trust Level Quick Reference

| Level | Code | HIAMP Equivalent | Transfer Handling |
|-------|------|-----------------|-------------------|
| 0 | `open` | `open` | All transfers require manual review |
| 1 | `verified` | `channel-scoped` | Transfers reviewed; system transfers auto-processed |
| 2 | `trusted` | `token-verified` | Configurable auto-approval for knowledge/context |

### Connection States Quick Reference

| State | Code | Transfers? | Can Auto-Approve? |
|-------|------|-----------|-------------------|
| PROPOSED | `proposed` | No | No |
| PENDING | `pending` | No | No |
| ACTIVE | `active` | Yes | Yes (if trusted) |
| SUSPENDED | `suspended` | No | No |
| DISCONNECTED | `disconnected` | No | No |
| REJECTED | `rejected` | No | No |
| EXPIRED | `expired` | No | No |

### Duration String Format

| Value | Meaning |
|-------|---------|
| `7d` | 7 days |
| `24h` | 24 hours |
| `30m` | 30 minutes |
| `90d` | 90 days |
| `365d` | 365 days |

---

*End of HQ World Protocol -- Local Configuration & State.*

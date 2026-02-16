# HQ World Protocol — Transfer Protocol Specification

**Version:** 1.0-draft
**Date:** 2026-02-16
**Status:** Draft
**Authors:** stefan/architect
**Parent Spec:** [World Protocol Specification](world-protocol-spec.md) (Section 6, Section 9)

---

## Table of Contents

1. [Overview](#1-overview)
2. [Transfer Envelope](#2-transfer-envelope)
3. [Knowledge Transfer Type](#3-knowledge-transfer-type)
4. [Worker Pattern Transfer Type](#4-worker-pattern-transfer-type)
5. [Context Transfer Type](#5-context-transfer-type)
6. [System Transfer Type](#6-system-transfer-type)
7. [Transfer Versioning](#7-transfer-versioning)
8. [Transport Abstraction](#8-transport-abstraction)
9. [Transfer Lifecycle](#9-transfer-lifecycle)
10. [Integrity & Verification](#10-integrity--verification)
11. [Complete Transfer Examples](#11-complete-transfer-examples)
- [Appendix A: Envelope JSON Schema](#appendix-a-envelope-json-schema)
- [Appendix B: Payload Manifest Schemas](#appendix-b-payload-manifest-schemas)
- [Appendix C: Quick Reference](#appendix-c-quick-reference)

---

## 1. Overview

### 1.1 What This Document Is

This document is the detailed specification for the **Transfer Protocol** — the mechanism by which connected HQ instances exchange structured data. It expands on Section 6 (Transfer Model) and Section 9 (Transport Abstraction) of the World Protocol Specification, providing the depth needed for implementation.

If the World Protocol Specification is the constitution, this document is the commercial code — the rules that govern how trade actually works.

### 1.2 Relationship to the World Protocol Spec

The World Protocol Specification defines the overall federation architecture: identity, topology, connections, trust. This document zooms into one layer — **transfers** — and specifies it completely. Everything here is consistent with the parent spec; this document adds detail, not contradictions.

| Concern | Covered In |
|---------|-----------|
| HQ identity and addressing | World Protocol Spec, Section 3 |
| Connection model and peering ceremony | World Protocol Spec, Section 5 |
| Trust levels and governance | World Protocol Spec, Section 7 |
| **Transfer envelope format** | **This document, Section 2** |
| **Transfer type specifications** | **This document, Sections 3-6** |
| **Transfer versioning and conflict handling** | **This document, Section 7** |
| **Transport abstraction and implementations** | **This document, Section 8** |
| Error handling | World Protocol Spec, Section 10 (referenced here) |

### 1.3 Design Principles

**Envelope wraps everything.** Every transfer — a knowledge file, a worker pattern, a status snapshot, a ping — uses the same envelope format. The envelope is the shipping label; the payload is the cargo. You can read the envelope without opening the box.

**Types constrain payloads, not envelopes.** The envelope is identical across all transfer types. What varies is the payload structure inside the bundle. Each transfer type defines its own payload schema, packaging rules, and receiving behavior.

**Versioning is chain-based.** Transfers that update previous transfers form chains through the `supersedes` field. Each chain is a lineage — you can trace any piece of shared knowledge or worker pattern back to its first transfer and see every update along the way.

**Transport is a plug.** The envelope and payload formats are fixed. How they get from A to B is interchangeable. File copy, git push, HTTP POST, HIAMP share — the protocol does not care. Same envelope, different truck.

**The human always approves.** Transfers arrive in an inbox. The operator decides what to integrate. The protocol moves data; the human moves trust.

---

## 2. Transfer Envelope

### 2.1 Envelope Format

Every transfer is wrapped in an envelope — a YAML document that describes the transfer without revealing the payload contents. The envelope is the first thing a receiver reads; it tells them who sent this, what type of data it contains, and whether the payload is intact.

```yaml
envelope:
  # === Identity ===
  id: txfr-a1b2c3d4e5f6               # Unique transfer ID
  type: knowledge                       # Transfer type

  # === Routing ===
  from: stefan                          # Sender HQ owner
  to: alex                              # Recipient HQ owner

  # === Timing ===
  timestamp: "2026-02-16T14:30:00Z"    # When this transfer was created

  # === Protocol ===
  version: v1                           # World Protocol version

  # === Human Context ===
  description: |                        # Human-readable summary
    Sharing our E2E testing patterns — covers Clerk auth testing,
    fixture management, and test user lifecycle.

  # === Integrity ===
  payload-hash: sha256:a1b2c3d4e5f67890abcdef1234567890abcdef1234567890abcdef1234567890
  payload-size: 4096                    # Payload size in bytes

  # === Versioning ===
  supersedes: null                      # ID of a previous transfer this replaces
  sequence: 1                           # Sequence number within a transfer chain

  # === Transport ===
  transport: file                       # Transport used to deliver this transfer
```

### 2.2 Field Reference

| Field | Required | Type | Format | Description |
|-------|----------|------|--------|-------------|
| `id` | Yes | string | `txfr-{12+ hex chars}` | Unique transfer identifier. Generated by the sender. Must be unique across all transfers from this HQ instance. |
| `type` | Yes | enum | `knowledge` \| `worker-pattern` \| `context` \| `system` | The category of data being transferred. Determines the expected payload structure. |
| `from` | Yes | string | HQ owner name (`[a-z0-9-]{2,32}`) | The sending HQ instance's owner name. Must match the sender's registered identity. |
| `to` | Yes | string | HQ owner name (`[a-z0-9-]{2,32}`) | The receiving HQ instance's owner name. Must be a connected peer. |
| `timestamp` | Yes | string | ISO 8601 datetime (UTC) | When the sender created this transfer. Always UTC. Always includes timezone designator `Z`. |
| `version` | Yes | string | `v{major}` | World Protocol version this transfer conforms to. `v1` for this spec. |
| `description` | No | string | Free text (max 1024 chars) | Human-readable explanation of what is being transferred and why. Receivers display this in the import preview. Highly recommended for all non-system transfers. |
| `payload-hash` | Yes | string | `sha256:{64 hex chars}` | SHA-256 hash of the entire payload directory (computed deterministically — see Section 10). Used for integrity verification on receipt. |
| `payload-size` | Yes | integer | Bytes (>= 0) | Total size of the payload in bytes. A system transfer with no payload files has `payload-size: 0`. |
| `supersedes` | No | string or null | Transfer ID or `null` | If this transfer updates a previous one, the ID of the transfer being replaced. `null` (or omitted) for first-time transfers. See Section 7. |
| `sequence` | No | integer | >= 1 (default: 1) | Position in a transfer chain. First transfer is 1, first update is 2, etc. Must increment monotonically within a chain. |
| `transport` | Yes | enum | `file` \| `git` \| `http` \| `hiamp` | Which transport mechanism carried this transfer. Set by the sending implementation at send time. |

### 2.3 ID Generation

Transfer IDs use the format `txfr-` followed by 12 or more lowercase hexadecimal characters. The recommended generation method is:

```
txfr- + first 12 characters of a UUIDv4 (hex, no dashes)
```

Example: `txfr-a1b2c3d4e5f6`

IDs must be unique within the sending HQ instance's transfer history. They should be unique globally, but global uniqueness is not enforced (no central authority).

### 2.4 Envelope Parsing Rules

1. The envelope is always a YAML document stored in `envelope.yaml` at the root of the transfer bundle.
2. All fields under the top-level `envelope:` key.
3. Required fields must be present; their absence is a validation error (`ERR_TXFR_MALFORMED`).
4. Unknown fields must be preserved but may be ignored. This allows forward-compatible extensions.
5. Field values are validated against their format constraints before the payload is examined.
6. If any required field fails validation, the transfer is rejected before payload processing begins.

### 2.5 Envelope Size

The envelope itself (the `envelope.yaml` file) should not exceed **4 KB**. This constraint keeps the envelope lightweight — it is metadata, not content. The `description` field's 1024-character limit is the primary contributor to envelope size.

---

## 3. Knowledge Transfer Type

### 3.1 Purpose

A knowledge transfer carries knowledge files — markdown documents, guides, patterns, templates, configuration examples, or any structured knowledge that one HQ instance has captured and wants to share with a peer. Knowledge is the most common transfer type. It is how HQ instances teach each other.

### 3.2 Payload Structure

```
payload/
├── manifest.yaml              # What's in this transfer
├── knowledge/                 # Knowledge files
│   ├── e2e-learnings.md       # Top-level knowledge file
│   └── testing/               # Subdirectory (optional)
│       ├── patterns.md
│       └── fixtures.md
└── metadata/
    └── provenance.yaml        # Where this knowledge came from
```

The `knowledge/` directory contains the actual files being shared. The directory structure within `knowledge/` is preserved from the sender's HQ, allowing the receiver to see how the sender organized the content.

### 3.3 Payload Manifest

The `manifest.yaml` inside the payload describes each file being transferred:

```yaml
type: knowledge
domain: testing                        # Primary knowledge domain
items:
  - path: knowledge/e2e-learnings.md
    domain: testing
    description: "E2E testing patterns for Clerk auth and Playwright"
    source-path: knowledge/testing/e2e-learnings.md
    hash: sha256:abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890
    size: 2048
    format: markdown
  - path: knowledge/testing/patterns.md
    domain: testing
    description: "General testing patterns and conventions"
    source-path: knowledge/testing/patterns.md
    hash: sha256:1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef
    size: 1536
    format: markdown
  - path: knowledge/testing/fixtures.md
    domain: testing
    description: "Test fixture management and lifecycle"
    source-path: knowledge/testing/fixtures.md
    hash: sha256:7890abcdef1234567890abcdef1234567890abcdef1234567890abcdef123456
    size: 1024
    format: markdown
```

#### Manifest Field Reference

| Field | Required | Description |
|-------|----------|-------------|
| `type` | Yes | Always `knowledge` for this transfer type. |
| `domain` | Yes | Primary knowledge domain label (e.g., `testing`, `architecture`, `deployment`). |
| `items` | Yes | Array of individual knowledge files. At least one item required. |
| `items[].path` | Yes | Path within the payload directory. Relative to `payload/`. |
| `items[].domain` | No | Domain label for this specific item (defaults to top-level `domain`). |
| `items[].description` | Yes | Human-readable description of what this file contains. |
| `items[].source-path` | No | The original path in the sender's HQ. Helps the receiver understand context. |
| `items[].hash` | Yes | SHA-256 hash of the individual file. |
| `items[].size` | Yes | File size in bytes. |
| `items[].format` | No | File format hint (`markdown`, `yaml`, `json`, `text`). Defaults to `markdown`. |

### 3.4 Provenance

The `metadata/provenance.yaml` file records the origin and history of the knowledge being shared:

```yaml
origin:
  owner: stefan
  instance-id: stefan-hq-primary
  transferred-at: "2026-02-16T14:30:00Z"
history:
  - event: created
    by: stefan
    at: "2026-01-15T09:00:00Z"
    note: "Captured during BrandStage E2E testing project"
  - event: updated
    by: stefan
    at: "2026-02-10T14:00:00Z"
    note: "Added Clerk auth testing patterns from hq-cloud project"
  - event: transferred
    by: stefan
    to: alex
    at: "2026-02-16T14:30:00Z"
    note: "Shared for Synesis E2E testing work"
```

Provenance is append-only. When a receiver later re-shares knowledge they received, they append their own history entries. This creates a traceable lineage for every piece of knowledge in the federation.

#### Provenance Field Reference

| Field | Required | Description |
|-------|----------|-------------|
| `origin.owner` | Yes | The operator who originally created this knowledge. |
| `origin.instance-id` | Yes | The HQ instance where this knowledge originated. |
| `origin.transferred-at` | Yes | When this specific transfer was created. |
| `history` | Yes | Array of events in chronological order. |
| `history[].event` | Yes | Event type: `created`, `updated`, `transferred`, `adapted`. |
| `history[].by` | Yes | Who performed this event (operator name). |
| `history[].at` | Yes | When this event occurred (ISO 8601 UTC). |
| `history[].note` | No | Human-readable context for this event. |
| `history[].to` | No | Recipient (for `transferred` events only). |

### 3.5 Packaging Rules

1. All knowledge files must be under the `payload/knowledge/` directory.
2. File names and directory structure are preserved from the sender's HQ.
3. Binary files (images, diagrams) are allowed but should be kept small — the recommended maximum per-transfer payload size is **1 MB** for knowledge transfers.
4. Symbolic links are resolved before packaging — the bundle contains actual file content, not links.
5. Files outside the `payload/` directory are not part of the transfer and must be ignored.

### 3.6 Receiving Behavior

When a knowledge transfer arrives:

1. **Verify integrity.** Check `envelope.payload-hash` against the computed hash of the payload. Check individual file hashes from the manifest. If any hash mismatches, quarantine the transfer (`ERR_TXFR_HASH_MISMATCH`).
2. **Stage to inbox.** Extract files to `workspace/world/inbox/{sender}/knowledge/{transfer-id}/`.
3. **Display preview.** Show the operator: who sent it, what domain, how many files, descriptions.
4. **Operator reviews.** The operator reads the staged files and decides what to integrate.
5. **Integration.** The operator (or an automated rule at Trust Level 2) moves accepted files into the HQ's knowledge base. The target path is the operator's choice — the `source-path` from the manifest is a suggestion, not a requirement.
6. **Log the transfer.** Write a transfer log entry to `workspace/world/transfers/`.

---

## 4. Worker Pattern Transfer Type

### 4.1 Purpose

A worker pattern transfer carries the definition of a worker — not as a rigid template to be copied verbatim, but as a **growth seed** that the receiving HQ adapts to its own environment. This is the protocol's implementation of the **pollination** concept from the fractal growth model.

The key distinction: a worker pattern transfer carries the **genome**, not the **organism**. The sender's qa-tester worker has been shaped by the sender's projects, knowledge, and operator preferences. The pattern strips away that local context and distills the worker's structural essence — what it is, what it can do, what it needs — so the receiver can grow their own version.

### 4.2 Payload Structure

```
payload/
├── manifest.yaml              # What's in this transfer
├── worker/
│   ├── worker.yaml            # Worker definition
│   └── skills/                # Skill definitions
│       ├── test-plan.md
│       └── write-test.md
└── metadata/
    ├── provenance.yaml        # Origin and history
    └── adaptation.yaml        # How to adapt this pattern
```

### 4.3 Worker Definition (worker.yaml)

The `worker.yaml` in a transfer bundle is a **sanitized** version of the sender's actual worker definition. Sanitization rules:

| Included | Excluded |
|----------|----------|
| Worker ID, type, description | Internal operator-specific instructions |
| Skill list with summaries | Project-specific task assignments |
| Knowledge domain references (labels, not paths) | Absolute file paths to local knowledge |
| Tool requirements (external dependencies) | Secrets, API keys, tokens |
| General behavioral instructions | References to specific PRDs or stories |

Example sanitized `worker.yaml`:

```yaml
id: qa-tester
type: CodeWorker
description: "Automated testing specialist — E2E test planning, test writing, CI integration"

skills:
  - id: test-plan
    description: "Generate comprehensive test plans from PRDs and acceptance criteria"
    file: skills/test-plan.md
  - id: write-test
    description: "Write E2E and integration tests using Playwright and Vitest"
    file: skills/write-test.md

knowledge-domains:
  - testing
  - e2e
  - ci-cd

tools:
  - playwright
  - vitest
  - typescript

instructions: |
  You are a QA testing specialist. Your role is to ensure code quality
  through comprehensive test coverage.

  Core principles:
  - Test behavior, not implementation
  - Prefer E2E tests for user-facing flows
  - Use fixtures for test data management
  - Clean up test state in teardown, not setup
```

### 4.4 Skill Definitions

Skill files (`skills/*.md`) are transferred as-is, with the same sanitization applied — project-specific references are generalized, absolute paths are removed, but the skill's structure, instructions, and methodology are preserved.

### 4.5 Adaptation Notes

The `metadata/adaptation.yaml` file provides guidance for the receiving operator on how to adapt this worker pattern to their environment:

```yaml
pattern-name: qa-tester
pattern-version: "2.1"
pattern-origin: stefan

# What the receiving HQ needs to have for this worker to function
requires:
  knowledge-domains:
    - testing                  # Receiver needs testing knowledge
    - e2e                      # Receiver needs E2E testing knowledge
  tools:
    - playwright               # External dependency (npm package)
    - vitest                   # External dependency (npm package)
  minimum-hq-version: v1      # Minimum HQ structure version

# Points where the receiver should customize the worker
customization-points:
  - field: worker.yaml > instructions
    guidance: "Adapt to your project's testing conventions, frameworks, and code style"
    priority: high
  - field: skills/test-plan.md
    guidance: "Update test plan template to match your team's documentation format"
    priority: medium
  - field: skills/write-test.md
    guidance: "Adjust code generation patterns for your technology stack"
    priority: medium

# What was intentionally left out of the transfer
not-included:
  - "Knowledge files (testing patterns, learnings) — request via a separate knowledge transfer"
  - "Project-specific configuration — will need to be added for your projects"
  - "CI/CD integration details — depends on your pipeline setup"

# Notes from the sender on how this worker evolved
evolution-notes: |
  This worker started as a basic test writer and evolved through the
  BrandStage and hq-cloud projects. Key evolution points:
  - v1.0: Basic test generation from acceptance criteria
  - v1.5: Added test plan skill after realizing ad-hoc test writing
    missed edge cases
  - v2.0: Added Clerk auth testing patterns and fixture management
  - v2.1: Refined test cleanup patterns (teardown, not setup)
```

#### Adaptation Field Reference

| Field | Required | Description |
|-------|----------|-------------|
| `pattern-name` | Yes | The worker ID this pattern describes. |
| `pattern-version` | Yes | Version of this worker pattern (semver-ish). |
| `pattern-origin` | Yes | The operator who developed this pattern. |
| `requires.knowledge-domains` | No | Knowledge domains the worker depends on. |
| `requires.tools` | No | External tools/packages the worker needs. |
| `requires.minimum-hq-version` | No | Minimum HQ structure version needed. |
| `customization-points` | Yes | Array of places where the receiver should customize. |
| `customization-points[].field` | Yes | Which file or field to customize. |
| `customization-points[].guidance` | Yes | How to customize it. |
| `customization-points[].priority` | No | `high`, `medium`, `low`. Default: `medium`. |
| `not-included` | No | Array of strings describing what was intentionally excluded. |
| `evolution-notes` | No | History of how this worker evolved (helps receiver understand design decisions). |

### 4.6 Packaging Rules

1. The `worker.yaml` must be sanitized before packaging. Implementations must strip:
   - References to specific local file paths (replace with domain labels).
   - Project-specific instructions (generalize or remove).
   - Secrets, tokens, API keys (never include).
   - Operator-personal preferences (unless they are generally useful).
2. Skill files under `worker/skills/` are included as-is after sanitization.
3. Knowledge files are **not** included in worker pattern transfers. Knowledge domains are referenced by label in `worker.yaml` and `adaptation.yaml`. The receiver must obtain knowledge separately (via a knowledge transfer or by building their own).
4. Maximum recommended payload size for worker pattern transfers: **512 KB**.

### 4.7 Receiving Behavior

When a worker pattern transfer arrives:

1. **Verify integrity.** Same as knowledge transfers — hash verification on envelope and individual files.
2. **Stage to inbox.** Extract to `workspace/world/inbox/{sender}/worker-pattern/{pattern-name}/`.
3. **Display preview.** Show the operator:
   - Worker name, type, description.
   - Skills included.
   - Required knowledge domains and tools.
   - Customization points with guidance.
   - What is not included.
4. **Operator reviews.** This is always a human-gated step. Worker patterns are structural changes to the HQ — a new worker means new capabilities, new knowledge requirements, potentially new tool installations. Auto-integration is never allowed for worker patterns, regardless of trust level.
5. **Adaptation.** The operator customizes the worker.yaml and skill files for their environment:
   - Updates knowledge domain references to point to their own knowledge.
   - Adjusts instructions for their project conventions.
   - Modifies skill templates for their technology stack.
6. **Activation.** The operator places the adapted worker in `workers/{team}/{worker-id}/` and adds it to `workers/registry.yaml`. The worker is now live.
7. **Log the transfer.** Write a transfer log entry with `integration-status: adapted`.

### 4.8 The Pollination Lifecycle

Worker pattern sharing follows a natural lifecycle that mirrors biological pollination:

```
 SENDER HQ                          RECEIVER HQ
 ─────────                          ───────────

 Worker grows through               (No equivalent worker)
 project work, operator
 feedback, learning cycles
        │
        ▼
 Pattern extracted
 (sanitized, generalized)
        │
        ▼
 Transfer sent ─────────────────►   Transfer received
                                           │
                                           ▼
                                    Operator reviews pattern
                                    (adaptation.yaml guides)
                                           │
                                           ▼
                                    Pattern adapted to local
                                    environment (knowledge,
                                    tools, conventions)
                                           │
                                           ▼
                                    Worker activated
                                           │
                                           ▼
                                    Worker grows through
                                    receiver's own project
                                    work, diverging from
                                    the original
```

Over time, the receiver's worker develops its own character — shaped by different projects, different knowledge, different operator preferences. It shares a common ancestor with the sender's worker, but it is its own organism. This is the fractal principle at work: the same seed pattern grows differently in different soil.

---

## 5. Context Transfer Type

### 5.1 Purpose

A context transfer carries project briefs, status snapshots, or coordination information that helps a peer's workers understand the broader context of a collaboration. Unlike knowledge (which is durable and reusable) or worker patterns (which are structural), context is **situational** — it represents a point-in-time view of a project, task, or coordination state.

Context transfers are the "status reports" of the federation. They help connected HQ instances stay aligned on shared work.

### 5.2 Payload Structure

```
payload/
├── manifest.yaml              # What's in this transfer
├── context/
│   ├── project-brief.md       # High-level project description (optional)
│   ├── status.yaml            # Current project/task status (optional)
│   └── coordination.yaml      # Who owns what, dependencies (optional)
└── metadata/
    └── provenance.yaml        # Origin and snapshot timing
```

At least one of the three context files (`project-brief.md`, `status.yaml`, `coordination.yaml`) must be present. They can be used individually or in combination.

### 5.3 Payload Manifest

```yaml
type: context
project: hq-cloud                     # Project this context relates to
snapshot-at: "2026-02-16T14:30:00Z"   # When this snapshot was taken
items:
  - path: context/project-brief.md
    description: "High-level project brief for hq-cloud"
    hash: sha256:abcdef...
    size: 3072
  - path: context/status.yaml
    description: "Current implementation status as of 2026-02-16"
    hash: sha256:123456...
    size: 512
  - path: context/coordination.yaml
    description: "Work ownership and dependency map"
    hash: sha256:789abc...
    size: 256
```

### 5.4 Project Brief (project-brief.md)

A markdown document providing high-level project context. This is not the full PRD — it is a curated summary designed for a peer who needs to understand the project well enough to contribute.

Contents typically include:

- Project name and one-paragraph description.
- Architecture overview (relevant to the peer's contribution).
- Technology stack.
- Key design decisions the peer needs to know.
- What the peer's workers are expected to contribute.

The brief is authored by the sender, not auto-extracted from the PRD. This allows the sender to control what project details are shared and how they are framed for the peer's context.

### 5.5 Status Snapshot (status.yaml)

A structured snapshot of project progress:

```yaml
project: hq-cloud
snapshot-at: "2026-02-16T14:30:00Z"
phase: implementation
overall-progress: 45                   # Percentage (0-100)

stories:
  completed:
    - id: US-001
      title: "World Protocol Specification"
    - id: US-002
      title: "HQ Identity & Manifest Schema"
    - id: US-003
      title: "Peering Ceremony & Connection Model"
  in-progress:
    - id: US-004
      title: "Transfer Protocol"
      assignee: stefan/architect
      progress: 60
    - id: US-005
      title: "Local World State & Configuration"
      assignee: alex/backend-dev
      progress: 20
  pending:
    - id: US-006
      title: "Export/Import Implementation"
    - id: US-007
      title: "World Skill for Workers"

blockers:
  - story: US-005
    description: "Waiting on transfer protocol spec (US-004) to finalize config schema"
    severity: medium
    since: "2026-02-15T00:00:00Z"

notes: |
  Architecture team is ahead of schedule on spec work. Implementation
  team is ramping up. Expecting US-004 completion today, which unblocks
  US-005 and US-006.
```

### 5.6 Coordination Map (coordination.yaml)

A structured view of who owns what in a cross-HQ collaboration:

```yaml
project: hq-cloud
updated-at: "2026-02-16T14:30:00Z"

ownership:
  - area: "API endpoints and backend logic"
    owner: alex
    workers: [backend-dev, devops]
    stories: [US-003, US-004, US-005]
  - area: "Web frontend and UI"
    owner: stefan
    workers: [frontend-dev, designer]
    stories: [US-006, US-007, US-008]
  - area: "E2E testing"
    owner: alex
    workers: [qa-tester]
    stories: [US-009]

dependencies:
  - from: stefan/frontend-dev
    to: alex/backend-dev
    description: "Frontend needs auth API endpoints before integration"
    story: US-006
    status: blocked
  - from: alex/qa-tester
    to: stefan/frontend-dev
    description: "QA needs test credentials for E2E auth tests"
    story: US-009
    status: waiting

communication:
  channel: "#hq-cloud-collab"
  cadence: "Status sync every Monday and Thursday"
  escalation: "Blockers go to operator DMs immediately"
```

### 5.7 Packaging Rules

1. At least one context file must be present in `payload/context/`.
2. Context files should be current — stale context is worse than no context. The `snapshot-at` timestamp in the manifest tells the receiver how fresh the data is.
3. Context transfers should be compact. Recommended maximum payload size: **256 KB**.
4. PRDs and detailed project documents should be shared as knowledge transfers, not context transfers. The context brief is a summary, not a dump.
5. Sensitive project information (budgets, personnel details, client names) should be omitted unless the trust level warrants it and the operator explicitly includes it.

### 5.8 Receiving Behavior

When a context transfer arrives:

1. **Verify integrity.** Hash verification on envelope and individual files.
2. **Stage to inbox.** Extract to `workspace/world/inbox/{sender}/context/{project}/`.
3. **Display preview.** Show the operator: project name, snapshot timestamp, which context files are included, blocker count.
4. **Operator reviews.** At Trust Level 2 for active projects, auto-staging may be configured. Otherwise, manual approval.
5. **Integration.** Context is typically placed in `workspace/world/context/{sender}/{project}/` — a transient location, not the permanent knowledge base. Context is ephemeral.
6. **Worker access.** Workers involved in the shared project can read context files to inform their work.
7. **Log the transfer.** Write a transfer log entry.

### 5.9 Context Freshness

Context transfers have an implicit freshness concern that knowledge and worker pattern transfers do not. A status snapshot from last week may actively mislead workers. Implementations should:

- Display the age of context files prominently (e.g., "Status snapshot: 3 days old").
- Allow operators to set a staleness threshold (e.g., "flag context older than 48 hours").
- Encourage frequent context updates for active collaborations.

---

## 6. System Transfer Type

### 6.1 Purpose

System transfers are protocol-level messages that maintain the health and state of connections. They are not human content — they are infrastructure. System transfers use the same envelope format but carry minimal or no payload.

### 6.2 Sub-Types

| Sub-Type | Purpose | Payload | Response Expected |
|----------|---------|---------|-------------------|
| `ping` | Check if a peer is reachable and responsive. | None (`payload-size: 0`). | Yes — a `pong`. |
| `pong` | Response to a `ping`. | None. | No. |
| `manifest-refresh` | Updated manifest from a peer. | Full manifest document in `payload/manifest/`. | No (but may trigger a refresh in return). |
| `disconnect` | Notification that the sender is disconnecting. | Optional message in `payload/message.txt`. | No. |
| `suspend-notice` | Notification that the sender is suspending the connection. | Optional reason in `payload/message.txt`. | No. |

### 6.3 System Envelope

System transfers include a `sub-type` field within the payload manifest:

```yaml
# envelope.yaml
envelope:
  id: txfr-sys-ping-001
  type: system
  from: stefan
  to: alex
  timestamp: "2026-02-16T15:00:00Z"
  version: v1
  payload-hash: sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  payload-size: 0
  transport: file

# payload/manifest.yaml
type: system
sub-type: ping
```

Note: The `payload-hash` for a `ping` with no payload files is the SHA-256 of the empty string: `e3b0c4...52b855`.

### 6.4 Auto-Processing

System transfers may be auto-processed without operator approval at Trust Level 1 (Verified) or higher:

| Sub-Type | Trust Level 0 | Trust Level 1 | Trust Level 2 |
|----------|---------------|---------------|---------------|
| `ping` | Manual | Auto | Auto |
| `pong` | Manual | Auto | Auto |
| `manifest-refresh` | Manual | Auto | Auto |
| `disconnect` | Manual | Auto | Auto |
| `suspend-notice` | Manual | Auto | Auto |

---

## 7. Transfer Versioning

### 7.1 The Problem

Knowledge evolves. Worker patterns are refined. Project status changes daily. When HQ-A shares something with HQ-B, it is rarely a one-time event. The same knowledge file gets updated, the same worker pattern improves, the same project status refreshes. The protocol needs a way to handle updates, detect conflicts, and support rollback.

### 7.2 Transfer Chains

Transfers that update previous transfers form **chains** linked by the `supersedes` field:

```
Chain: E2E Testing Knowledge

  txfr-aaa111 (sequence: 1)     First share — basic testing patterns
       │
       ▼
  txfr-bbb222 (sequence: 2)     Update — added Clerk auth patterns
  supersedes: txfr-aaa111
       │
       ▼
  txfr-ccc333 (sequence: 3)     Update — added fixture management
  supersedes: txfr-bbb222
```

Each transfer in a chain has a `supersedes` field pointing to the previous transfer and a `sequence` number indicating its position. The first transfer has `supersedes: null` and `sequence: 1`.

### 7.3 First Transfer

A first transfer establishes the beginning of a potential chain:

```yaml
envelope:
  id: txfr-e2e-001
  type: knowledge
  from: stefan
  to: alex
  timestamp: "2026-02-16T14:30:00Z"
  version: v1
  description: "E2E testing patterns — initial share"
  payload-hash: sha256:abcdef...
  payload-size: 4096
  supersedes: null
  sequence: 1
  transport: file
```

The receiver stores this transfer in their log. The transfer ID (`txfr-e2e-001`) becomes the chain root.

### 7.4 Updates

When the sender wants to share an updated version of previously transferred content, they create a new transfer that supersedes the previous one:

```yaml
envelope:
  id: txfr-e2e-002
  type: knowledge
  from: stefan
  to: alex
  timestamp: "2026-02-20T10:00:00Z"
  version: v1
  description: "E2E testing patterns — added Clerk auth section"
  payload-hash: sha256:123456...
  payload-size: 6144
  supersedes: txfr-e2e-001
  sequence: 2
  transport: file
```

**Update rules:**

1. The `supersedes` field must reference a valid transfer ID that the sender previously sent to this receiver.
2. The `sequence` number must be exactly one greater than the superseded transfer's sequence.
3. The transfer type must match the superseded transfer's type (you cannot update a knowledge transfer with a context transfer).
4. The `from` and `to` fields must match the original chain (same sender, same receiver).
5. The payload is a **complete replacement**, not a diff. The new payload stands on its own.

### 7.5 Conflict Detection

A conflict occurs when:

1. The receiver has locally modified content that originated from a previous transfer in the chain.
2. The sender sends an update that supersedes the original.
3. The receiver now has two divergent versions: their local modifications and the sender's update.

**Detection mechanism:**

When a transfer with a `supersedes` field arrives, the receiver checks:

1. Does the superseded transfer exist in the local transfer log? If not, `ERR_TXFR_UNKNOWN_PREDECESSOR`.
2. Was the content from the superseded transfer integrated locally? Check the integration log.
3. Has the integrated content been modified since integration? Compare the current file hash against the hash recorded at integration time.
4. If the content was modified locally, flag a **conflict**.

```
 SENDER                              RECEIVER
 ──────                              ────────

 txfr-001: knowledge v1 ────────►   Receives, integrates
                                     Modifies locally (adds own patterns)
                                     Local hash diverges from txfr-001 hash

 txfr-002: knowledge v2 ────────►   Receives update
 supersedes: txfr-001                Detects: txfr-001 content was modified
                                     CONFLICT flagged
```

### 7.6 Conflict Resolution

In v1, conflict resolution is manual. When a conflict is detected, the receiver is presented with three options:

| Option | Action | When to Use |
|--------|--------|-------------|
| **Accept update** | Replace local content with the sender's update. Local modifications are lost. | When the sender's version is clearly better or more complete. |
| **Keep local** | Reject the update. Keep local modifications. Mark the incoming transfer as `rejected-conflict`. | When local modifications are more valuable than the update. |
| **Merge manually** | Both versions are staged side-by-side for the operator to merge. | When both versions contain valuable changes that should be combined. |

The receiver's decision is logged:

```yaml
# In workspace/world/transfers/2026-02-20.yaml
- transfer-id: txfr-e2e-002
  direction: received
  from: stefan
  type: knowledge
  timestamp: "2026-02-20T10:05:00Z"
  status: conflict-resolved
  resolution: merge-manual
  conflict-with: txfr-e2e-001
  notes: "Merged sender's Clerk auth section with local Supabase auth patterns"
```

### 7.7 Rollback

An operator can roll back to a previous version of transferred content by referencing a specific transfer in the chain:

**Rollback process:**

1. The operator identifies the transfer they want to restore from the transfer log.
2. The operator locates the staged bundle in `workspace/world/transfers/` or `workspace/world/inbox/` (transfer bundles are retained after integration).
3. The operator replaces the current integrated content with the content from the target transfer.
4. A rollback entry is written to the transfer log.

```yaml
# Rollback log entry
- event: rollback
  transfer-id: txfr-e2e-002        # The transfer being rolled back from
  target-transfer-id: txfr-e2e-001  # The transfer being rolled back to
  at: "2026-02-21T09:00:00Z"
  by: alex
  reason: "v2 patterns broke our CI pipeline, reverting to v1"
```

**Bundle retention:**

To support rollback, transfer bundles must be retained after integration. The recommended retention policy:

| Trust Level | Retention Period |
|-------------|-----------------|
| 0 (Open) | 30 days |
| 1 (Verified) | 90 days |
| 2 (Trusted) | 180 days |

After the retention period, old bundles may be archived or deleted. The transfer log (metadata only) is kept indefinitely.

### 7.8 Chain Integrity

A transfer chain must be internally consistent. The following invariants must hold:

1. **Monotonic sequences.** Within a chain, sequence numbers must strictly increase (1, 2, 3, ...). Gaps are allowed (the sender may have created intermediate versions they did not share).
2. **Single predecessor.** Each transfer supersedes at most one previous transfer. There are no merge commits in a transfer chain (that would require multi-party transfer support, which is out of scope for v1).
3. **Type consistency.** All transfers in a chain must have the same `type`.
4. **Direction consistency.** All transfers in a chain must have the same `from` and `to`.
5. **No cycles.** A transfer cannot supersede a transfer that comes later in its own chain.

---

## 8. Transport Abstraction

### 8.1 Principle

The Transfer Protocol separates **what is exchanged** (envelopes and payloads) from **how it is delivered** (the transport). The same transfer bundle — the same `envelope.yaml`, the same `payload/` directory — can travel over any transport. The sender sets the `transport` field in the envelope to record which mechanism was used, but the receiver processes the bundle identically regardless of how it arrived.

### 8.2 Transport Interface

Every transport implementation must provide four operations:

| Operation | Signature | Description |
|-----------|-----------|-------------|
| **send** | `send(envelope, payload) -> receipt` | Package and deliver a transfer to a peer. Returns a receipt confirming delivery attempt. |
| **receive** | `receive() -> (envelope, payload)[]` | Check for and retrieve incoming transfers from peers. |
| **verify** | `verify(envelope, payload) -> boolean` | Confirm that the received payload matches the envelope's integrity fields. |
| **status** | `status(transfer-id) -> state` | Check the delivery state of a previously sent transfer. |

These operations are logical. Each transport implements them according to its own mechanism. The HQ instance interacts with all transports through this uniform interface.

### 8.3 File Transport (MVP — v1 Reference Implementation)

The file transport is the simplest possible transport. Transfers are directories of files that operators exchange however they choose — email, Slack upload, shared drive, USB stick, git commit. The protocol does not care how the directory gets from A to B.

#### Bundle Format

A transfer bundle is a directory (or an archive of a directory) with this structure:

```
txfr-a1b2c3d4e5f6/
├── envelope.yaml              # Transfer envelope
├── payload/
│   ├── manifest.yaml          # Payload manifest
│   ├── {type}/                # knowledge/, worker/, context/, or manifest/
│   │   └── ...                # Actual files
│   └── metadata/
│       ├── provenance.yaml    # Origin and history
│       └── adaptation.yaml    # (worker-pattern only)
└── VERIFY.sha256              # File-by-file SHA-256 checksums
```

#### VERIFY.sha256 Format

A plain text file with one line per file in the bundle, formatted as:

```
sha256:abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890  payload/manifest.yaml
sha256:1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef  payload/knowledge/e2e-learnings.md
sha256:7890abcdef1234567890abcdef1234567890abcdef1234567890abcdef123456  payload/metadata/provenance.yaml
```

Each line: `sha256:{64 hex chars}  {relative path from bundle root}` (two spaces between hash and path, matching `sha256sum` output format).

#### Send (Export)

1. Operator selects items to export and the target peer.
2. HQ creates the transfer bundle directory.
3. HQ writes `envelope.yaml` with all required fields.
4. HQ packages the payload under `payload/`.
5. HQ computes SHA-256 hashes for all payload files and writes `VERIFY.sha256`.
6. HQ computes the aggregate payload hash and sets `envelope.payload-hash`.
7. Optionally, the bundle is archived (`.tar.gz` or `.zip`) for easier sharing.
8. The operator delivers the bundle to the peer through any out-of-band mechanism.

#### Receive (Import)

1. Operator receives a bundle from a peer (as a directory or archive).
2. If archived, extract to a temporary directory.
3. Read `envelope.yaml` and validate all required fields.
4. Verify `envelope.from` is a connected peer.
5. Run integrity verification (see Section 10).
6. Display import preview to the operator.
7. On approval, stage payload to `workspace/world/inbox/{sender}/{type}/`.
8. Log the transfer.

#### Status

File transport status is implicit:

| State | Meaning |
|-------|---------|
| `sent` | The bundle was created and placed in the export directory. |
| `delivered` | The peer has acknowledged receipt (out-of-band confirmation). |
| `failed` | The operator reports that delivery failed. |

There is no automatic delivery confirmation in the file transport. The sender marks a transfer as `delivered` when the peer confirms receipt through whatever channel they are using (Slack message, email, etc.).

### 8.4 Git Transport (Future)

In the git transport, transfers are committed to a shared repository:

```
shared-repo/
├── stefan-to-alex/
│   ├── txfr-aaa111/           # First transfer
│   │   ├── envelope.yaml
│   │   ├── payload/
│   │   └── VERIFY.sha256
│   └── txfr-bbb222/           # Update
│       ├── envelope.yaml
│       ├── payload/
│       └── VERIFY.sha256
└── alex-to-stefan/
    └── txfr-ccc333/
        ├── envelope.yaml
        ├── payload/
        └── VERIFY.sha256
```

**Send:** Commit a new transfer directory and push. **Receive:** Pull and scan for new directories. **Verify:** Git's object hashing provides an additional integrity layer. **Status:** Check git log for the transfer directory.

The git transport adds built-in history, branching (for conflict resolution), and diffing. It is the natural choice for teams already using git for collaboration.

### 8.5 HTTP Transport (Future)

A REST-based transport where an HQ instance exposes an API for receiving transfers:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/world/transfers` | `POST` | Submit a new transfer. Body: multipart with envelope + payload files. |
| `/world/transfers/{id}` | `GET` | Retrieve a specific transfer by ID. |
| `/world/transfers?since={ts}` | `GET` | List transfers since a timestamp. |
| `/world/transfers/{id}/status` | `GET` | Check delivery status. |

Authentication via API keys or OAuth tokens, configured during the peering ceremony. The HTTP transport enables real-time transfer without requiring both operators to be online simultaneously (the API server queues incoming transfers).

### 8.6 HIAMP Transport (Future)

HIAMP's `share` intent can carry World Protocol transfers. The envelope is serialized as YAML and embedded in the HIAMP message body. The payload files are attached using HIAMP's file sharing mechanism (inline embedding for small payloads, Slack file upload for large ones).

**Mapping:**

| World Protocol Concept | HIAMP Equivalent |
|-----------------------|------------------|
| Envelope | YAML block in message body |
| Payload files | Inline code blocks or Slack file attachments |
| `from` / `to` | `from:owner/system` / `to:owner/system` |
| Transfer type | Described in HIAMP message body |
| Integrity verification | Receiver verifies after extraction |

The HIAMP transport uses the reserved `system` worker ID for protocol-level communication — transfers flow between `stefan/system` and `alex/system`, not between specific workers.

### 8.7 Transport Selection per Peer

An operator configures their preferred transport for each peer:

```yaml
# In config/world.yaml
connections:
  - peer: alex
    transport: file
    transport-config:
      export-path: ~/hq-exports/alex/
      import-path: ~/hq-imports/alex/

  - peer: maria
    transport: git
    transport-config:
      repo: git@github.com:team/hq-transfers.git
      branch: main

  - peer: jordan
    transport: http
    transport-config:
      endpoint: https://jordan-hq.example.com/world
      api-key-ref: secrets/jordan-api-key
```

Different peers can use different transports. An operator might use file exchange with one peer, git sync with another, and HTTP with a third. The transfer bundles are identical — only the delivery mechanism changes.

### 8.8 Transport-Agnostic Envelope Guarantee

The following guarantee must hold across all transports:

> **Given the same `envelope.yaml` and `payload/` directory, any transport must produce a byte-identical result when the receiver extracts the transfer.**

This means:
- Transports must not modify envelope or payload contents during transit.
- Archive formats (tar.gz, zip) must be extractable to the original directory structure.
- Git commits must preserve file contents exactly.
- HTTP transfer encoding must not alter file bytes.
- HIAMP inline embedding must preserve file contents through the encode/decode cycle.

---

## 9. Transfer Lifecycle

### 9.1 State Machine

Every transfer goes through the following states:

```
 SENDER SIDE                         RECEIVER SIDE
 ───────────                         ─────────────

 ┌──────────┐
 │ DRAFTING │  Sender selects items
 └────┬─────┘  and prepares bundle
      │
      ▼
 ┌──────────┐
 │ PACKAGED │  Bundle is created
 └────┬─────┘  with envelope +
      │        payload + checksums
      ▼
 ┌──────────┐     transport          ┌───────────┐
 │   SENT   │ ─────────────────────► │ RECEIVED  │
 └────┬─────┘                        └─────┬─────┘
      │                                    │
      │                                    ▼
      │                              ┌───────────┐
      │                              │ VERIFYING │  Hash checks
      │                              └─────┬─────┘
      │                                    │
      │                          ┌─────────┼──────────┐
      │                          ▼         │          ▼
      │                    ┌──────────┐    │    ┌────────────┐
      │                    │QUARANTINE│    │    │  VERIFIED  │
      │                    │(tampered)│    │    └─────┬──────┘
      │                    └──────────┘    │          │
      │                                   │          ▼
      │                                   │    ┌───────────┐
      │                                   │    │  STAGED   │  In inbox
      │                                   │    └─────┬─────┘
      │                                   │          │
      │                              ┌────┴───┐  ┌──┴────────┐
      │                              │REJECTED│  │ APPROVED  │
      │                              └────────┘  └─────┬─────┘
      │                                                │
      │                                          ┌─────┴──────┐
      │                                          │ INTEGRATED │
      ▼                                          └────────────┘
 ┌──────────┐
 │CONFIRMED │  (when receiver reports)
 └──────────┘
```

### 9.2 State Descriptions

| State | Side | Description |
|-------|------|-------------|
| **DRAFTING** | Sender | The operator is selecting items and configuring the transfer. |
| **PACKAGED** | Sender | The bundle is created with envelope, payload, and checksums. Ready to send. |
| **SENT** | Sender | The bundle has been delivered via the configured transport. |
| **RECEIVED** | Receiver | The bundle has arrived and the envelope has been parsed. |
| **VERIFYING** | Receiver | Hash verification is in progress. |
| **QUARANTINED** | Receiver | Hash verification failed. The transfer is isolated for inspection. |
| **VERIFIED** | Receiver | Hash verification passed. The payload is intact. |
| **STAGED** | Receiver | The payload is extracted to the inbox, awaiting operator review. |
| **REJECTED** | Receiver | The operator declined the transfer. |
| **APPROVED** | Receiver | The operator approved the transfer for integration. |
| **INTEGRATED** | Receiver | The payload has been integrated into the HQ. |
| **CONFIRMED** | Sender | The sender has received confirmation that the transfer was accepted. |

### 9.3 Transfer Log Entry

Every state transition is logged. The transfer log lives at `workspace/world/transfers/` with one file per day:

```yaml
# workspace/world/transfers/2026-02-16.yaml
transfers:
  - id: txfr-e2e-001
    direction: sent
    type: knowledge
    from: stefan
    to: alex
    timestamp: "2026-02-16T14:30:00Z"
    state: sent
    payload-hash: sha256:abcdef...
    payload-size: 4096
    description: "E2E testing patterns"

  - id: txfr-qa-pattern-001
    direction: received
    type: worker-pattern
    from: alex
    to: stefan
    timestamp: "2026-02-16T15:00:00Z"
    state: integrated
    payload-hash: sha256:123456...
    payload-size: 8192
    description: "Backend dev worker pattern"
    integrated-at: "2026-02-16T15:30:00Z"
    integrated-to: workers/dev-team/backend-dev/
```

---

## 10. Integrity & Verification

### 10.1 Hash Computation

All hashes use SHA-256. The format in envelopes and manifests is `sha256:{64 lowercase hex characters}`.

#### Individual File Hash

The SHA-256 hash of the raw file contents, computed byte-for-byte. No normalization of line endings or encoding.

#### Payload Hash (Aggregate)

The `envelope.payload-hash` is computed as the SHA-256 hash of all individual file hashes concatenated in lexicographic order of their paths:

```
payload-hash = SHA-256(
  hash("payload/knowledge/e2e-learnings.md") +
  hash("payload/manifest.yaml") +
  hash("payload/metadata/provenance.yaml")
)
```

Where `+` is string concatenation of the hex digests, and paths are sorted lexicographically (ASCII sort). This is deterministic — given the same set of files, any implementation will compute the same aggregate hash.

### 10.2 Verification Steps

When a receiver processes an incoming transfer:

1. **Read the envelope.** Parse `envelope.yaml` and extract `payload-hash` and `payload-size`.
2. **Check payload size.** Compute the total size of all files under `payload/`. Compare with `envelope.payload-size`. If mismatch: `ERR_TXFR_SIZE_MISMATCH`.
3. **Verify VERIFY.sha256.** For each line in `VERIFY.sha256`, compute the SHA-256 of the referenced file and compare. If any mismatch: `ERR_TXFR_HASH_MISMATCH`.
4. **Verify aggregate hash.** Compute the aggregate payload hash and compare with `envelope.payload-hash`. If mismatch: `ERR_TXFR_HASH_MISMATCH`.
5. **Verify manifest hashes.** For each item in `payload/manifest.yaml`, verify the item's `hash` field against the computed hash of the file at `item.path`. If mismatch: `ERR_TXFR_HASH_MISMATCH`.

If any step fails, the transfer is quarantined to `workspace/world/quarantine/{transfer-id}/` and the operator is notified with details about which check failed.

### 10.3 Tamper Detection vs. Corruption

Hash verification cannot distinguish between intentional tampering and accidental corruption (bit rot, truncated download, encoding issues). The protocol treats both the same: the transfer is quarantined and the operator investigates.

For v1, this is sufficient. Future versions may add digital signatures (using the shared secrets from the trust model) to distinguish between "the file was corrupted in transit" and "someone modified the file."

---

## 11. Complete Transfer Examples

### 11.1 Example 1: Knowledge Transfer — E2E Testing Patterns

Stefan shares his E2E testing patterns with Alex. This is a first-time transfer (no supersedes chain).

#### Bundle Directory

```
txfr-e2e4a7b8c9d0/
├── envelope.yaml
├── payload/
│   ├── manifest.yaml
│   ├── knowledge/
│   │   ├── e2e-learnings.md
│   │   └── testing/
│   │       └── clerk-auth-patterns.md
│   └── metadata/
│       └── provenance.yaml
└── VERIFY.sha256
```

#### envelope.yaml

```yaml
envelope:
  id: txfr-e2e4a7b8c9d0
  type: knowledge
  from: stefan
  to: alex
  timestamp: "2026-02-16T14:30:00Z"
  version: v1
  description: |
    E2E testing patterns from BrandStage and hq-cloud projects.
    Covers Clerk auth testing with @clerk/testing, Playwright fixture
    management, test user lifecycle, and cleanup patterns.
  payload-hash: sha256:3f2b7c9d1e4a5680bdf912ce7a438b56c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5
  payload-size: 5632
  supersedes: null
  sequence: 1
  transport: file
```

#### payload/manifest.yaml

```yaml
type: knowledge
domain: testing
items:
  - path: knowledge/e2e-learnings.md
    domain: testing
    description: "Comprehensive E2E testing patterns — auth, fixtures, user management"
    source-path: knowledge/testing/e2e-learnings.md
    hash: sha256:a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890
    size: 3584
    format: markdown
  - path: knowledge/testing/clerk-auth-patterns.md
    domain: testing
    description: "Clerk-specific auth testing patterns — @clerk/testing setup, test users, session fixtures"
    source-path: knowledge/testing/clerk-auth-patterns.md
    hash: sha256:b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890a1
    size: 2048
    format: markdown
```

#### payload/metadata/provenance.yaml

```yaml
origin:
  owner: stefan
  instance-id: stefan-hq-primary
  transferred-at: "2026-02-16T14:30:00Z"
history:
  - event: created
    by: stefan
    at: "2026-01-15T09:00:00Z"
    note: "Initial testing patterns from BrandStage E2E testing project"
  - event: updated
    by: stefan
    at: "2026-02-10T14:00:00Z"
    note: "Added Clerk auth testing patterns from hq-cloud project"
  - event: updated
    by: stefan
    at: "2026-02-14T11:00:00Z"
    note: "Refined cleanup patterns — teardown not setup, per test isolation"
  - event: transferred
    by: stefan
    to: alex
    at: "2026-02-16T14:30:00Z"
    note: "Shared for Synesis E2E testing work"
```

#### VERIFY.sha256

```
sha256:d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3  payload/manifest.yaml
sha256:a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890  payload/knowledge/e2e-learnings.md
sha256:b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890a1  payload/knowledge/testing/clerk-auth-patterns.md
sha256:c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2  payload/metadata/provenance.yaml
```

#### Receiver Experience

When Alex imports this bundle:

```
Transfer Preview:
  From: stefan (Stefan's HQ)
  Type: Knowledge
  Domain: testing
  Files: 2 knowledge files
    - e2e-learnings.md (3,584 bytes) — E2E testing patterns
    - testing/clerk-auth-patterns.md (2,048 bytes) — Clerk auth patterns
  Total size: 5,632 bytes
  Hash: verified
  Chain: new (first transfer, no history)

  Description: E2E testing patterns from BrandStage and hq-cloud
  projects. Covers Clerk auth testing with @clerk/testing, Playwright
  fixture management, test user lifecycle, and cleanup patterns.

  Accept this transfer? [y/n]
```

---

### 11.2 Example 2: Worker Pattern Transfer — QA Tester Pollination

Stefan shares his qa-tester worker pattern with Alex. This demonstrates the pollination concept — Stefan's worker pattern is a growth seed that Alex will adapt to his environment.

#### Bundle Directory

```
txfr-qa7b8c9d0e1f2/
├── envelope.yaml
├── payload/
│   ├── manifest.yaml
│   ├── worker/
│   │   ├── worker.yaml
│   │   └── skills/
│   │       ├── test-plan.md
│   │       └── write-test.md
│   └── metadata/
│       ├── provenance.yaml
│       └── adaptation.yaml
└── VERIFY.sha256
```

#### envelope.yaml

```yaml
envelope:
  id: txfr-qa7b8c9d0e1f2
  type: worker-pattern
  from: stefan
  to: alex
  timestamp: "2026-02-16T16:00:00Z"
  version: v1
  description: |
    QA tester worker pattern (v2.1). E2E test planning, test writing,
    Playwright + Vitest. Evolved through BrandStage and hq-cloud projects.
    Includes adaptation notes for customization.
  payload-hash: sha256:9d0e1f2a3b4c5d6e7f8091a2b3c4d5e6f7809a1b2c3d4e5f6a7b8c9d0e1f2a3b
  payload-size: 12288
  supersedes: null
  sequence: 1
  transport: file
```

#### payload/manifest.yaml

```yaml
type: worker-pattern
pattern-name: qa-tester
pattern-version: "2.1"
items:
  - path: worker/worker.yaml
    description: "QA tester worker definition (sanitized)"
    hash: sha256:e1f2a3b4c5d6e7f8091a2b3c4d5e6f7809a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5
    size: 1024
  - path: worker/skills/test-plan.md
    description: "Test plan generation skill — produces structured test plans from PRDs"
    hash: sha256:f2a3b4c5d6e7f8091a2b3c4d5e6f7809a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6
    size: 4096
  - path: worker/skills/write-test.md
    description: "Test writing skill — generates E2E and integration tests"
    hash: sha256:a3b4c5d6e7f8091a2b3c4d5e6f7809a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7
    size: 5120
```

#### payload/worker/worker.yaml

```yaml
id: qa-tester
type: CodeWorker
description: |
  Automated testing specialist. Plans comprehensive test suites from
  acceptance criteria, writes E2E and integration tests, integrates
  with CI pipelines. Emphasis on behavior-driven testing and test
  data isolation.

skills:
  - id: test-plan
    description: "Generate structured test plans from PRDs and acceptance criteria"
    file: skills/test-plan.md
  - id: write-test
    description: "Write E2E and integration tests using Playwright and Vitest"
    file: skills/write-test.md

knowledge-domains:
  - testing
  - e2e
  - ci-cd

tools:
  - playwright
  - vitest
  - typescript

instructions: |
  You are a QA testing specialist. Your primary role is ensuring code
  quality through comprehensive, maintainable test coverage.

  Core principles:
  - Test behavior, not implementation details
  - Prefer E2E tests for user-facing flows, integration tests for API
  - Use fixtures for test data — never hardcode credentials or state
  - Clean up test state in teardown (afterAll), not setup (beforeAll)
  - Each test file should be independently runnable
  - Name tests descriptively: "should [expected behavior] when [condition]"

  Test planning approach:
  - Start from acceptance criteria in the PRD
  - Identify happy paths first, then edge cases, then error cases
  - Group tests by feature area, not by technical layer
  - Estimate coverage gaps and flag them

  Test writing approach:
  - One assertion per test when possible
  - Use page object patterns for UI tests
  - Parameterize tests when testing multiple inputs
  - Include both positive and negative test cases
```

#### payload/metadata/adaptation.yaml

```yaml
pattern-name: qa-tester
pattern-version: "2.1"
pattern-origin: stefan

requires:
  knowledge-domains:
    - testing
    - e2e
  tools:
    - playwright
    - vitest
  minimum-hq-version: v1

customization-points:
  - field: worker.yaml > instructions
    guidance: |
      Adapt the testing principles to your project's conventions.
      If you use a different test runner (Jest, Cypress), update
      the tool references and adjust the testing approach section.
    priority: high
  - field: skills/test-plan.md
    guidance: |
      Update the test plan template to match your team's
      documentation format. The structure is flexible — keep
      the sections that work, replace those that don't.
    priority: medium
  - field: skills/write-test.md
    guidance: |
      Adjust code generation patterns for your technology stack.
      The skill assumes TypeScript + Playwright + Vitest. If your
      stack differs, update the code templates and examples.
    priority: medium

not-included:
  - "Knowledge files — request E2E testing knowledge via a separate knowledge transfer"
  - "Project-specific test configurations — add your own vitest.config.ts patterns"
  - "CI/CD integration — depends on your pipeline (GitHub Actions, CircleCI, etc.)"

evolution-notes: |
  This worker evolved through two major projects:

  v1.0 (2026-01): Basic test writer. Generated tests from acceptance
  criteria but lacked structured planning. Tests were ad-hoc.

  v1.5 (2026-01): Added test-plan skill. Game changer — structured
  test planning before writing caught many edge cases that ad-hoc
  testing missed. Coverage improved ~30%.

  v2.0 (2026-02): Added auth testing patterns from hq-cloud project.
  Clerk @clerk/testing integration, session fixtures, test user
  lifecycle management.

  v2.1 (2026-02): Refined cleanup patterns. Moved from setup-based
  cleanup (beforeAll wipes state) to teardown-based (afterAll cleans
  up what this test created). More reliable, fewer flaky tests.
```

#### payload/metadata/provenance.yaml

```yaml
origin:
  owner: stefan
  instance-id: stefan-hq-primary
  transferred-at: "2026-02-16T16:00:00Z"
history:
  - event: created
    by: stefan
    at: "2026-01-10T10:00:00Z"
    note: "Initial qa-tester worker for BrandStage E2E testing"
  - event: updated
    by: stefan
    at: "2026-01-20T14:00:00Z"
    note: "Added test-plan skill (v1.5)"
  - event: updated
    by: stefan
    at: "2026-02-05T09:00:00Z"
    note: "Added Clerk auth patterns, session fixtures (v2.0)"
  - event: updated
    by: stefan
    at: "2026-02-14T16:00:00Z"
    note: "Refined cleanup patterns, teardown approach (v2.1)"
  - event: transferred
    by: stefan
    to: alex
    at: "2026-02-16T16:00:00Z"
    note: "Pollination — sharing QA tester pattern for Alex's team"
```

#### VERIFY.sha256

```
sha256:d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6  payload/manifest.yaml
sha256:e1f2a3b4c5d6e7f8091a2b3c4d5e6f7809a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5  payload/worker/worker.yaml
sha256:f2a3b4c5d6e7f8091a2b3c4d5e6f7809a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6  payload/worker/skills/test-plan.md
sha256:a3b4c5d6e7f8091a2b3c4d5e6f7809a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7  payload/worker/skills/write-test.md
sha256:b4c5d6e7f8091a2b3c4d5e6f7809a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8  payload/metadata/provenance.yaml
sha256:c5d6e7f8091a2b3c4d5e6f7809a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f809  payload/metadata/adaptation.yaml
```

#### Receiver Experience

When Alex imports this bundle:

```
Transfer Preview:
  From: stefan (Stefan's HQ)
  Type: Worker Pattern (pollination)
  Worker: qa-tester (v2.1)
  Skills: test-plan, write-test
  Required Knowledge Domains: testing, e2e
  Required Tools: playwright, vitest
  Chain: new (first transfer)

  Customization Required:
    [HIGH] worker.yaml > instructions — Adapt testing principles to your stack
    [MED]  skills/test-plan.md — Update test plan template format
    [MED]  skills/write-test.md — Adjust code generation for your stack

  Not Included:
    - Knowledge files (request separately)
    - Project-specific test configs
    - CI/CD integration details

  Description: QA tester worker pattern (v2.1). E2E test planning,
  test writing, Playwright + Vitest. Evolved through BrandStage and
  hq-cloud projects.

  Accept this worker pattern? [y/n]
  (Note: Worker patterns always require manual review and adaptation)
```

---

### 11.3 Example 3: Knowledge Update with Conflict Detection

This example shows what happens when Stefan sends an update to knowledge that Alex has already modified locally.

#### Timeline

1. **Feb 16:** Stefan sends `txfr-e2e4a7b8c9d0` (E2E testing patterns). Alex integrates them into `knowledge/testing/e2e-learnings.md`.
2. **Feb 18:** Alex modifies the integrated file locally — adds Supabase auth testing patterns specific to his project.
3. **Feb 20:** Stefan sends `txfr-e2e-update-001` — an update with new fixture management patterns.

#### Update Envelope

```yaml
envelope:
  id: txfr-e2e-update-001
  type: knowledge
  from: stefan
  to: alex
  timestamp: "2026-02-20T10:00:00Z"
  version: v1
  description: "Update to E2E testing patterns — added fixture management and test isolation patterns"
  payload-hash: sha256:5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b
  payload-size: 7168
  supersedes: txfr-e2e4a7b8c9d0
  sequence: 2
  transport: file
```

#### Conflict Detection Output

```
Transfer Preview:
  From: stefan (Stefan's HQ)
  Type: Knowledge (UPDATE)
  Domain: testing
  Files: 2 knowledge files
  Chain: sequence 2, supersedes txfr-e2e4a7b8c9d0
  Hash: verified

  CONFLICT DETECTED:
  The file knowledge/e2e-learnings.md from the previous transfer
  (txfr-e2e4a7b8c9d0) has been modified locally since integration.

  Local modifications:
    - File hash at integration: sha256:a1b2c3...
    - Current file hash:        sha256:f8e7d6...
    - Modified on: 2026-02-18T11:30:00Z

  Options:
    [1] Accept update — replace local version with Stefan's update
    [2] Keep local — reject the update, keep your modifications
    [3] Merge manually — stage both versions for side-by-side review

  Choose [1/2/3]:
```

---

## Appendix A: Envelope JSON Schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://hq.dev/schemas/world-transfer-envelope-v1.json",
  "title": "World Protocol Transfer Envelope v1",
  "description": "Metadata wrapper for all World Protocol transfers between HQ instances",
  "type": "object",
  "required": [
    "id",
    "type",
    "from",
    "to",
    "timestamp",
    "version",
    "payload-hash",
    "payload-size",
    "transport"
  ],
  "additionalProperties": true,
  "properties": {
    "id": {
      "type": "string",
      "pattern": "^txfr-[a-f0-9]{12,}$",
      "description": "Unique transfer identifier"
    },
    "type": {
      "type": "string",
      "enum": ["knowledge", "worker-pattern", "context", "system"],
      "description": "Transfer type — determines payload structure"
    },
    "from": {
      "type": "string",
      "pattern": "^[a-z0-9][a-z0-9-]*[a-z0-9]$",
      "minLength": 2,
      "maxLength": 32,
      "description": "Sender HQ owner name"
    },
    "to": {
      "type": "string",
      "pattern": "^[a-z0-9][a-z0-9-]*[a-z0-9]$",
      "minLength": 2,
      "maxLength": 32,
      "description": "Recipient HQ owner name"
    },
    "timestamp": {
      "type": "string",
      "format": "date-time",
      "description": "ISO 8601 datetime in UTC"
    },
    "version": {
      "type": "string",
      "pattern": "^v[0-9]+$",
      "description": "World Protocol version"
    },
    "description": {
      "type": "string",
      "maxLength": 1024,
      "description": "Human-readable transfer summary"
    },
    "payload-hash": {
      "type": "string",
      "pattern": "^sha256:[a-f0-9]{64}$",
      "description": "SHA-256 hash of the payload (deterministic aggregate)"
    },
    "payload-size": {
      "type": "integer",
      "minimum": 0,
      "description": "Total payload size in bytes"
    },
    "supersedes": {
      "oneOf": [
        {
          "type": "string",
          "pattern": "^txfr-[a-f0-9]{12,}$"
        },
        {
          "type": "null"
        }
      ],
      "description": "ID of the transfer this replaces, or null for first transfer"
    },
    "sequence": {
      "type": "integer",
      "minimum": 1,
      "default": 1,
      "description": "Position in a transfer chain"
    },
    "transport": {
      "type": "string",
      "enum": ["file", "git", "http", "hiamp"],
      "description": "Transport mechanism used for delivery"
    }
  }
}
```

---

## Appendix B: Payload Manifest Schemas

### Knowledge Manifest

```yaml
type: knowledge                        # Always "knowledge"
domain: {string}                       # Primary knowledge domain
items:                                 # Array, at least 1 item
  - path: {string}                     # Relative to payload/
    domain: {string}                   # Optional, defaults to top-level domain
    description: {string}              # Required, human-readable
    source-path: {string}              # Optional, path in sender's HQ
    hash: sha256:{64 hex}              # Required, file hash
    size: {integer}                    # Required, bytes
    format: {string}                   # Optional, default: markdown
```

### Worker Pattern Manifest

```yaml
type: worker-pattern                   # Always "worker-pattern"
pattern-name: {string}                 # Worker ID
pattern-version: {string}             # Pattern version
items:                                 # Array, at least 1 item
  - path: {string}                     # Relative to payload/
    description: {string}              # Required, human-readable
    hash: sha256:{64 hex}              # Required, file hash
    size: {integer}                    # Required, bytes
```

### Context Manifest

```yaml
type: context                          # Always "context"
project: {string}                      # Project name
snapshot-at: {ISO 8601 datetime}       # When snapshot was taken
items:                                 # Array, at least 1 item
  - path: {string}                     # Relative to payload/
    description: {string}              # Required, human-readable
    hash: sha256:{64 hex}              # Required, file hash
    size: {integer}                    # Required, bytes
```

### System Manifest

```yaml
type: system                           # Always "system"
sub-type: {ping|pong|manifest-refresh|disconnect|suspend-notice}
```

---

## Appendix C: Quick Reference

### Envelope Template

```yaml
envelope:
  id: txfr-{12+ hex}
  type: {knowledge|worker-pattern|context|system}
  from: {sender-owner}
  to: {receiver-owner}
  timestamp: "{ISO-8601-UTC}"
  version: v1
  description: "{human-readable summary}"
  payload-hash: sha256:{64 hex}
  payload-size: {bytes}
  supersedes: {previous-id|null}
  sequence: {integer >= 1}
  transport: {file|git|http|hiamp}
```

### Bundle Structure

```
txfr-{id}/
├── envelope.yaml
├── payload/
│   ├── manifest.yaml
│   ├── {type}/               # knowledge/ | worker/ | context/ | manifest/
│   │   └── ...
│   └── metadata/
│       ├── provenance.yaml
│       └── adaptation.yaml   # (worker-pattern only)
└── VERIFY.sha256
```

### Transfer Types at a Glance

| Type | Code | Payload Contains | Recommended Max Size |
|------|------|-----------------|---------------------|
| Knowledge | `knowledge` | Markdown files, guides, patterns | 1 MB |
| Worker Pattern | `worker-pattern` | worker.yaml, skills/*.md, adaptation notes | 512 KB |
| Context | `context` | Project briefs, status snapshots, coordination maps | 256 KB |
| System | `system` | Ping/pong, manifest refresh, disconnect notice | 64 KB |

### Versioning Quick Reference

| Scenario | `supersedes` | `sequence` |
|----------|-------------|-----------|
| First transfer | `null` | `1` |
| Update to previous | Previous transfer ID | Previous + 1 |
| Conflict detected | N/A (receiver state) | N/A |
| Rollback | N/A (local operation) | N/A |

### Transport Comparison

| Transport | Infrastructure | Delivery | Real-Time? | v1 Status |
|-----------|---------------|----------|-----------|-----------|
| File | None | Manual (email, Slack, USB) | No | Reference implementation |
| Git | Shared repo | Push/pull | No | Future |
| HTTP | API server | POST/GET | Near-real-time | Future |
| HIAMP | Slack workspace | Slack messages | Yes | Future |

### Error Codes (Transfer-Specific)

| Code | Trigger |
|------|---------|
| `ERR_TXFR_HASH_MISMATCH` | Payload hash does not match envelope |
| `ERR_TXFR_SIZE_MISMATCH` | Payload size does not match envelope |
| `ERR_TXFR_UNKNOWN_TYPE` | Transfer type not recognized |
| `ERR_TXFR_REJECTED` | Operator rejected the transfer |
| `ERR_TXFR_CONFLICT` | Update supersedes a locally modified version |
| `ERR_TXFR_MALFORMED` | Envelope or payload cannot be parsed |
| `ERR_TXFR_UNKNOWN_PREDECESSOR` | `supersedes` references unknown transfer |

---

*End of Transfer Protocol Specification v1.*

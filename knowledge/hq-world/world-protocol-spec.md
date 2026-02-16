# HQ World Protocol Specification

**Version:** 1.0-draft
**Date:** 2026-02-16
**Status:** Draft
**Authors:** stefan/architect

---

## Table of Contents

1. [Overview](#1-overview)
2. [Terminology](#2-terminology)
3. [HQ Identity Model](#3-hq-identity-model)
4. [World Topology](#4-world-topology)
5. [Connection Model](#5-connection-model)
6. [Transfer Model](#6-transfer-model)
7. [Trust & Governance](#7-trust--governance)
8. [Relationship to HIAMP](#8-relationship-to-hiamp)
9. [Transport Abstraction](#9-transport-abstraction)
10. [Error Handling](#10-error-handling)
11. [Versioning](#11-versioning)
12. [End-to-End Scenarios](#12-end-to-end-scenarios)
- [Appendix A: Envelope Schema (YAML)](#appendix-a-envelope-schema-yaml)
- [Appendix B: Quick Reference](#appendix-b-quick-reference)

---

## 1. Overview

### 1.1 What the World Protocol Is

The HQ World Protocol is a federation layer that lets HQ instances discover each other, establish connections, and exchange structured data. If HQ is a **city** -- a self-contained operating environment with workers, knowledge, and projects -- then the World is the **federation of cities**, connected by **trade routes** (peer connections) over which **trade** (data transfers) flows.

The protocol defines:

- How an HQ instance identifies itself on the network.
- How two HQ instances establish a human-gated connection.
- How structured data -- knowledge, worker patterns, project context -- moves between connected instances.
- How trust is established, escalated, and revoked.
- How all of the above works regardless of the delivery mechanism used to move data.

### 1.2 Why It Exists

HQ is a personal OS for AI workers. Each installation is deeply customized to its operator -- different workers, different knowledge, different projects. That customization is a strength, but it creates islands. Operator A discovers a testing pattern that would save Operator B a week. Operator A builds a worker definition that Operator B needs. Operator A has project context that Operator B's workers need to do their part of a collaboration.

Today, sharing happens through the human: copy the file, paste it in Slack, explain the context, let the other person figure out how to integrate it. This is slow, lossy, and does not scale. The World Protocol gives HQ instances a structured way to share with each other -- while keeping the human operator in control of every connection and every transfer.

### 1.3 Design Philosophy

**Human-gated.** No connection forms without explicit operator approval on both sides. No data transfers without operator consent. The protocol is a diplomatic framework, not a social network. Think embassies and trade agreements, not friend requests.

**Transport-agnostic.** The protocol defines data formats and exchange semantics, not delivery mechanisms. MVP uses file-based exchange (export a bundle, share it however you want, import it on the other side). Future transports -- git sync, HTTP push/pull, HIAMP relay -- implement the same protocol with different plumbing.

**Compatible with HIAMP, independent of it.** HIAMP (HQ Inter-Agent Messaging Protocol) defines how workers in different HQ instances talk to each other via Slack. The World Protocol operates at a higher level -- it governs how HQ instances relate to each other and exchange structured data. HIAMP is one possible transport for World Protocol messages, but the World Protocol works without HIAMP, and HIAMP works without the World Protocol.

**Fractal by nature.** Worker patterns shared between HQ instances are not rigid templates -- they are growth seeds. A worker pattern transferred from HQ-A adapts to HQ-B's environment: different knowledge bases, different project context, different operator preferences. The protocol carries the genome, not the organism.

**Practical over pure.** This spec should be implementable in a few focused sessions. The MVP transport is a directory of files. No servers, no APIs, no infrastructure. Two operators can federate using a USB stick if they want to.

### 1.4 Scope

**In scope for v1:**

- HQ identity and addressing
- Peer-to-peer topology
- Human-gated peering ceremony
- Three transfer types: knowledge, worker patterns, project context
- Trust levels with escalation and revocation
- File-based transfer as MVP transport
- Transport abstraction layer

**Out of scope for v1 (documented for future versions):**

- Central directory / discovery service (see section 4.4)
- Automatic capability matching and recommendation
- Real-time synchronization between HQ instances
- Conflict resolution beyond basic detection
- Multi-party transfers (more than two HQ instances in a single exchange)

---

## 2. Terminology

| Term | Definition |
|------|-----------|
| **HQ instance** | A single installation of HQ, owned and operated by one person. The **city** in the World metaphor. |
| **Operator** | The human who owns and runs an HQ instance. The city's **governor**. |
| **World** | The federation of connected HQ instances. The network of cities. |
| **Peer** | Another HQ instance that your instance has an active connection with. A **sister city**. |
| **Connection** | An established, mutually approved relationship between two HQ instances. A **trade route**. |
| **Transfer** | A structured exchange of data between connected peers. **Trade** over a trade route. |
| **Manifest** | A structured document describing an HQ instance's identity, capabilities, and preferences. The city's **passport**. |
| **Peering ceremony** | The multi-step process by which two HQ instances establish a connection. **Diplomatic negotiations**. |
| **Transfer envelope** | The metadata wrapper around any data transfer. The **shipping label** on a trade package. |
| **Transfer bundle** | A self-contained package of files for exchange. The **cargo**. |
| **Worker pattern** | A worker definition (worker.yaml + skills + associated knowledge) shared as a growth seed. A **blueprint seed** -- it adapts to its new environment. |
| **Trust level** | A classification of how much an HQ instance trusts a peer. Determines what data can flow and what approvals are needed. |
| **Pollination** | The act of sharing worker patterns between HQ instances, allowing capabilities to spread and adapt across the federation. Term from the fractal growth model. |

### 2.1 Relationship to HIAMP Terminology

The World Protocol reuses several terms from HIAMP but at a different level of abstraction:

| HIAMP Term | World Protocol Equivalent | Distinction |
|-----------|--------------------------|-------------|
| Owner | Operator / HQ Identity | HIAMP `owner` is a messaging namespace; World Identity is a full HQ descriptor. |
| Peer | Peer | Same concept, but World peers have richer metadata (manifest, trust level, transfer history). |
| Worker address (`owner/worker-id`) | Worker reference (within manifests) | HIAMP addresses are for messaging; World references are for capability discovery. |
| `share` intent | Knowledge transfer | HIAMP `share` sends a file in a message; World transfers are structured, versioned, and logged. |

---

## 3. HQ Identity Model

### 3.1 Identity Fields

Every HQ instance in the World has an identity composed of four fields:

```yaml
identity:
  owner: stefan                      # Required. Operator's unique name.
  instance-id: stefan-hq-primary     # Required. Globally unique instance ID.
  display-name: "Stefan's HQ"       # Optional. Human-readable label.
  world-version: v1                  # Required. World Protocol version.
```

| Field | Required | Format | Description |
|-------|----------|--------|-------------|
| `owner` | Yes | `[a-z0-9][a-z0-9-]*[a-z0-9]` (2-32 chars) | The operator's unique name. Serves as the primary namespace. |
| `instance-id` | Yes | `[a-z0-9][a-z0-9-]*[a-z0-9]` (2-64 chars) | A globally unique identifier for this specific HQ instance. An operator may run multiple instances (primary, staging, experimental). |
| `display-name` | No | Free-form string (max 128 chars) | Human-readable label for this instance. |
| `world-version` | Yes | `v{major}` | The World Protocol version this instance speaks. `v1` for this spec. |

### 3.2 Addressing Format

An HQ instance is addressed by its `owner` field. Within the World, an HQ address is simply:

```
stefan
```

When disambiguation is needed (an operator running multiple HQ instances), the full address includes the instance ID:

```
stefan@stefan-hq-primary
```

The short form (`owner` only) is used in all protocol messages unless disambiguation is required. The `@instance-id` suffix is reserved for multi-instance scenarios.

### 3.3 Uniqueness Rules

- **Owner uniqueness** is enforced within a connected subgraph of the World. Two peers MUST NOT share the same `owner` value. If an operator encounters a peer with a conflicting owner name, the peering ceremony fails at the manifest exchange step with an `ERR_OWNER_CONFLICT` error.
- **Instance-id uniqueness** is globally unique by convention. The recommended format is `{owner}-hq-{qualifier}` (e.g., `stefan-hq-primary`, `stefan-hq-staging`). Collisions are detected during peering and rejected.
- **No central authority** enforces uniqueness in v1. Uniqueness is verified pairwise during each peering ceremony. A future central directory (section 4.4) could provide global uniqueness guarantees.

### 3.4 Relationship to HIAMP Identity

The World Protocol identity **extends** HIAMP identity, not replaces it:

| HIAMP Field | World Protocol Field | Relationship |
|------------|---------------------|--------------|
| `identity.owner` | `identity.owner` | Same value. If an HQ instance has both HIAMP and World configs, the `owner` MUST match. |
| `identity.instance-id` | `identity.instance-id` | Same value, same purpose. |
| `identity.display-name` | `identity.display-name` | Same value, same purpose. |
| (not present) | `identity.world-version` | World-specific. Not relevant to HIAMP. |

An HQ instance can participate in HIAMP messaging without joining the World, and can join the World without using HIAMP for transport. When both are active, identity fields MUST be consistent.

### 3.5 Identity Derivation

An HQ instance's identity can be derived from existing HQ files:

- `owner` from `agents.md` (operator name, lowercased and hyphenated)
- `instance-id` from `config/hiamp.yaml` if it exists, otherwise generated as `{owner}-hq-{random-4}`
- `display-name` from `agents.md` or manually set

This means joining the World does not require creating an identity from scratch -- it is assembled from what the operator has already configured.

---

## 4. World Topology

### 4.1 Peer-to-Peer Foundation

The World is a peer-to-peer network. There is no central server, no hub, no authority that all instances must connect to. Every HQ instance is equal in the protocol.

```
     [Stefan's HQ]
        /      \
       /        \
[Alex's HQ] --- [Maria's HQ]
       \        /
        \      /
     [Jordan's HQ]
```

Connections are bilateral -- if Stefan is connected to Alex, Alex is connected to Stefan. There is no concept of a one-way connection. Both operators must approve, and both instances maintain the connection state.

### 4.2 Network Properties

**Partial connectivity.** Not every HQ instance needs to connect to every other. The World is a sparse graph, not a complete graph. An operator connects to the peers they collaborate with -- there is no pressure or benefit to connecting widely for its own sake.

**No transitive trust.** If Stefan is connected to Alex, and Alex is connected to Maria, Stefan has NO implicit connection to Maria. Stefan cannot discover Maria's capabilities through Alex, cannot send transfers to Maria through Alex, and has no visibility into Maria's existence unless Maria and Stefan independently establish their own connection.

**No routing.** In v1, there is no message or transfer routing through intermediaries. All communication is direct between connected peers. A transfer from Stefan to Alex goes from Stefan's HQ directly to Alex's HQ -- it is never relayed through a third party.

**Local state only.** Each HQ instance maintains its own view of the World: its identity, its connected peers, its transfer history. There is no global state, no shared ledger, no distributed consensus. Each instance's state is authoritative for that instance.

### 4.3 Topology Diagram

```
                        ┌─────────────────┐
                        │   THE WORLD      │
                        │   (no center)    │
                        └─────────────────┘

  ┌──────────┐                                    ┌──────────┐
  │ Stefan   │◄── trade route (connection) ──────►│  Alex    │
  │ HQ       │                                    │  HQ      │
  │          │    knowledge, worker patterns,     │          │
  │ Workers: │    project context flow both ways  │ Workers: │
  │  architect│                                   │  backend │
  │  frontend│                                    │  qa      │
  │  qa      │                                    │  devops  │
  └──────────┘                                    └──────────┘
       │                                               │
       │                                               │
       ▼ (separate connection)                         ▼ (separate connection)
  ┌──────────┐                                    ┌──────────┐
  │ Maria    │                                    │ Jordan   │
  │ HQ       │      (no connection between        │ HQ       │
  │          │       Maria and Jordan unless       │          │
  │ Workers: │       they establish one)           │ Workers: │
  │  designer│                                    │  analyst │
  │  content │                                    │  ops     │
  └──────────┘                                    └──────────┘
```

### 4.4 Central Directory Overlay (Future)

The protocol is designed to support a central directory without protocol changes. A directory is modeled as a **super-peer** -- a special HQ instance that:

1. Accepts connections from any HQ instance willing to register.
2. Collects and indexes manifests from registered instances.
3. Responds to capability queries ("which HQs have a worker skilled in Playwright testing?").
4. Introduces peers to each other (but does not vouch for them -- trust is still bilateral).

Because a directory uses the same peering ceremony, manifest format, and transfer protocol as any other peer, adding directory support requires zero protocol changes. The directory is purely additive infrastructure.

**Multiple directories** are supported. An HQ instance can register with several directories simultaneously, each serving a different community (company-internal, open-source, industry-specific). Directories do not need to know about each other.

**Design principle:** The directory is an introducer, not an authority. It helps HQ instances find each other, but all trust decisions remain with the individual operators. A directory cannot grant, revoke, or modify connections between peers.

### 4.5 Subgraph Patterns

Common topologies that emerge from peer-to-peer connections:

| Pattern | Description | Example |
|---------|-------------|---------|
| **Pair** | Two HQ instances connected directly. | Freelancer and client. |
| **Star** | One HQ connected to many, others not connected to each other. | Lead architect connected to all team members' HQs. |
| **Mesh** | Several HQs all connected to each other. | Small team where everyone collaborates. |
| **Chain** | A-B-C where A and C are not directly connected. | Subcontracting chain. A cannot reach C directly. |

The protocol does not enforce or prefer any topology. Operators connect to whoever they need to collaborate with.

---

## 5. Connection Model

### 5.1 Connection Lifecycle

A connection between two HQ instances follows a state machine:

```
                                    Both operators
    Initiator sends    Receiver     approve
    connection         reviews      ┌───────┐
    proposal           manifest     │       │
         │                │         │       ▼
    ┌────▼───┐      ┌────▼───┐    ┌┴───────────┐     ┌───────────────┐
    │PROPOSED├─────►│PENDING ├───►│   ACTIVE    │────►│  SUSPENDED    │
    └────────┘      └────┬───┘    └──────┬──────┘     └───────┬───────┘
                         │               │                     │
                         │               │                     │
                    Rejected by          │                Reactivated
                    either side     Disconnected           or expired
                         │          by either side             │
                         ▼               │                     ▼
                    ┌────────┐      ┌────▼───────┐     ┌─────────────┐
                    │REJECTED│      │DISCONNECTED│     │   EXPIRED   │
                    └────────┘      └────────────┘     └─────────────┘
```

| State | Description |
|-------|-------------|
| **PROPOSED** | One operator has sent a connection proposal. The other has not yet seen it. |
| **PENDING** | Both operators have exchanged manifests. Awaiting mutual approval. |
| **ACTIVE** | Both operators have approved. Transfers can flow. |
| **SUSPENDED** | One or both operators have temporarily paused the connection. No transfers flow, but the connection is not severed. |
| **DISCONNECTED** | One or both operators have terminated the connection. Peer data is removed. |
| **REJECTED** | The receiving operator declined the connection proposal. |
| **EXPIRED** | The connection has been inactive beyond the configured maximum age. |

### 5.2 Peering Ceremony

The peering ceremony is the multi-step process by which two HQ instances establish a connection. Every step requires human action -- there is no automatic connection establishment.

#### Step 1: Proposal

Operator A decides to connect to Operator B. They know Operator B exists (through out-of-band means -- a conversation, a shared Slack workspace, a directory listing, a conference talk).

Operator A generates a **connection proposal**:

```yaml
# Connection proposal from stefan to alex
proposal:
  from:
    owner: stefan
    instance-id: stefan-hq-primary
    display-name: "Stefan's HQ"
    world-version: v1
  to:
    owner: alex                      # Known or expected owner name
  message: |
    Hey Alex -- would like to connect our HQs for the hq-cloud
    collaboration. My team has architecture and frontend workers
    that could coordinate with your backend team.
  proposed-at: "2026-02-16T10:00:00Z"
  proposal-id: prop-a1b2c3d4
```

The proposal includes the initiator's basic identity and an optional human-readable message explaining why they want to connect. It is delivered to Operator B out-of-band (email, Slack DM, shared file, or through a directory if one exists).

#### Step 2: Manifest Exchange

If Operator B is interested, both operators exchange their **HQ manifests** (see US-002 for the full manifest schema). The manifest reveals:

- Identity (owner, instance-id, display name)
- Capability catalog (workers and their skills, opt-out supported)
- Knowledge domains (what the HQ specializes in)
- Connection preferences (preferred transport, trust level)

**What is shared vs. what stays private:**

| Shared in Manifest | Stays Private |
|-------------------|---------------|
| Worker IDs and skill summaries | Worker internal instructions |
| Knowledge domain labels | Knowledge file contents |
| Operator display name | Operator's agents.md details |
| Preferred connection settings | Security config, secrets |
| Worker count and types | Project details, workspace state |

The manifest is the **business card**, not the **diary**. It reveals enough for the other operator to make a connection decision without exposing internal implementation details.

#### Step 3: Trust Negotiation

Both operators review each other's manifests and agree on a trust level for the connection:

| Trust Level | Label | Meaning |
|------------|-------|---------|
| 0 | **Open** | Minimal verification. Transfers accepted with basic integrity checks. Suitable for experimental or low-stakes connections. |
| 1 | **Verified** | Identity verified through out-of-band means (Slack workspace membership, shared secret, known public key). Default for most connections. |
| 2 | **Trusted** | Full trust. Verified identity plus history of successful interactions. Enables advanced features like auto-approval of low-risk transfers. |

Trust levels are set independently by each operator. Stefan may trust Alex at level 2 (trusted) while Alex trusts Stefan at level 1 (verified). Trust is asymmetric and unilateral -- each operator decides their own trust posture.

**Trust escalation:** Trust levels can be upgraded over time as operators build confidence in the relationship. The upgrade is a unilateral action by each operator (editing their local config). No protocol message is required.

#### Step 4: Human Approval

Both operators explicitly approve the connection. This is the gate -- without mutual approval, no connection activates.

Approval is recorded locally:

```yaml
# In Operator A's world config
connections:
  - peer: alex
    status: active
    trust-level: verified
    approved-at: "2026-02-16T11:00:00Z"
    approved-by: stefan              # The human operator
    proposal-id: prop-a1b2c3d4
```

There is no protocol message for "I approve." Approval is a local configuration change. The connection becomes ACTIVE when both sides have the peer in their config with `status: active`.

#### Step 5: Connection Activation

Once both operators have approved, the connection is active. Each HQ instance:

1. Stores the peer's manifest in `workspace/world/peers/{owner}/manifest.yaml`.
2. Adds the peer to the local connection registry.
3. Logs the connection event to the transfer log.

From this point, transfers can flow between the two instances.

#### Step 6: Connection Maintenance

Active connections are maintained through:

- **Manifest refresh.** Peers periodically re-exchange manifests to keep capability information current. The refresh interval is operator-configurable (default: 7 days). A manifest refresh does not require re-approval.
- **Health checks.** Optional. An operator can request a simple "are you there?" check. Implemented as a transfer with type `ping` (see section 6).
- **Transfer history.** Each HQ tracks transfers sent and received per peer. This history informs trust decisions and helps identify inactive connections.

#### Step 7: Disconnection

Either operator can disconnect at any time by removing the peer from their connection registry and setting the status to `disconnected`.

**Clean disconnection:**

1. Operator sets local connection status to `disconnected`.
2. Optionally sends a `disconnect` notification to the peer (via any available transport).
3. Removes cached peer manifest from `workspace/world/peers/{owner}/`.
4. Retains transfer history logs (they are audit records, not peer data).

**Unilateral disconnection:** Because connections are bilateral but each side maintains its own state, one operator can disconnect without the other's involvement. If Stefan disconnects from Alex, Stefan's HQ stops accepting transfers from Alex. Alex's HQ may still show Stefan as a peer until Alex also disconnects or a health check fails.

**Reconnection:** After disconnection, operators can reconnect by going through the peering ceremony again. Previous transfer history is preserved (it lives in the local transfer log, not in the peer record).

---

## 6. Transfer Model

### 6.1 Transfer Types

The World Protocol defines four transfer types in v1:

| Type | Code | Description |
|------|------|-------------|
| **Knowledge** | `knowledge` | Knowledge files and bases -- patterns, guides, domain expertise. |
| **Worker Pattern** | `worker-pattern` | Worker definitions, skills, and associated knowledge. Growth seeds for pollination. |
| **Context** | `context` | Project briefs, status snapshots, coordination information. |
| **System** | `system` | Protocol-level messages: ping, manifest refresh, disconnect notice. |

### 6.2 Transfer Envelope

Every transfer is wrapped in an envelope that provides metadata independent of the payload:

```yaml
envelope:
  # Identity
  id: txfr-a1b2c3d4e5f6               # Unique transfer ID
  type: knowledge                       # Transfer type (knowledge|worker-pattern|context|system)

  # Routing
  from: stefan                          # Sender HQ owner
  to: alex                              # Recipient HQ owner

  # Metadata
  timestamp: "2026-02-16T14:30:00Z"    # When this transfer was created
  version: v1                           # World Protocol version
  description: |                        # Human-readable summary
    Sharing our E2E testing patterns — covers Clerk auth testing,
    fixture management, and test user lifecycle.

  # Integrity
  payload-hash: sha256:a1b2c3...        # SHA-256 hash of the payload
  payload-size: 4096                    # Payload size in bytes

  # Versioning
  supersedes: null                      # ID of a previous transfer this replaces (null if first)
  sequence: 1                           # Sequence number within a transfer chain

  # Transport
  transport: file                       # Transport used (file|git|http|hiamp)
```

### 6.3 Envelope Field Reference

| Field | Required | Format | Description |
|-------|----------|--------|-------------|
| `id` | Yes | `txfr-{12-hex-chars}` | Unique transfer identifier. Generated by the sender. |
| `type` | Yes | `knowledge` \| `worker-pattern` \| `context` \| `system` | The category of data being transferred. |
| `from` | Yes | HQ owner name | The sending HQ instance. |
| `to` | Yes | HQ owner name | The receiving HQ instance. |
| `timestamp` | Yes | ISO 8601 datetime (UTC) | When the transfer was created. |
| `version` | Yes | `v{major}` | World Protocol version. `v1` for this spec. |
| `description` | No | Free-form text (max 1024 chars) | Human-readable explanation of what is being transferred and why. |
| `payload-hash` | Yes | `sha256:{hex-digest}` | SHA-256 hash of the complete payload. Used for integrity verification on receipt. |
| `payload-size` | Yes | Integer (bytes) | Size of the payload in bytes. |
| `supersedes` | No | Transfer ID or `null` | If this transfer updates a previous one, the ID of the transfer being replaced. |
| `sequence` | No | Integer (default: 1) | Sequence number for chained transfers. First transfer in a chain is 1. |
| `transport` | Yes | `file` \| `git` \| `http` \| `hiamp` | Which transport mechanism carried this transfer. |

### 6.4 Knowledge Transfer

A knowledge transfer carries knowledge files -- markdown documents, guides, patterns, templates, or any structured knowledge that one HQ has captured and wants to share with a peer.

**Payload structure:**

```
payload/
├── manifest.yaml          # What's in this transfer
├── knowledge/
│   ├── e2e-learnings.md   # Knowledge file(s)
│   └── testing/
│       ├── patterns.md
│       └── fixtures.md
└── metadata/
    └── provenance.yaml    # Where this knowledge came from
```

**manifest.yaml (payload manifest, not HQ manifest):**

```yaml
type: knowledge
items:
  - path: knowledge/e2e-learnings.md
    domain: testing
    description: "E2E testing patterns for Clerk auth and Playwright"
    source-path: knowledge/testing/e2e-learnings.md   # Original path in sender's HQ
    hash: sha256:abcdef...
  - path: knowledge/testing/patterns.md
    domain: testing
    description: "General testing patterns"
    source-path: knowledge/testing/patterns.md
    hash: sha256:123456...
  - path: knowledge/testing/fixtures.md
    domain: testing
    description: "Test fixture management"
    source-path: knowledge/testing/fixtures.md
    hash: sha256:789abc...
```

**provenance.yaml:**

```yaml
origin:
  owner: stefan
  instance-id: stefan-hq-primary
  created-at: "2026-02-16T14:30:00Z"
history:
  - event: created
    by: stefan
    at: "2026-01-15T09:00:00Z"
    note: "Captured during BrandStage E2E testing project"
  - event: updated
    by: stefan
    at: "2026-02-10T14:00:00Z"
    note: "Added Clerk auth testing patterns"
```

**Receiving behavior:**

1. Receiver extracts the payload.
2. Files are staged to `workspace/world/inbox/{sender}/knowledge/`.
3. Operator reviews staged files.
4. Operator decides which files to integrate into their HQ's knowledge base (and where).
5. Transfer is logged to `workspace/world/transfers/`.

### 6.5 Worker Pattern Transfer (Pollination)

A worker pattern transfer carries the definition of a worker -- not as a rigid template to copy, but as a **growth seed** that the receiving HQ adapts to its own environment. This is the "pollination" concept from the fractal growth model.

**What is transferred:**

| Artifact | Purpose |
|----------|---------|
| `worker.yaml` | Worker identity, type, skills, instructions |
| `skills/*.md` | Skill definitions -- what the worker can do |
| `knowledge references` | Pointers to knowledge domains the worker depends on (NOT the knowledge files themselves) |
| `adaptation notes` | Guidance on how the receiving HQ should adapt this pattern |

**Payload structure:**

```
payload/
├── manifest.yaml
├── worker/
│   ├── worker.yaml
│   └── skills/
│       ├── test-plan.md
│       └── write-test.md
└── metadata/
    ├── provenance.yaml
    └── adaptation.yaml
```

**adaptation.yaml:**

```yaml
# Guidance for the receiving HQ on how to adapt this worker pattern
pattern-name: qa-tester
pattern-version: "2.1"

requires:
  knowledge-domains:
    - testing                  # Receiver needs testing knowledge
    - e2e                      # Receiver needs E2E testing knowledge
  tools:
    - playwright               # External dependency
    - vitest                   # External dependency

customization-points:
  - field: worker.yaml > instructions
    guidance: "Adapt to your project's testing conventions and frameworks"
  - field: skills/test-plan.md
    guidance: "Update test plan template to match your team's format"
  - field: skills/write-test.md
    guidance: "Adjust code generation patterns for your stack"

not-included:
  - "Knowledge files (testing patterns, learnings) -- request separately or build your own"
  - "Project-specific configuration -- will need to be added for your projects"
```

**Key principle:** A worker pattern transfer is an invitation to grow, not an instruction to copy. The receiving operator reviews the pattern, adapts it to their environment, and activates it when ready. The protocol carries the seed; the soil determines the plant.

### 6.6 Context Transfer

A context transfer carries project briefs, status snapshots, or coordination information that helps a peer's workers understand the broader context of a collaboration.

**Payload structure:**

```
payload/
├── manifest.yaml
├── context/
│   ├── project-brief.md       # High-level project description
│   ├── status.yaml            # Current project status
│   └── coordination.yaml      # Coordination notes (who owns what)
└── metadata/
    └── provenance.yaml
```

**status.yaml example:**

```yaml
project: hq-cloud
snapshot-at: "2026-02-16T14:30:00Z"
phase: implementation
stories:
  completed: [US-001, US-002, US-003]
  in-progress: [US-004, US-005]
  pending: [US-006, US-007, US-008, US-009]
blockers:
  - story: US-005
    description: "Waiting on auth API endpoints from alex/backend-dev"
notes: |
  Frontend team is ahead of schedule. Backend team is working on
  the WebSocket relay (US-005). Expecting integration readiness
  by end of week.
```

Context transfers are ephemeral -- they represent a point-in-time snapshot. Unlike knowledge (which is durable) or worker patterns (which are structural), context is situational and often time-sensitive.

### 6.7 System Transfer

System transfers are protocol-level messages that maintain the health of connections.

| Sub-type | Purpose | Payload |
|----------|---------|---------|
| `ping` | Check if a peer is reachable. | None. Response expected. |
| `pong` | Response to a ping. | None. |
| `manifest-refresh` | Updated manifest from a peer. | Full manifest document. |
| `disconnect` | Notification that the sender is disconnecting. | Optional message. |

System transfers use the same envelope format but with `type: system` and a `sub-type` field in the payload manifest.

### 6.8 Transfer Versioning

Transfers support versioning through the `supersedes` and `sequence` fields:

**First transfer:**

```yaml
envelope:
  id: txfr-aaa111
  type: knowledge
  supersedes: null
  sequence: 1
```

**Update to the same knowledge:**

```yaml
envelope:
  id: txfr-bbb222
  type: knowledge
  supersedes: txfr-aaa111
  sequence: 2
```

**Conflict detection:** If a receiver has already modified the content from the original transfer (`txfr-aaa111`) and receives an update (`txfr-bbb222`), a conflict is flagged. The receiver can:

1. Accept the update (overwrite local changes).
2. Reject the update (keep local changes).
3. Merge manually (review both versions).

In v1, conflict resolution is manual. The protocol detects conflicts through `supersedes` chains; the operator resolves them.

**Rollback:** An operator can roll back to a previous version by referencing a specific transfer ID in their transfer log.

---

## 7. Trust & Governance

### 7.1 Trust Levels

The World Protocol defines three trust levels, each with specific implications for transfer handling:

| Level | Label | Description | Transfer Handling |
|-------|-------|-------------|-------------------|
| 0 | **Open** | Minimal trust. Connection exists but transfers require careful scrutiny. | All transfers staged to inbox. Operator must review and approve each one individually. No auto-integration. |
| 1 | **Verified** | Identity confirmed through out-of-band means. The standard trust level for active collaborators. | Transfers staged to inbox. Operator reviews. Familiar transfer types (from established patterns) may be batch-approved. |
| 2 | **Trusted** | High trust built through successful interaction history. | Transfers staged to inbox. Operator may configure auto-approval rules for specific transfer types or knowledge domains. System transfers (ping, manifest refresh) are auto-processed. |

### 7.2 Trust Escalation Path

Trust escalation is always a unilateral, human decision:

```
Open (0) ──────► Verified (1) ──────► Trusted (2)
   │                   │                    │
   │ Requirements:     │ Requirements:      │ Requirements:
   │ - Connection      │ - Identity         │ - History of
   │   established     │   confirmed        │   successful
   │                   │   out-of-band      │   transfers
   │                   │ - First successful  │ - No trust
   │                   │   transfer          │   violations
   │                   │                    │ - Operator
   │                   │                    │   decision
   └───────────────────┴────────────────────┘
              Can be downgraded at any time
```

**Escalation is not automatic.** Even after 100 successful transfers, trust stays at its current level until the operator explicitly upgrades it. The protocol tracks interaction history to inform the decision but never makes it.

### 7.3 Human Approval Gates

The following actions always require human approval regardless of trust level:

| Action | Approval Required |
|--------|-------------------|
| Establishing a new connection | Both operators must approve |
| First transfer in any type | Operator must approve |
| Worker pattern integration | Operator must approve (patterns are structural changes) |
| Trust level upgrade | Operator must approve |
| Reconnection after disconnection | Both operators must approve |

The following actions may be auto-approved at Trust Level 2 (Trusted), if the operator configures auto-approval rules:

| Action | Auto-Approval Conditions |
|--------|--------------------------|
| Knowledge transfer in a pre-approved domain | Trust level 2 + domain in auto-approve list |
| Context transfer for an active project | Trust level 2 + project in auto-approve list |
| System transfers (ping, manifest refresh) | Trust level 1 or higher |

### 7.4 Revocation

An operator can revoke trust or terminate a connection at any time:

**Trust downgrade:**

```yaml
# Before
connections:
  - peer: alex
    trust-level: trusted     # Level 2

# After
connections:
  - peer: alex
    trust-level: verified    # Level 1
```

Trust downgrade is immediate and unilateral. The peer is not notified of the downgrade (it is an internal policy decision). However, the peer may notice changes in behavior (e.g., transfers that were previously auto-approved now require manual review).

**Connection suspension:**

```yaml
connections:
  - peer: alex
    status: suspended
    suspended-at: "2026-02-16T15:00:00Z"
    reason: "Reviewing recent transfers"
```

Suspension temporarily halts all transfers in both directions. The peer may be notified (via a `system` transfer with sub-type `suspend-notice`). Suspension preserves the connection state -- it can be reactivated without repeating the peering ceremony.

**Full disconnection:**

As described in section 5.2, step 7. Removes the peer relationship entirely.

### 7.5 Governance Principles

1. **The operator is always in control.** No protocol action can override an operator's decision. Workers cannot escalate trust, initiate connections, or approve transfers without human involvement (except where the human has explicitly configured auto-approval).

2. **Trust is local.** Each operator manages their own trust settings. There is no global trust authority, no shared reputation system, no "verified badge" in v1. Trust is a relationship between two operators, not a property of an HQ instance.

3. **Audit everything.** Every connection state change, every transfer, every trust modification is logged to the local transfer log. The operator can review the complete history of any peer relationship.

4. **Graceful degradation.** When trust is revoked or a connection is suspended, in-flight transfers are held (not dropped). The operator can review them before they are discarded.

---

## 8. Relationship to HIAMP

### 8.1 Layer Model

HIAMP and the World Protocol operate at different layers of the HQ inter-instance communication stack:

```
┌─────────────────────────────────────────────────┐
│  Layer 3: Application                            │
│  Worker-to-worker collaboration, task handoff,   │
│  knowledge sharing conversations                 │
├─────────────────────────────────────────────────┤
│  Layer 2: World Protocol (this spec)             │
│  Identity, connections, structured transfers,    │
│  trust management, capability discovery          │
├─────────────────────────────────────────────────┤
│  Layer 1: Transport                              │
│  HIAMP (Slack), file exchange, git sync,         │
│  HTTP API, email                                 │
├─────────────────────────────────────────────────┤
│  Layer 0: Physical                               │
│  Internet, LAN, USB drive, carrier pigeon        │
└─────────────────────────────────────────────────┘
```

**The World Protocol is Layer 2.** It sits between the transport (how bits move) and the application (what workers do with the data). HIAMP is a Layer 1 transport -- one of several possible delivery mechanisms.

### 8.2 Independence

The World Protocol does not depend on HIAMP:

| Scenario | HIAMP Status | World Protocol Status |
|----------|-------------|----------------------|
| Two HQs use Slack for messaging and file exchange for knowledge | Active | Active (file transport) |
| Two HQs use the World Protocol but communicate via git repos | Not used | Active (git transport) |
| Two HQs use HIAMP for worker messaging but have no structured transfers | Active | Not used |
| Two HQs use HIAMP as the transport for World Protocol messages | Active (as transport) | Active (using HIAMP transport) |

### 8.3 HIAMP as World Transport

When HIAMP is used as a transport for World Protocol transfers:

1. The transfer envelope is serialized as YAML and embedded in a HIAMP `share` intent message body.
2. The transfer payload is attached using HIAMP's file sharing mechanism (inline embedding for small payloads, Slack file upload for large ones).
3. The HIAMP `attach` field lists the payload files.
4. The HIAMP `from` and `to` fields use worker addresses (e.g., `stefan/system → alex/system`), where `system` is a reserved worker ID for protocol-level communication.

**Example: Knowledge transfer via HIAMP**

````
stefan/system → alex/system

World Protocol Transfer: Knowledge sharing — E2E testing patterns

📎 envelope.yaml
```yaml
envelope:
  id: txfr-a1b2c3d4e5f6
  type: knowledge
  from: stefan
  to: alex
  timestamp: "2026-02-16T14:30:00Z"
  version: v1
  description: "E2E testing patterns for Clerk auth"
  payload-hash: sha256:abcdef123456
  payload-size: 2048
  supersedes: null
  sequence: 1
  transport: hiamp
```

📎 payload/manifest.yaml
```yaml
type: knowledge
items:
  - path: knowledge/e2e-learnings.md
    domain: testing
    description: "E2E testing patterns"
    hash: sha256:abcdef...
```

📎 payload/knowledge/e2e-learnings.md
```markdown
# E2E Testing Patterns
...
```

───────────────
hq-msg:v1 | id:msg-world01 | thread:thr-world01
from:stefan/system | to:alex/system
intent:share | priority:normal | ack:requested
attach:envelope.yaml,payload/manifest.yaml,payload/knowledge/e2e-learnings.md
````

### 8.4 Shared Identity Fields

As noted in section 3.4, when both HIAMP and the World Protocol are active, the `owner` and `instance-id` fields MUST be identical in both configurations. This ensures consistent identity across messaging (HIAMP) and federation (World Protocol).

### 8.5 Migration Path

An HQ instance that already uses HIAMP for inter-agent messaging can adopt the World Protocol incrementally:

1. **No change to HIAMP.** Existing messaging continues to work.
2. **Add World identity.** Create `config/world.yaml` with identity derived from `config/hiamp.yaml`.
3. **Add peers.** For each HIAMP peer, add a World connection (the peering ceremony may be simplified since identity is already verified through the Slack workspace).
4. **Start transferring.** Use the World Protocol for structured knowledge and worker pattern transfers. Continue using HIAMP for real-time worker-to-worker messaging.

The two protocols complement each other: HIAMP for conversations, World Protocol for cargo.

---

## 9. Transport Abstraction

### 9.1 Principle

The World Protocol separates **what is exchanged** (envelopes, payloads, manifests) from **how it is delivered** (the transport). This separation means:

- The same transfer can be delivered over any transport.
- New transports can be added without protocol changes.
- The sender and receiver do not need to use the same transport for all transfers.

### 9.2 Transport Interface

Every transport must implement four operations:

| Operation | Description |
|-----------|-------------|
| `send(envelope, payload) → receipt` | Deliver a transfer to a peer. Returns a receipt confirming delivery (or an error). |
| `receive() → (envelope, payload)` | Accept an incoming transfer from a peer. |
| `verify(envelope, payload) → boolean` | Confirm that the received payload matches the envelope's integrity fields (hash, size). |
| `status(transfer-id) → state` | Check the status of a previously sent transfer (delivered, pending, failed). |

These operations are logical -- each transport implements them according to its own mechanism.

### 9.3 File Transport (MVP)

The file transport is the reference implementation for v1. It requires no infrastructure -- transfers are directories of files that operators exchange however they choose.

**Export (send):**

1. Operator selects items to export (knowledge files, worker patterns, context).
2. HQ packages them into a transfer bundle -- a directory with the structure:

```
txfr-a1b2c3d4e5f6/
├── envelope.yaml              # Transfer envelope
├── payload/
│   ├── manifest.yaml          # Payload manifest
│   ├── knowledge/             # (or worker/ or context/)
│   │   └── ...                # Actual files
│   └── metadata/
│       └── provenance.yaml    # Origin and history
└── VERIFY.sha256              # File-by-file SHA-256 checksums
```

3. The bundle can optionally be archived (tar.gz, zip) for easier sharing.
4. The operator delivers the bundle to the peer: email attachment, Slack file upload, shared drive, git commit, USB stick, or any other file delivery mechanism.

**Import (receive):**

1. Operator receives a transfer bundle from a peer.
2. HQ reads `envelope.yaml` and displays a preview:
   - Who is it from?
   - What type of transfer?
   - What files are included?
   - Does the hash verify?
3. Operator reviews the preview and approves or rejects.
4. If approved, HQ stages the payload files to `workspace/world/inbox/{sender}/{type}/`.
5. HQ logs the transfer to `workspace/world/transfers/`.

**Integrity verification (verify):**

1. Compute SHA-256 hash of the payload directory.
2. Compare with `envelope.payload-hash`.
3. Verify individual file hashes from `VERIFY.sha256`.
4. If any hash mismatches, the transfer is flagged as tampered and the operator is warned.

### 9.4 Git Transport (Future)

A git-based transport where transfers are committed to a shared repository:

- Each peer has read access to a shared repo (or a fork).
- Transfers are committed as directories in the repo.
- Pull/push operations deliver and receive transfers.
- Git's built-in integrity (SHA-1/SHA-256 object hashing) supplements the envelope hash.
- Conflict detection leverages git's merge mechanisms.

### 9.5 HTTP Transport (Future)

A REST-based transport where transfers are pushed/pulled via HTTP:

- `POST /transfers` to send a transfer.
- `GET /transfers/{id}` to receive a transfer.
- `GET /transfers?since={timestamp}` to poll for new transfers.
- Standard HTTP authentication (API keys, OAuth) for access control.

### 9.6 HIAMP Transport (Future)

As described in section 8.3. HIAMP `share` intent messages carry World Protocol transfers.

### 9.7 Transport Selection

An operator configures their preferred transport per peer:

```yaml
connections:
  - peer: alex
    transport: file                # Default transport for this peer
    transport-config:
      export-path: ~/hq-exports/  # Where to write export bundles
      import-path: ~/hq-imports/  # Where to watch for import bundles
```

Different peers can use different transports. An operator might use file exchange with one peer and git sync with another.

---

## 10. Error Handling

### 10.1 Error Categories

| Category | Code Prefix | Description |
|----------|-------------|-------------|
| Identity | `ERR_ID_*` | Problems with HQ identity or addressing. |
| Connection | `ERR_CONN_*` | Problems with the peering ceremony or connection state. |
| Transfer | `ERR_TXFR_*` | Problems with transfer creation, delivery, or receipt. |
| Trust | `ERR_TRUST_*` | Problems with trust verification or authorization. |
| Transport | `ERR_TRANS_*` | Problems with the underlying transport mechanism. |

### 10.2 Error Codes

| Code | Description |
|------|-------------|
| `ERR_ID_OWNER_CONFLICT` | Two peers have the same owner name. |
| `ERR_ID_INSTANCE_CONFLICT` | Two peers have the same instance-id. |
| `ERR_ID_UNKNOWN` | The addressed HQ instance is not a known peer. |
| `ERR_CONN_NOT_ACTIVE` | Transfer attempted on a non-active connection. |
| `ERR_CONN_REJECTED` | Connection proposal was rejected by the receiver. |
| `ERR_CONN_SUSPENDED` | Connection is currently suspended. |
| `ERR_TXFR_HASH_MISMATCH` | Payload hash does not match envelope. Transfer may be tampered. |
| `ERR_TXFR_SIZE_MISMATCH` | Payload size does not match envelope. |
| `ERR_TXFR_UNKNOWN_TYPE` | Transfer type is not recognized. |
| `ERR_TXFR_REJECTED` | Operator rejected the incoming transfer. |
| `ERR_TXFR_CONFLICT` | Transfer supersedes a locally modified version. |
| `ERR_TRUST_INSUFFICIENT` | Transfer requires a higher trust level than the connection has. |
| `ERR_TRUST_REVOKED` | The peer's trust has been revoked. |
| `ERR_TRANS_UNREACHABLE` | Cannot deliver transfer via the configured transport. |
| `ERR_TRANS_TIMEOUT` | Transport delivery timed out. |
| `ERR_VERSION_UNSUPPORTED` | Received a transfer with an unsupported protocol version. |

### 10.3 Error Behavior

Errors are handled locally. When an error occurs:

1. The error is logged to the transfer log with full details.
2. The operator is notified (via HQ's notification system).
3. If the error occurred during import, the transfer is quarantined in `workspace/world/quarantine/{transfer-id}/`.
4. If the error occurred during export, the export is retried or aborted based on operator preference.

Errors are never silently swallowed. The human operator always knows when something goes wrong.

---

## 11. Versioning

### 11.1 Protocol Version

Every envelope includes a `version` field. For this spec, the version is `v1`.

### 11.2 Compatibility Rules

| Change Type | Version Impact |
|------------|----------------|
| Adding a new optional envelope field | No version bump. Old receivers ignore unknown fields. |
| Adding a new transfer type | No version bump. Old receivers report `ERR_TXFR_UNKNOWN_TYPE`. |
| Adding a new system sub-type | No version bump. Old receivers ignore unknown sub-types. |
| Changing the semantics of an existing field | Minor version note (v1.1). |
| Removing a required envelope field | Major version bump (v2). |
| Changing the envelope structure | Major version bump (v2). |
| Adding a new required envelope field | Major version bump (v2). |

### 11.3 Version Negotiation

There is no explicit version negotiation in v1. Peers advertise their version through the `world-version` field in their manifest and the `version` field in every transfer envelope.

If a receiver gets a transfer with an unrecognized version:

1. Log the transfer.
2. If the major version is higher, report `ERR_VERSION_UNSUPPORTED`.
3. If the major version is the same but minor is higher, attempt to process using known fields and ignore unknown ones.
4. If the major version is lower, attempt backward-compatible processing.

### 11.4 Transition Periods

When a major version bump occurs, implementations SHOULD support both old and new versions for a transition period (recommended: 90 days). This mirrors HIAMP's transition period policy.

---

## 12. End-to-End Scenarios

### 12.1 Scenario: First Connection

Stefan and Alex work at the same company. Stefan builds frontends; Alex builds backends. They want their HQ instances to share knowledge and coordinate on the hq-cloud project.

**Prerequisites:**

- Stefan's HQ has identity `owner: stefan`, instance-id `stefan-hq-primary`.
- Alex's HQ has identity `owner: alex`, instance-id `alex-hq-primary`.
- They are in the same Slack workspace (for communication, not required for the protocol).

**Step 1: Stefan initiates.**

Stefan runs the World skill in his HQ:

```
> /run architect world connect alex
```

His HQ generates a connection proposal:

```yaml
proposal:
  from:
    owner: stefan
    instance-id: stefan-hq-primary
    display-name: "Stefan's HQ"
    world-version: v1
  to:
    owner: alex
  message: |
    Connecting for hq-cloud project coordination.
    My HQ has architect, frontend-dev, and qa-tester workers.
  proposed-at: "2026-02-16T10:00:00Z"
  proposal-id: prop-conn-001
```

Stefan sends this to Alex via Slack DM: "Hey Alex, here's my HQ connection proposal."

**Step 2: Alex reviews and responds.**

Alex's HQ reads the proposal and generates his manifest. Alex reviews Stefan's proposal, decides to proceed, and shares his manifest back with Stefan.

**Step 3: Manifest exchange.**

Both operators now have each other's manifests cached locally:

- Stefan sees Alex has `backend-dev`, `qa-tester`, and `devops` workers.
- Alex sees Stefan has `architect`, `frontend-dev`, and `qa-tester` workers.

**Step 4: Trust negotiation.**

Both decide on Trust Level 1 (Verified) -- they know each other from the Slack workspace.

**Step 5: Mutual approval.**

Stefan adds Alex to his `config/world.yaml`:

```yaml
connections:
  - peer: alex
    status: active
    trust-level: verified
    approved-at: "2026-02-16T11:00:00Z"
```

Alex adds Stefan to his `config/world.yaml`:

```yaml
connections:
  - peer: stefan
    status: active
    trust-level: verified
    approved-at: "2026-02-16T11:15:00Z"
```

**Step 6: Connection active.**

Both HQs now show each other as connected peers. Stefan can browse Alex's capabilities; Alex can browse Stefan's. Transfers can flow.

### 12.2 Scenario: Knowledge Transfer

Stefan's team has developed robust E2E testing patterns during the BrandStage project. Alex's team is starting E2E testing for their project and could use these patterns.

**Step 1: Stefan exports knowledge.**

Stefan runs the export command:

```
> /run architect world export --type knowledge --files knowledge/testing/e2e-learnings.md --to alex
```

His HQ creates a transfer bundle:

```
txfr-e2e-testing-001/
├── envelope.yaml
├── payload/
│   ├── manifest.yaml
│   ├── knowledge/
│   │   └── e2e-learnings.md
│   └── metadata/
│       └── provenance.yaml
└── VERIFY.sha256
```

The envelope:

```yaml
envelope:
  id: txfr-e2e-testing-001
  type: knowledge
  from: stefan
  to: alex
  timestamp: "2026-02-16T14:30:00Z"
  version: v1
  description: "E2E testing patterns — Clerk auth, Playwright fixtures, test user management"
  payload-hash: sha256:a1b2c3d4e5f6...
  payload-size: 4096
  supersedes: null
  sequence: 1
  transport: file
```

**Step 2: Stefan delivers the bundle.**

Stefan zips the bundle and shares it with Alex via Slack: "Here's our E2E testing knowledge. Import it into your HQ."

**Step 3: Alex imports the bundle.**

Alex drops the zip in his import directory and runs:

```
> /run architect world import --bundle ~/hq-imports/txfr-e2e-testing-001.zip
```

His HQ reads the envelope and shows a preview:

```
Transfer Preview:
  From: stefan (Stefan's HQ)
  Type: knowledge
  Files: 1 knowledge file (e2e-learnings.md)
  Domain: testing
  Size: 4,096 bytes
  Hash: verified ✓

  Description: E2E testing patterns — Clerk auth, Playwright fixtures,
  test user management

  Accept this transfer? [y/n]
```

**Step 4: Alex approves.**

Alex types `y`. The file is staged to `workspace/world/inbox/stefan/knowledge/e2e-learnings.md`.

**Step 5: Alex integrates.**

Alex reviews the staged file and decides to place it in his HQ's knowledge base at `knowledge/testing/e2e-learnings.md`. He may edit it first to adapt it to his team's conventions.

**Step 6: Transfer logged.**

Both HQs record the transfer in their local logs:

```yaml
# In Alex's workspace/world/transfers/2026-02-16.yaml
- transfer-id: txfr-e2e-testing-001
  direction: received
  from: stefan
  type: knowledge
  timestamp: "2026-02-16T14:35:00Z"
  status: accepted
  staged-to: workspace/world/inbox/stefan/knowledge/
  integrated-to: knowledge/testing/e2e-learnings.md
```

### 12.3 Scenario: Capability Query

Alex is starting a new project that requires UI/UX design work. He wants to know if any of his connected peers have design capabilities.

**Step 1: Alex queries his peer manifests.**

```
> /run architect world capabilities --skill design
```

His HQ searches cached peer manifests:

```
Capability Search: "design"

Results:
  stefan (Stefan's HQ):
    No workers with "design" skill.

  maria (Maria's HQ):
    - designer: UI/UX design, Figma integration
      Skills: design, figma, ux, prototyping
    - content-writer: Technical writing, documentation
      Skills: docs, technical-writing

  Matching peers: maria
```

**Step 2: Alex reviews Maria's manifest.**

```
> /run architect world capabilities --peer maria --detail
```

```
Peer: maria (Maria's HQ)
Trust Level: verified
Connected Since: 2026-01-20
Last Transfer: 2026-02-10 (knowledge: design patterns)

Workers:
  1. designer
     Type: ContentWorker
     Skills: design, figma, ux, prototyping
     Description: "UI/UX design, Figma integration, design system maintenance"

  2. content-writer
     Type: ContentWorker
     Skills: docs, technical-writing
     Description: "Technical writing, user documentation, API docs"

Knowledge Domains:
  - design-systems
  - ux-patterns
  - accessibility
```

**Step 3: Alex decides on next steps.**

Based on the capability query, Alex knows Maria's HQ has the design capabilities he needs. He can:

1. Request a **context transfer** from Maria with her design patterns.
2. Request a **worker pattern transfer** for Maria's designer worker (pollination).
3. Use **HIAMP** to have his workers message Maria's workers directly for collaboration.
4. Talk to Maria (the human) about the collaboration scope.

The capability query informed the decision without initiating any transfer or commitment. It is a read-only operation on cached manifests.

### 12.4 Scenario: Worker Pattern Sharing (Pollination)

Stefan has built a sophisticated QA tester worker with skills for E2E test planning, test writing, and CI integration. Alex wants a similar capability in his HQ.

**Step 1: Stefan exports the worker pattern.**

```
> /run architect world export --type worker-pattern --worker qa-tester --to alex
```

Stefan's HQ packages the qa-tester worker:

```
txfr-qa-tester-pattern/
├── envelope.yaml
├── payload/
│   ├── manifest.yaml
│   ├── worker/
│   │   ├── worker.yaml          # Worker definition (instructions sanitized)
│   │   └── skills/
│   │       ├── test-plan.md     # Test planning skill
│   │       └── write-test.md    # Test writing skill
│   └── metadata/
│       ├── provenance.yaml
│       └── adaptation.yaml      # How to adapt this pattern
└── VERIFY.sha256
```

**Important:** The export process sanitizes the worker definition:

- Internal instructions specific to Stefan's projects are removed.
- Knowledge references point to domains (not specific file paths).
- Project-specific configuration is stripped.
- The result is a portable growth seed, not a snapshot of Stefan's exact worker.

**Step 2: Alex imports and adapts.**

Alex imports the bundle. His HQ shows:

```
Transfer Preview:
  From: stefan (Stefan's HQ)
  Type: worker-pattern
  Worker: qa-tester (v2.1)
  Skills: test-plan, write-test
  Required Knowledge Domains: testing, e2e

  Adaptation Notes:
  - Adapt instructions to your project's testing conventions
  - Update test plan template to match your team's format
  - Adjust code generation patterns for your stack

  Accept this worker pattern? [y/n]
```

Alex accepts. The pattern is staged to `workspace/world/inbox/stefan/worker-pattern/qa-tester/`.

**Step 3: Alex plants the seed.**

Alex reviews the worker.yaml and skills, makes adjustments:

- Changes the knowledge references to point to his own testing knowledge.
- Updates the test plan template to match his project's format.
- Keeps the core structure and skill definitions.

He then activates the worker in his HQ:

```
> /run architect world integrate --type worker-pattern --source workspace/world/inbox/stefan/worker-pattern/qa-tester/
```

His HQ creates `workers/dev-team/qa-tester/` with the adapted pattern and adds it to `workers/registry.yaml`.

**Step 4: The seed grows.**

Over time, Alex's qa-tester worker develops its own knowledge and instructions based on Alex's projects, testing patterns, and operator feedback. It started from Stefan's seed but grew into its own organism -- shaped by Alex's environment. This is pollination.

---

## Appendix A: Envelope Schema (YAML)

```yaml
# World Protocol Transfer Envelope - v1 Schema
# All fields described with types and constraints

$schema: "https://json-schema.org/draft/2020-12/schema"
$id: "https://hq.dev/schemas/world-transfer-envelope-v1.json"
title: "World Protocol Transfer Envelope"
description: "Metadata wrapper for all World Protocol transfers"
type: object
required:
  - id
  - type
  - from
  - to
  - timestamp
  - version
  - payload-hash
  - payload-size
  - transport
additionalProperties: false
properties:
  id:
    type: string
    pattern: "^txfr-[a-f0-9]{12,}$"
    description: "Unique transfer identifier"
  type:
    type: string
    enum: [knowledge, worker-pattern, context, system]
    description: "Transfer type"
  from:
    type: string
    pattern: "^[a-z0-9][a-z0-9-]*[a-z0-9]$"
    minLength: 2
    maxLength: 32
    description: "Sender HQ owner"
  to:
    type: string
    pattern: "^[a-z0-9][a-z0-9-]*[a-z0-9]$"
    minLength: 2
    maxLength: 32
    description: "Recipient HQ owner"
  timestamp:
    type: string
    format: date-time
    description: "ISO 8601 datetime in UTC"
  version:
    type: string
    pattern: "^v[0-9]+$"
    description: "World Protocol version"
  description:
    type: string
    maxLength: 1024
    description: "Human-readable transfer summary"
  payload-hash:
    type: string
    pattern: "^sha256:[a-f0-9]{64}$"
    description: "SHA-256 hash of the payload"
  payload-size:
    type: integer
    minimum: 0
    description: "Payload size in bytes"
  supersedes:
    type: [string, "null"]
    description: "ID of the transfer this replaces"
  sequence:
    type: integer
    minimum: 1
    default: 1
    description: "Sequence number in a transfer chain"
  transport:
    type: string
    enum: [file, git, http, hiamp]
    description: "Transport mechanism used"
```

## Appendix B: Quick Reference

### Transfer Types

| Type | Code | Payload Contains |
|------|------|-----------------|
| Knowledge | `knowledge` | Markdown files, guides, patterns |
| Worker Pattern | `worker-pattern` | worker.yaml, skills/*.md, adaptation notes |
| Context | `context` | Project briefs, status snapshots |
| System | `system` | Ping, pong, manifest refresh, disconnect |

### Trust Levels

| Level | Label | Auto-Approval? |
|-------|-------|---------------|
| 0 | Open | Never |
| 1 | Verified | System transfers only |
| 2 | Trusted | Configurable per type/domain |

### Connection States

| State | Transfers Flow? | Reactivation |
|-------|----------------|--------------|
| PROPOSED | No | N/A (initial state) |
| PENDING | No | N/A (waiting for approval) |
| ACTIVE | Yes | N/A (already active) |
| SUSPENDED | No | Operator lifts suspension |
| DISCONNECTED | No | Full peering ceremony required |
| REJECTED | No | New proposal required |
| EXPIRED | No | Full peering ceremony required |

### Envelope Quick Template

```yaml
envelope:
  id: txfr-{12-hex}
  type: {knowledge|worker-pattern|context|system}
  from: {owner}
  to: {owner}
  timestamp: "{ISO-8601-UTC}"
  version: v1
  description: "{human-readable summary}"
  payload-hash: sha256:{64-hex-chars}
  payload-size: {bytes}
  supersedes: {previous-transfer-id|null}
  sequence: {integer}
  transport: {file|git|http|hiamp}
```

### Bundle Directory Structure

```
txfr-{id}/
├── envelope.yaml
├── payload/
│   ├── manifest.yaml
│   ├── {type}/           # knowledge/, worker/, or context/
│   │   └── ...
│   └── metadata/
│       └── provenance.yaml
└── VERIFY.sha256
```

---

*End of HQ World Protocol Specification v1.*

# HQ World Protocol

The World Protocol is a federation layer that lets HQ instances discover each other, establish human-gated connections, and exchange structured data. If HQ is a **city** -- a self-contained operating environment with workers, knowledge, and projects -- then the World is the **federation of cities**, connected by **trade routes** (peer connections) over which **trade** (data transfers) flows.

## Why

Each HQ installation is deeply customized to its operator. That customization is a strength, but it creates islands. The World Protocol gives HQ instances a structured way to share knowledge, worker patterns, and project context -- while keeping the human operator in control of every connection and every transfer.

## Architecture

```
                    HQ World
         ┌──────────────────────────┐
         │                          │
    ┌────┴────┐              ┌──────┴───┐
    │  HQ-A   │◄────────────►│   HQ-B   │
    │ (Stefan)│  Trade Route │  (Alex)  │
    └─────────┘  (Connection)└──────────┘
         │                          │
    config/world.yaml          config/world.yaml
    workspace/world/           workspace/world/
```

**Peer-to-peer topology.** Each HQ instance is sovereign. Connections are bilateral -- if A is connected to B, B is connected to A. There is no central server required. An optional central directory can overlay the P2P network without protocol changes.

## Core Concepts

### Identity

Every HQ instance has an identity defined by:

- **Owner** -- the human operator (e.g., `stefan`, `alex`)
- **Instance ID** -- unique identifier for the specific installation (e.g., `stefan-hq-primary`)
- **Display Name** -- human-readable label (e.g., "Stefan's HQ")

Identity is defined in `config/world.yaml` and reuses HIAMP identity fields for compatibility.

### Connections (Trade Routes)

Connections between HQ instances follow a strict **human-gated** model. No connection forms without explicit operator approval on both sides. Connections have a state machine:

```
PROPOSED -> PENDING -> ACTIVE -> SUSPENDED -> DISCONNECTED
                  \-> REJECTED           \-> EXPIRED
```

Only **ACTIVE** connections allow data transfers.

### Trust Levels

Trust is asymmetric and unilateral -- each operator independently sets their trust level for each peer:

| Level | Name | Meaning |
|-------|------|---------|
| 0 | Open | Minimal trust. Transfers require explicit per-item approval. |
| 1 | Verified | Standard trust. Identity is confirmed. Transfers approved in bulk. |
| 2 | Trusted | High trust. Auto-approval rules may apply for specific transfer types. |

### Transfer Types

The protocol supports four structured transfer types:

| Type | What It Carries | Example |
|------|-----------------|---------|
| **Knowledge** | Knowledge files and directories | Testing patterns, API design guides |
| **Worker Pattern** | Worker definitions and skills (pollination) | QA tester worker with test-plan skill |
| **Context** | Project briefs, status snapshots | hq-cloud project coordination context |
| **System** | Protocol-level messages | Manifest refresh requests, ping |

### Transfer Envelope

Every transfer is wrapped in an envelope -- metadata describing the transfer without revealing payload contents:

```yaml
envelope:
  id: txfr-a1b2c3d4e5f6
  type: knowledge
  from: stefan
  to: alex
  timestamp: "2026-02-16T14:30:00Z"
  version: v1
  payload-hash: "sha256:..."
  payload-size: 4096
  supersedes: null
  sequence: 1
  transport: file
```

### Transport Abstraction

The protocol is transport-agnostic. It defines data formats and exchange semantics, not delivery mechanisms:

| Transport | Status | Description |
|-----------|--------|-------------|
| **file** | MVP (v1) | Directory bundles shared via any mechanism |
| **git** | Future | Git-based sync via shared repos |
| **http** | Future | HTTP push/pull API |
| **hiamp** | Future | HIAMP relay via Slack |

## File Layout

### Configuration (operator-managed)

```
config/
  world.yaml        # Identity, connections, preferences
  manifest.yaml     # Manifest generation settings
```

### State (system-managed)

```
workspace/world/
  peers/            # Cached peer manifests
    {owner}/
      manifest.yaml
  transfers/        # Daily transfer event logs
    {YYYY-MM-DD}.yaml
  inbox/            # Incoming transfers staged for review
    {sender}/
      knowledge/
      worker-pattern/
      context/
  quarantine/       # Transfers that failed verification
    {transfer-id}/
```

## The Peering Ceremony

The peering ceremony is a seven-step, human-gated process for establishing a connection:

1. **Proposal** -- Initiator creates and sends a connection proposal
2. **Acknowledgment** -- Receiver reviews the proposal, decides to proceed
3. **Manifest Exchange** -- Both operators share their HQ manifests
4. **Trust Negotiation** -- Both operators review manifests and choose trust levels
5. **Human Approval** -- Both operators explicitly approve the connection
6. **Activation** -- Both HQs record the connection as active
7. **Confirmation** -- Both operators confirm the connection is live

All ceremony artifacts (proposals, manifests, approvals) are exchanged **out-of-band** in v1. The protocol defines the format, not the delivery mechanism.

## Transfer Lifecycle

```
Export (HQ-A)
  |
  v
Share bundle out-of-band (Slack, email, git, USB...)
  |
  v
Preview (HQ-B) -- verify integrity, check for conflicts
  |
  v
Stage to inbox (HQ-B) -- human reviews content
  |
  v
Approve or Reject (HQ-B) -- human decision gate
  |
  v
Integrate (HQ-B) -- move content into HQ, adapt as needed
```

Every step is logged to `workspace/world/transfers/{date}.yaml` for audit.

## Worker Pattern Pollination

Worker patterns shared between HQ instances are not rigid templates -- they are **growth seeds**. A worker pattern transferred from HQ-A adapts to HQ-B's environment:

- Different knowledge paths
- Different project context
- Different operator conventions

Adaptation notes in the transfer bundle guide the receiving operator on what to customize:

```yaml
customization-points:
  - field: "worker.yaml > instructions"
    guidance: "Adapt to your testing framework"
    priority: high
  - field: "worker.yaml > context.base"
    guidance: "Point to your local knowledge paths"
    priority: high
```

## Reference Implementation

The `@indigoai/hq-world` package (`packages/hq-world/`) provides the MVP file transport implementation:

- **Export** -- `exportKnowledge()`, `exportWorkerPattern()`
- **Import** -- `previewImport()`, `stageTransfer()`
- **Integrity** -- SHA-256 hashing, VERIFY.sha256 checksums, `verifyBundle()`
- **Transfer Log** -- `logExport()`, `logReceive()`, `logApproval()`, `logIntegration()`
- **World Skill** -- `workers/shared/skills/world.md` wraps the protocol for worker use

## Specification Documents

| Document | Description |
|----------|-------------|
| [World Protocol Spec](world-protocol-spec.md) | Complete protocol specification -- identity, topology, connections, transfers, trust, HIAMP relationship, transport abstraction |
| [Manifest Schema](manifest-schema.md) | HQ manifest format -- identity block, capability catalog, knowledge domains, auto-generation |
| [Peering Ceremony](peering-ceremony.md) | Connection lifecycle -- state machine, seven-step ceremony, trust levels, human approval gates |
| [Transfer Protocol](transfer-protocol.md) | Transfer envelope, payload types (knowledge, worker-pattern, context, system), versioning, integrity |
| [Configuration](configuration.md) | Local config and state -- `config/world.yaml`, `workspace/world/`, auto-generation, JSON schemas |
| [Central Directory Design](central-directory-design.md) | Future-proofing -- how a central directory overlays the P2P network without protocol changes |
| [Quick Start](quick-start.md) | Get connected to a peer in under 10 steps |

## Design Philosophy

- **Human-gated.** No connection forms without explicit operator approval on both sides. No data transfers without operator consent.
- **Transport-agnostic.** The protocol defines data formats, not delivery mechanisms. MVP uses file-based exchange.
- **Compatible with HIAMP, independent of it.** HIAMP is one possible transport; the World Protocol works without it.
- **Fractal by nature.** Worker patterns are growth seeds that adapt to the receiving HQ's environment.
- **Practical over pure.** Implementable in focused sessions. Two operators can federate using a USB stick.

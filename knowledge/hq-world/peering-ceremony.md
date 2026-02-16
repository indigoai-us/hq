# Peering Ceremony & Connection Model

**Version:** 1.0-draft
**Date:** 2026-02-16
**Status:** Draft
**Companion to:** [World Protocol Spec](world-protocol-spec.md), [Manifest Schema](manifest-schema.md)

---

## Table of Contents

1. [Overview](#1-overview)
2. [Design Principles](#2-design-principles)
3. [Connection State Machine](#3-connection-state-machine)
4. [The Peering Ceremony](#4-the-peering-ceremony)
5. [Connection Initiation Format](#5-connection-initiation-format)
6. [Manifest Exchange](#6-manifest-exchange)
7. [Trust Levels](#7-trust-levels)
8. [Human Approval Gates](#8-human-approval-gates)
9. [Connection Activation & Storage](#9-connection-activation--storage)
10. [Connection Maintenance](#10-connection-maintenance)
11. [Suspension](#11-suspension)
12. [Disconnection](#12-disconnection)
13. [Reconnection](#13-reconnection)
14. [Error Handling](#14-error-handling)
15. [End-to-End Walkthrough](#15-end-to-end-walkthrough)
16. [Security Considerations](#16-security-considerations)
- [Appendix A: Proposal Schema (YAML)](#appendix-a-proposal-schema-yaml)
- [Appendix B: Connection Record Schema](#appendix-b-connection-record-schema)
- [Appendix C: Quick Reference](#appendix-c-quick-reference)

---

## 1. Overview

### 1.1 What This Document Covers

This document specifies the **peering ceremony** -- the human-gated, multi-step process by which two HQ instances establish a connection (trade route) in the World. It also defines the full connection lifecycle: how connections are proposed, negotiated, activated, maintained, suspended, and terminated.

The peering ceremony is the diplomatic framework of the HQ World. It governs how two operators -- each running their own HQ instance (city) -- decide to formally connect their instances, agree on terms, and begin exchanging structured data.

### 1.2 Relationship to Other Documents

| Document | What It Provides | How This Document Uses It |
|----------|-----------------|--------------------------|
| [World Protocol Spec](world-protocol-spec.md) | Protocol overview, identity model, topology, transfer model | This document expands Section 5 (Connection Model) into a full specification. |
| [Manifest Schema](manifest-schema.md) | Manifest format and auto-generation | Manifests are exchanged during the ceremony. This document specifies what is shared vs. what stays private. |
| [Transfer Protocol](transfer-protocol.md) | Transfer envelope, types, versioning | Transfers flow only over active connections. This document defines when and how connections reach the active state. |
| [HIAMP Configuration](../../knowledge/agent-protocol/configuration.md) | Peer directory pattern | The HIAMP peer directory pattern inspired the World connection registry. This document defines the World-specific version. |

### 1.3 The Core Constraint

**No connection forms without explicit human approval on both sides.** This is not a suggestion, a default, or a preference -- it is a protocol invariant. Every transition that moves a connection toward the active state requires a human operator to take a deliberate action. There is no auto-connect, no auto-accept, no implicit peering.

The reason is philosophical and practical. HQ is a personal OS. Connecting two HQ instances is not following someone on social media -- it is establishing a diplomatic relationship between two sovereign entities. The operators are heads of state; the ceremony is a treaty negotiation.

---

## 2. Design Principles

### 2.1 Sovereignty

Each HQ instance is sovereign. No external action can force a connection, modify a trust level, or initiate a transfer without the local operator's consent. The protocol provides mechanisms for proposing, negotiating, and agreeing -- it never provides mechanisms for compelling.

### 2.2 Bilateral Symmetry

Connections are bilateral. If Stefan is connected to Alex, Alex is connected to Stefan. There are no one-way connections, no follower/following asymmetry. Both operators must approve, and either operator can terminate.

**Asymmetric trust within bilateral connections** is permitted. Stefan may trust Alex at level 2 (Trusted) while Alex trusts Stefan at level 1 (Verified). The connection is bilateral; the trust posture within it is unilateral.

### 2.3 Explicit Over Implicit

Every state transition is explicit. The protocol never infers a connection state from absence of action. A connection is active because both operators said "active." A connection is disconnected because an operator said "disconnect." Silence is not consent; timeout is not approval.

### 2.4 Graceful Degradation

When a connection encounters problems -- failed health checks, expired manifests, trust violations -- the connection degrades gracefully. It moves to SUSPENDED, not DISCONNECTED. The operator is notified and can choose to resolve the issue or terminate. In-flight transfers are held, not dropped.

### 2.5 Clean Separation

Connection state (whether two HQs are connected) is separate from transfer state (what data flows between them) and trust state (how much they trust each other). These three concerns interact but are independently managed. Changing trust level does not change connection state. Suspending a connection does not revoke trust.

---

## 3. Connection State Machine

### 3.1 States

```
                                    Both operators
    Initiator sends    Receiver     approve
    connection         reviews      +--------+
    proposal           proposal     |        |
         |                |         |        v
    +----v---+      +----v---+    +-v-----------+     +-------------+
    |PROPOSED+----->|PENDING +---->   ACTIVE    +----->  SUSPENDED  |
    +--------+      +----+---+    +------+------+     +------+------+
                         |               |                    |
                         |               |                    |
                    Rejected by          |               Reactivated
                    either side     Disconnected          or expired
                         |          by either side            |
                         v               |                    v
                    +--------+      +----v--------+     +-----------+
                    |REJECTED|      |DISCONNECTED |     |  EXPIRED  |
                    +--------+      +-------------+     +-----------+
```

### 3.2 State Definitions

| State | Code | Description | Transfers? | Human Action Required |
|-------|------|-------------|------------|----------------------|
| **PROPOSED** | `proposed` | One operator has created and sent a connection proposal. The other has not yet responded. | No | Initiator chose to propose. |
| **PENDING** | `pending` | Both operators have exchanged manifests and are reviewing each other's information. Awaiting mutual approval. | No | Both operators are reviewing. |
| **ACTIVE** | `active` | Both operators have approved. The connection is live. | Yes | Both operators approved. |
| **SUSPENDED** | `suspended` | One or both operators have temporarily paused the connection. Transfers are halted but the connection metadata is preserved. | No | One operator chose to suspend. |
| **DISCONNECTED** | `disconnected` | The connection has been terminated. Peer data is cleaned up. | No | One operator chose to disconnect. |
| **REJECTED** | `rejected` | The receiving operator (or the initiator, after seeing the manifest) declined the connection. | No | One operator chose to reject. |
| **EXPIRED** | `expired` | The connection has been inactive beyond the configured expiry threshold. Equivalent to a system-triggered suspension. | No | System-triggered, operator must act to reconnect. |

### 3.3 Valid State Transitions

| From | To | Trigger | Who |
|------|----|---------|-----|
| (none) | PROPOSED | Operator creates a proposal | Initiator |
| PROPOSED | PENDING | Receiver acknowledges and exchanges manifest | Receiver |
| PROPOSED | REJECTED | Receiver declines the proposal | Receiver |
| PROPOSED | DISCONNECTED | Initiator withdraws the proposal | Initiator |
| PENDING | ACTIVE | Both operators approve | Both |
| PENDING | REJECTED | Either operator declines after manifest review | Either |
| ACTIVE | SUSPENDED | Either operator suspends | Either |
| ACTIVE | DISCONNECTED | Either operator disconnects | Either |
| ACTIVE | EXPIRED | Inactivity exceeds configured threshold | System |
| SUSPENDED | ACTIVE | Suspending operator lifts the suspension | Suspending operator |
| SUSPENDED | DISCONNECTED | Either operator disconnects | Either |
| SUSPENDED | EXPIRED | Suspension exceeds configured max duration | System |
| EXPIRED | ACTIVE | Both operators explicitly reactivate | Both |
| EXPIRED | DISCONNECTED | Either operator disconnects | Either |

### 3.4 Terminal States

**REJECTED** and **DISCONNECTED** are terminal states. Once a connection reaches either state, it cannot be reactivated through the existing connection record. A new connection requires a new proposal (a fresh peering ceremony from Step 1).

**EXPIRED** is a soft terminal state. It can be reactivated if both operators agree, but if neither acts within a configurable window (default: 30 days), it transitions to DISCONNECTED automatically.

### 3.5 State Ownership

Each operator maintains their own view of the connection state. The states are intended to be symmetric (both sides see the same state), but because there is no shared database, temporary asymmetry is possible:

- Stefan sets his connection to Alex as `active`.
- Alex has not yet approved and still shows `pending`.

This asymmetry resolves when both sides complete their approval. In practice, operators coordinate out-of-band ("I've approved, have you?"). The protocol does not enforce synchronization -- it trusts the operators to manage their relationship.

---

## 4. The Peering Ceremony

### 4.1 Ceremony Overview

The peering ceremony is a seven-step process. Each step involves a human action on one or both sides.

```
Step 1: Proposal           Initiator creates and sends a proposal.
         |
Step 2: Acknowledgment     Receiver reviews the proposal, decides to proceed.
         |
Step 3: Manifest Exchange  Both operators share their HQ manifests.
         |
Step 4: Trust Negotiation  Both operators review manifests and choose trust levels.
         |
Step 5: Human Approval     Both operators explicitly approve the connection.
         |
Step 6: Activation         Both HQs record the connection as active.
         |
Step 7: Confirmation       Both operators confirm the connection is live.
```

**Time scale:** The ceremony is not instant. Steps may take minutes, hours, or days depending on operator availability and the formality of the relationship. The protocol imposes no time limit on the ceremony itself -- only on the proposal (which expires after a configurable period, default 14 days).

### 4.2 Out-of-Band Delivery

In v1, all ceremony artifacts (proposals, manifests, approvals) are exchanged **out-of-band**. The protocol defines the format of these artifacts, not the mechanism by which they are delivered. Operators may use:

- Slack DM
- Email attachment
- Shared drive folder
- Git repository
- Physical USB stick
- Any other file transfer mechanism

Future versions may define in-band delivery (HTTP API, HIAMP relay), but v1 keeps delivery deliberately manual to reinforce the human-gated nature of the process.

### 4.3 Ceremony Artifacts

| Artifact | Created By | Contains | Format |
|----------|-----------|----------|--------|
| **Connection Proposal** | Initiator | Identity, message, proposal ID | YAML file |
| **Manifest** | Both operators | HQ identity, capabilities, knowledge domains, preferences | YAML file (see [Manifest Schema](manifest-schema.md)) |
| **Approval Record** | Both operators | Local config entry marking connection as active | YAML in `config/world.yaml` |
| **Peer Cache** | Both operators | Cached copy of peer's manifest | YAML in `workspace/world/peers/{owner}/` |
| **Connection Log Entry** | Both operators | Timestamped record of the connection event | YAML in `workspace/world/transfers/` |

---

## 5. Connection Initiation Format

### 5.1 The Connection Proposal

A connection proposal is the formal artifact that initiates the peering ceremony. It is created by the initiating operator and delivered to the receiving operator.

```yaml
# HQ World Connection Proposal
# From: stefan -> To: alex
# Protocol: World Protocol v1

proposal:
  # Unique proposal identifier
  id: prop-a1b2c3d4

  # Protocol version
  version: v1

  # Who is proposing
  from:
    owner: stefan
    instance-id: stefan-hq-primary
    display-name: "Stefan's HQ"
    world-version: v1

  # Who is being proposed to
  to:
    owner: alex                       # Known or expected owner name

  # Human-readable message explaining the purpose
  message: |
    Hey Alex -- proposing a World connection between our HQs for the
    hq-cloud collaboration. My instance has architecture, frontend, and
    QA workers. I'm interested in coordinating on backend development
    and sharing testing knowledge.

  # Connection preferences (what the initiator is looking for)
  preferences:
    proposed-trust-level: verified    # What trust level the initiator suggests
    proposed-transport: file          # What transport the initiator prefers
    collaboration-interests:
      - "Backend/frontend coordination for hq-cloud"
      - "Testing pattern sharing"
      - "Worker pattern exchange (pollination)"

  # Timestamps
  proposed-at: "2026-02-16T10:00:00Z"
  expires-at: "2026-03-02T10:00:00Z"   # 14 days from proposal

  # Optional: include manifest inline (to skip a round-trip)
  include-manifest: true               # If true, initiator's manifest follows
```

### 5.2 Proposal Field Reference

| Field | Required | Format | Description |
|-------|----------|--------|-------------|
| `id` | Yes | `prop-{8-hex-chars}` | Unique proposal identifier. Generated by the initiator. Used to track this specific proposal through the ceremony. |
| `version` | Yes | `v{major}` | World Protocol version. `v1` for this spec. |
| `from.owner` | Yes | Owner format | Initiator's owner name. |
| `from.instance-id` | Yes | Instance-id format | Initiator's instance identifier. |
| `from.display-name` | No | String (max 128 chars) | Initiator's human-readable name. |
| `from.world-version` | Yes | `v{major}` | Initiator's World Protocol version. |
| `to.owner` | Yes | Owner format | Receiver's expected owner name. |
| `message` | No | String (max 2048 chars) | Human-readable explanation of why the initiator wants to connect. Strongly recommended -- proposals without context are harder to evaluate. |
| `preferences.proposed-trust-level` | No | `open` \| `verified` \| `trusted` | The trust level the initiator suggests for the connection. Informational -- the final trust level is decided independently by each operator. |
| `preferences.proposed-transport` | No | `file` \| `git` \| `http` \| `hiamp` | The transport the initiator prefers. |
| `preferences.collaboration-interests` | No | List of strings (max 5, max 256 chars each) | Topics the initiator wants to collaborate on. |
| `proposed-at` | Yes | ISO 8601 datetime (UTC) | When the proposal was created. |
| `expires-at` | Yes | ISO 8601 datetime (UTC) | When the proposal expires. Default: 14 days from `proposed-at`. |
| `include-manifest` | No | Boolean | Whether the initiator's manifest is included alongside the proposal. Including it saves a round-trip in the manifest exchange step. |

### 5.3 Proposal ID Format

Proposal IDs follow the format `prop-{8-hex-chars}`:

```
prop-a1b2c3d4
prop-9f8e7d6c
prop-00112233
```

The ID is generated by the initiator's HQ using a random hex string. It must be unique within the initiator's proposal history. The receiver uses this ID to reference the specific proposal in their response.

### 5.4 Proposal Expiry

Proposals expire after a configurable period (default: 14 days). An expired proposal cannot be accepted -- the initiator must create a new proposal.

**Why expiry?** Proposals are not standing invitations. They represent a specific intent at a specific time. If the receiver has not responded in two weeks, the context may have changed. A new proposal ensures both operators are working from current intent.

### 5.5 Proposal Delivery

The initiator delivers the proposal as a YAML file. The file is named `proposal-{id}.yaml`:

```
proposal-prop-a1b2c3d4.yaml
```

If `include-manifest: true`, the initiator's manifest is delivered alongside the proposal:

```
proposal-prop-a1b2c3d4.yaml
manifest-stefan.yaml
```

The delivery mechanism is out-of-band (Slack DM, email, shared drive, etc.).

---

## 6. Manifest Exchange

### 6.1 Purpose

The manifest exchange is the information-sharing step of the ceremony. Both operators share their HQ manifests so each side can make an informed decision about whether to connect and at what trust level.

The manifest is the **business card** -- it reveals enough to evaluate the connection without exposing internal details. See [Manifest Schema](manifest-schema.md) for the full manifest format.

### 6.2 Exchange Flow

```
Step 1: Initiator sends proposal (optionally with manifest)
         |
Step 2: Receiver reviews proposal
         |
Step 3: If initiator did not include manifest, receiver requests it
         |
Step 4: Both operators share manifests
         |
Step 5: Both operators review each other's manifest
```

**Optimized flow (include-manifest: true):** When the initiator includes their manifest with the proposal, the receiver can skip the manifest request and immediately share their own manifest back. This reduces the ceremony from five round-trips to three.

**Standard flow (include-manifest: false):** The receiver requests the initiator's manifest after reviewing the proposal. The initiator sends it. Then the receiver sends their own. This adds one round-trip but gives the receiver more control over the pace.

### 6.3 What Each Side Reveals

The manifest is the definitive list of what is shared. Here is a detailed breakdown:

#### Shared in the Manifest

| Category | What is Revealed | Why |
|----------|-----------------|-----|
| **Identity** | Owner name, instance ID, display name | The peer needs to know who they are connecting to. |
| **Worker IDs** | Worker identifiers (e.g., `architect`, `qa-tester`) | Capability discovery -- the peer needs to know what workers exist. |
| **Worker Types** | Worker type classification (CodeWorker, ContentWorker, etc.) | Helps the peer understand the nature of available capabilities. |
| **Worker Descriptions** | Brief description of what each worker does | Enough context to evaluate whether the capability is relevant. |
| **Worker Skills** | Searchable skill tags (e.g., `react`, `playwright`) | Enables skill-based capability queries. |
| **Knowledge Domains** | Domain labels and descriptions (e.g., "Testing & QA") | Tells the peer what knowledge areas this HQ covers. |
| **Knowledge Depth** | Surface / moderate / deep per domain | Signals how comprehensive the knowledge is. |
| **Connection Preferences** | Preferred transport, trust level, refresh interval | Helps align connection parameters. |
| **Collaboration Interests** | Topics the operator wants to collaborate on | Establishes shared purpose for the connection. |
| **Worker Count** | Total workers (including hidden ones) | Gives a sense of scale without revealing hidden workers. |
| **Public Metadata** | Role, focus areas, tags (if operator chooses to share) | Additional context for the peer. |

#### Stays Private (NOT in Manifest)

| Category | What Stays Private | Why |
|----------|-------------------|-----|
| **Worker Instructions** | Internal prompts, system instructions, learned rules | These are the worker's "brain" -- proprietary and often contain sensitive patterns. |
| **Worker Skill File Contents** | The actual skill definitions (`.md` files) | Skill files contain detailed instructions; the manifest shares only skill names. |
| **Knowledge File Contents** | The actual knowledge documents | Knowledge content is shared through explicit Knowledge Transfers, not manifests. |
| **Project Details** | PRDs, project state, workspace contents | Projects are shared through Context Transfers, not manifests. |
| **Security Configuration** | Tokens, secrets, auth config | Security is never shared. |
| **Agents.md Details** | Full operator profile, preferences, personal notes | The manifest shares only the operator's public-facing identity. |
| **Connection History** | Existing peer connections, transfer logs | An operator's other relationships are private. |
| **Redacted Workers** | Workers excluded via the redaction list | The `worker-count` includes them; the `workers` list does not name them. |
| **Redacted Domains** | Knowledge domains excluded via the redaction list | Same pattern as redacted workers. |

### 6.4 Manifest Freshness

The manifest shared during the peering ceremony SHOULD be freshly generated. Stale manifests can misrepresent the HQ's current capabilities. The recommended practice:

1. Before sending a proposal, regenerate your manifest.
2. Before responding to a proposal, regenerate your manifest.
3. Include the `generated-at` timestamp so the peer can assess freshness.

A peer receiving a manifest older than 7 days SHOULD request a refresh before proceeding with the ceremony.

### 6.5 Manifest Verification

In v1, there is no cryptographic verification of manifests. The operator trusts the manifest based on:

1. **Delivery channel trust.** If the manifest arrived via a trusted Slack DM, the operator has reasonable confidence it came from the claimed sender.
2. **Content plausibility.** Does the manifest describe capabilities consistent with what the operator knows about the peer?
3. **Out-of-band confirmation.** The operator can ask the peer directly: "Your manifest says you have a qa-tester worker -- is that current?"

Future versions may add manifest signing (using the operator's keypair) for cryptographic verification.

---

## 7. Trust Levels

### 7.1 Trust Level Definitions

Trust levels govern how transfers are handled on a connection. They determine the level of scrutiny applied to incoming data and the degree of automation available.

| Level | Code | Label | Description |
|-------|------|-------|-------------|
| 0 | `open` | **Open** | Minimal trust. The connection exists, but all transfers require individual review and manual approval. Suitable for new, experimental, or low-stakes connections. |
| 1 | `verified` | **Verified** | Identity confirmed through out-of-band means (shared Slack workspace, known email, in-person meeting). The standard trust level for active collaborators. Transfers are reviewed but familiar patterns may be batch-approved. |
| 2 | `trusted` | **Trusted** | High trust built through history of successful interactions. Enables auto-approval rules for specific transfer types or knowledge domains. Reserved for long-standing, proven relationships. |

### 7.2 Trust Level Semantics

#### Open (Level 0)

**When to use:** First-time connections with unknown operators. Experimental connections. Connections established through a directory listing with no prior relationship.

**Transfer handling:**
- All incoming transfers are staged to inbox.
- Every transfer requires individual operator review and explicit approval.
- No batch approval. No auto-approval.
- System transfers (ping, manifest refresh) require approval.

**What it means:** "I am willing to receive data from you, but I will inspect everything carefully."

#### Verified (Level 1)

**When to use:** Connections where identity has been confirmed. Colleagues in the same organization. People you have met and communicated with through trusted channels.

**Transfer handling:**
- Incoming transfers are staged to inbox.
- Operator reviews transfers before integration.
- Familiar transfer types (previously accepted types from this peer) may be batch-approved.
- System transfers (ping, manifest refresh) are auto-processed.

**What it means:** "I know who you are. I trust your intent but still review your content."

**Identity verification methods (any of):**
- Shared Slack workspace membership
- Known email correspondence
- Video call or in-person meeting
- Shared secret or pre-shared key
- Mutual vouching by a common trusted peer

#### Trusted (Level 2)

**When to use:** Long-standing collaborations with a track record of successful transfers. Business partners. Team members in a close working relationship.

**Transfer handling:**
- Incoming transfers are staged to inbox.
- Operator may configure **auto-approval rules** for specific transfer types or knowledge domains.
- Auto-approval is opt-in and scoped -- the operator defines exactly which types/domains can be auto-approved.
- Worker pattern transfers always require manual approval regardless of trust level (they are structural changes).
- System transfers are auto-processed.

**Auto-approval rules example:**
```yaml
# In config/world.yaml, per-peer auto-approval
connections:
  - peer: alex
    trust-level: trusted
    auto-approve:
      - type: knowledge
        domains: [testing, infrastructure]    # Only these domains
      - type: context
        projects: [hq-cloud]                  # Only this project
      # worker-pattern is never auto-approved
```

**What it means:** "I trust you enough to accept certain types of data automatically, within bounds I have defined."

### 7.3 Trust Is Asymmetric and Unilateral

Trust is set independently by each operator. It is a local configuration decision, not a negotiated agreement.

```
Stefan's view:          Alex's view:
  alex: trusted           stefan: verified
```

This is valid and expected. Stefan may trust Alex more than Alex trusts Stefan. Perhaps Stefan has a longer history with Alex's work, or Stefan has a higher risk tolerance. The protocol does not require trust symmetry.

**The trust level governs incoming behavior.** Stefan's trust level for Alex determines how Stefan's HQ handles transfers FROM Alex. It does not affect how Alex's HQ handles transfers from Stefan.

### 7.4 Trust Escalation

Trust levels are upgraded by operator decision. The protocol does not auto-escalate trust.

```
Open (0)  ------>  Verified (1)  ------>  Trusted (2)
              ^                       ^
              |                       |
        Operator decides        Operator decides
        (after verifying        (after building
         identity)               track record)
```

**Recommended escalation criteria (not enforced):**

| Transition | Recommended Criteria |
|-----------|---------------------|
| Open -> Verified | Identity confirmed through one of the methods in Section 7.2. At least one successful transfer exchange. |
| Verified -> Trusted | History of 5+ successful transfers with no integrity issues. Active collaboration for 30+ days. Operator confidence in the peer's judgment. |

These are guidelines, not rules. The operator's judgment is final.

### 7.5 Trust Downgrade

Trust can be downgraded at any time, instantly and unilaterally.

```yaml
# Before
connections:
  - peer: alex
    trust-level: trusted     # Level 2

# After (operator edits config)
connections:
  - peer: alex
    trust-level: open        # Level 0
```

**Downgrade is immediate.** The next incoming transfer from the downgraded peer will be handled at the new trust level. Previously auto-approved domains are no longer auto-approved.

**Downgrade is silent.** The peer is not notified of the trust downgrade. Trust level is an internal policy decision. However, the peer may notice behavioral changes (e.g., transfers that were previously auto-processed now require manual approval).

---

## 8. Human Approval Gates

### 8.1 Mandatory Approval Points

The following actions **always** require human operator approval, regardless of trust level:

| Action | Who Must Approve | Why |
|--------|-----------------|-----|
| **Creating a connection proposal** | Initiating operator | Connecting to another HQ is a deliberate act. |
| **Accepting a connection proposal** | Receiving operator | No one can force a connection on you. |
| **Activating a connection** | Both operators (mutual approval) | Both sides must consent for the connection to go live. |
| **Integrating a worker pattern** | Receiving operator | Worker patterns are structural changes to the HQ. |
| **First transfer of any type** | Receiving operator | The first transfer from a new peer sets the precedent. |
| **Upgrading trust level** | The upgrading operator | Trust escalation is a human judgment call. |
| **Reconnection after disconnection** | Both operators | Reconnection is a new peering ceremony. |

### 8.2 Conditionally Automated Points

The following actions **may** be automated at Trust Level 2 (Trusted), if the operator has configured auto-approval rules:

| Action | Auto-Approval Conditions | Still Logged? |
|--------|--------------------------|---------------|
| Knowledge transfer in a pre-approved domain | Trust level 2 + domain in auto-approve list | Yes |
| Context transfer for a pre-approved project | Trust level 2 + project in auto-approve list | Yes |
| System transfers (ping, manifest refresh) | Trust level 1 or higher | Yes |
| Manifest refresh from a connected peer | Trust level 1 or higher | Yes |

**Even when auto-approved, every action is logged.** The operator can review all auto-approved transfers in the transfer log. Auto-approval is a convenience, not a bypass of accountability.

### 8.3 Never Automated

The following actions can **never** be automated, even at Trust Level 2:

| Action | Why |
|--------|-----|
| New connection establishment | Connections are diplomatic. Always human-gated. |
| Worker pattern integration | Structural changes. Too impactful for automation. |
| Trust level upgrade | A human judgment call, not a metric threshold. |
| Disconnection | Severing a relationship requires human intent. |
| Responding to a connection proposal | A new relationship requires human evaluation. |

### 8.4 Approval UX

The protocol defines **what** requires approval, not **how** the approval is presented. Implementations may use:

- Command-line prompts (`Accept this connection? [y/n]`)
- Configuration file edits (the operator adds a connection record to `config/world.yaml`)
- A web UI with approve/reject buttons (future)
- A Slack bot interaction (future)

The approval mechanism is an implementation detail. The protocol requirement is that the action happens -- a human made a choice.

---

## 9. Connection Activation & Storage

### 9.1 What Happens at Activation

When both operators approve a connection, each HQ performs these actions:

1. **Update connection record.** Set the connection status to `active` in `config/world.yaml`.
2. **Cache peer manifest.** Store the peer's manifest at `workspace/world/peers/{owner}/manifest.yaml`.
3. **Create peer directory.** Create `workspace/world/peers/{owner}/` if it does not exist.
4. **Log the event.** Write a connection event to the transfer log at `workspace/world/transfers/`.
5. **Set initial trust level.** Record the trust level in the connection record.

### 9.2 Connection Record Format

Each connection is recorded in `config/world.yaml`:

```yaml
# config/world.yaml (partial — connection section)
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
    proposal-id: prop-a1b2c3d4
    connected-at: "2026-02-16T11:00:00Z"
    approved-at: "2026-02-16T11:00:00Z"
    approved-by: stefan
    manifest-last-refreshed: "2026-02-16T11:00:00Z"
    manifest-refresh-interval: 7d
    auto-approve: []
    notes: "hq-cloud project collaboration"
```

### 9.3 Connection Record Fields

| Field | Required | Format | Description |
|-------|----------|--------|-------------|
| `peer` | Yes | Owner name | The connected peer's owner name. |
| `instance-id` | Yes | Instance-id format | The peer's instance identifier. |
| `display-name` | No | String | Human-readable name for the peer. |
| `status` | Yes | `proposed` \| `pending` \| `active` \| `suspended` \| `disconnected` \| `rejected` \| `expired` | Current connection state. |
| `trust-level` | Yes | `open` \| `verified` \| `trusted` | Trust level for this peer. |
| `transport` | Yes | `file` \| `git` \| `http` \| `hiamp` | Default transport for this peer. |
| `transport-config` | No | Object | Transport-specific configuration (e.g., export/import paths for file transport). |
| `proposal-id` | Yes | Proposal ID | The ID of the proposal that initiated this connection. |
| `connected-at` | No | ISO 8601 datetime | When the connection became active. Null if not yet active. |
| `approved-at` | No | ISO 8601 datetime | When this operator approved the connection. |
| `approved-by` | No | String | The human operator who approved (for audit). |
| `manifest-last-refreshed` | No | ISO 8601 datetime | When the peer's manifest was last refreshed. |
| `manifest-refresh-interval` | No | Duration string | How often to refresh the peer's manifest. Default: `7d`. |
| `auto-approve` | No | List of auto-approval rules | Auto-approval rules for Trust Level 2 connections. |
| `notes` | No | String | Human-readable notes about this connection. |

### 9.4 Peer Manifest Cache

The peer's manifest is cached locally at:

```
workspace/world/peers/{owner}/manifest.yaml
```

This cache is used for:
- Capability queries ("does Alex have a qa-tester worker?")
- Transfer routing decisions
- Manifest freshness checks (trigger refresh if stale)

The cache is read-only. It is updated only when a new manifest is received from the peer (during initial connection or periodic refresh).

### 9.5 Connection Event Log

Every connection state change is logged:

```yaml
# workspace/world/transfers/{date}.yaml (appended)
- event: connection-activated
  peer: alex
  proposal-id: prop-a1b2c3d4
  timestamp: "2026-02-16T11:00:00Z"
  trust-level: verified
  transport: file
  initiated-by: stefan
  details: "Peering ceremony completed. Connection active."
```

---

## 10. Connection Maintenance

### 10.1 Manifest Refresh

Connected peers should periodically refresh their manifests to keep capability information current. The refresh process:

1. Operator regenerates their manifest.
2. Manifest is sent to the peer as a `system` transfer with sub-type `manifest-refresh`.
3. Peer updates their cached copy.

**Refresh interval:** Configurable per-connection. Default: 7 days. The interval is a guideline -- there is no enforcement mechanism. An operator who has not received a refresh may send a `system` transfer with sub-type `manifest-request`.

**Refresh does NOT require re-approval.** The connection is already active; refreshing the manifest is maintenance, not re-establishment.

### 10.2 Health Checks

Optional. An operator can send a `system` transfer with sub-type `ping` to verify the peer is reachable. The peer responds with a `pong`.

```yaml
# Ping
envelope:
  id: txfr-ping-001
  type: system
  from: stefan
  to: alex
  timestamp: "2026-02-16T12:00:00Z"
  version: v1
  payload-hash: sha256:e3b0c44298fc...    # Hash of empty payload
  payload-size: 0
  transport: file

# Pong
envelope:
  id: txfr-pong-001
  type: system
  from: alex
  to: stefan
  timestamp: "2026-02-16T12:05:00Z"
  version: v1
  payload-hash: sha256:e3b0c44298fc...
  payload-size: 0
  transport: file
```

Health checks are informational. A failed health check does not automatically change the connection state -- it alerts the operator, who decides what to do.

### 10.3 Activity Tracking

Each HQ tracks connection activity:

| Metric | Source | Used For |
|--------|--------|----------|
| Last transfer sent | Transfer log | Activity monitoring |
| Last transfer received | Transfer log | Activity monitoring |
| Last manifest refresh | Connection record | Freshness assessment |
| Last health check | Transfer log | Reachability assessment |
| Transfer count (total) | Transfer log | Trust escalation guidance |
| Transfer count (last 30 days) | Transfer log | Activity trend |

This data is stored locally and never shared with the peer.

### 10.4 Inactivity Handling

When a connection has had no transfers or health checks for a configurable period (default: 90 days), the system flags it for operator review:

```
Connection Activity Alert:
  Peer: alex (Alex's HQ)
  Last activity: 2025-11-16 (92 days ago)
  Status: active

  Actions:
  1. Send a health check (ping)
  2. Suspend the connection
  3. Disconnect
  4. Dismiss (keep active)
```

The operator chooses. The system never auto-disconnects based on inactivity alone (but it may auto-expire -- see Section 3.2).

---

## 11. Suspension

### 11.1 What Suspension Means

Suspension is a temporary pause. The connection metadata is preserved, but no transfers flow. It is a middle ground between "active" and "disconnected" -- the operator wants to stop activity without severing the relationship.

### 11.2 Reasons for Suspension

| Reason | Typical Duration | Resolution |
|--------|-----------------|------------|
| Reviewing recent transfers | Hours to days | Operator lifts suspension after review |
| Security concern | Days to weeks | Operator investigates and decides to reactivate or disconnect |
| Operator unavailability | Days to months | Operator reactivates when available |
| System-triggered (inactivity) | Indefinite | Both operators reactivate or disconnect |

### 11.3 Suspension Process

1. Operator sets connection status to `suspended` in their `config/world.yaml`.
2. Optionally sends a `system` transfer with sub-type `suspend-notice` to the peer.
3. All incoming transfers from the suspended peer are held in quarantine (`workspace/world/quarantine/{peer}/`).
4. All outgoing transfers to the suspended peer are blocked.

```yaml
# Connection record after suspension
connections:
  - peer: alex
    status: suspended
    suspended-at: "2026-02-16T15:00:00Z"
    suspended-by: stefan
    suspension-reason: "Reviewing recent knowledge transfer for accuracy"
    suspension-expires: "2026-02-23T15:00:00Z"   # Optional auto-expiry
```

### 11.4 Suspension Notification

The `suspend-notice` system transfer:

```yaml
envelope:
  id: txfr-suspend-001
  type: system
  from: stefan
  to: alex
  timestamp: "2026-02-16T15:00:00Z"
  version: v1
  description: "Connection temporarily suspended."
  payload-hash: sha256:...
  payload-size: 128
  transport: file

# Payload
notification:
  sub-type: suspend-notice
  reason: "Routine review of recent transfers"    # Optional, may be vague
  expected-duration: "7d"                          # Optional hint
```

The notification is a courtesy. Suspension is unilateral -- the operator does not need the peer's consent to suspend.

### 11.5 Lifting Suspension

The suspending operator reactivates by setting the status back to `active`:

```yaml
connections:
  - peer: alex
    status: active
    suspended-at: null
    suspension-reason: null
```

Held transfers in quarantine are released to the inbox for review. A `resume-notice` system transfer may be sent to the peer.

---

## 12. Disconnection

### 12.1 What Disconnection Means

Disconnection is permanent termination of the connection. Unlike suspension, disconnection removes the peer relationship. Reconnection requires a new peering ceremony.

### 12.2 Clean Disconnection Process

1. **Operator decides to disconnect.** This is a human decision. The system never auto-disconnects without operator action (except expiry, which is a soft terminal state).

2. **Update local connection record:**
   ```yaml
   connections:
     - peer: alex
       status: disconnected
       disconnected-at: "2026-02-16T16:00:00Z"
       disconnected-by: stefan
       disconnection-reason: "Collaboration completed"
   ```

3. **Send disconnect notification (optional but recommended):**
   ```yaml
   envelope:
     id: txfr-disconnect-001
     type: system
     from: stefan
     to: alex
     timestamp: "2026-02-16T16:00:00Z"
     version: v1
     description: "Connection terminated."
     payload-hash: sha256:...
     payload-size: 64
     transport: file

   notification:
     sub-type: disconnect
     message: "Collaboration on hq-cloud is complete. Disconnecting. Thanks for the great work!"
   ```

4. **Clean up peer data:**
   - Remove cached peer manifest from `workspace/world/peers/{owner}/manifest.yaml`.
   - Remove the peer directory `workspace/world/peers/{owner}/` (if empty).
   - Quarantined transfers (if any) from this peer are discarded.

5. **Preserve audit data:**
   - The connection record in `config/world.yaml` stays with `status: disconnected` (for history).
   - Transfer log entries are retained (they are audit records).
   - The connection event is logged.

6. **Stop accepting transfers:**
   - Any incoming transfers from the disconnected peer are rejected with `ERR_CONN_NOT_ACTIVE`.

### 12.3 Unilateral Disconnection

Either operator can disconnect without the other's involvement. This is by design -- sovereignty means the right to withdraw.

**What the other side sees:**

If Stefan disconnects and sends a disconnect notification, Alex's HQ processes the notification and marks the connection as disconnected on Alex's side too.

If Stefan disconnects **without** sending a notification, Alex's HQ may still show Stefan as an active peer until:
- A health check fails.
- A transfer to Stefan is rejected.
- Alex manually reviews their peer list.

**Recommendation:** Always send the disconnect notification. It is a courtesy that prevents confusion.

### 12.4 Data Retention After Disconnection

| Data | Retained? | Why |
|------|-----------|-----|
| Connection record | Yes (status: disconnected) | Audit trail. Shows the connection existed and when it ended. |
| Transfer log entries | Yes | Audit trail. Records what was exchanged. |
| Cached peer manifest | No (deleted) | No longer needed. The peer is not connected. |
| Quarantined transfers | No (discarded) | The connection is over. Held transfers are moot. |
| Knowledge imported from peer | Yes | Already integrated into the HQ. Disconnection does not revoke previously accepted data. |
| Worker patterns from peer | Yes | Already adapted and activated. Disconnection does not remove workers. |

**Key principle:** Disconnection does not undo past transfers. Data that was accepted and integrated belongs to the receiving HQ. This is analogous to diplomatic relations: ending an alliance does not return the trade goods already exchanged.

---

## 13. Reconnection

### 13.1 Reconnection After Disconnection

After a disconnection (by either side), operators can reconnect. Reconnection requires a **new peering ceremony from Step 1**. There is no fast-path for reconnection -- the full ceremony must be repeated.

**Why?** A disconnection may indicate a change in the relationship. The new ceremony ensures both operators re-evaluate the connection with fresh context, fresh manifests, and fresh intent.

### 13.2 Reconnection After Expiry

After a connection expires, reconnection can follow a simplified path:

1. Either operator creates a new proposal (standard Step 1).
2. Both operators exchange updated manifests (Step 3).
3. Both operators approve (Step 5).
4. Steps 2 and 4 (acknowledgment and trust negotiation) may be abbreviated since the operators have history.

The simplified path is a convention, not a protocol requirement. Operators may choose the full ceremony if they prefer.

### 13.3 History Preservation

Previous transfer history is preserved across reconnections. When Stefan reconnects to Alex, Stefan's transfer log still contains all previous exchanges with Alex. This history can inform trust decisions for the new connection.

---

## 14. Error Handling

### 14.1 Ceremony Errors

| Error | Code | When | Resolution |
|-------|------|------|------------|
| Owner name conflict | `ERR_ID_OWNER_CONFLICT` | Manifest exchange reveals both HQs have the same `owner` value | One operator must change their owner name before the ceremony can proceed. |
| Instance-id conflict | `ERR_ID_INSTANCE_CONFLICT` | Manifest exchange reveals both HQs have the same `instance-id` value | One operator must change their instance-id. |
| Version mismatch | `ERR_VERSION_UNSUPPORTED` | Proposal or manifest uses an unsupported protocol version | Both operators must use compatible protocol versions. |
| Proposal expired | `ERR_CONN_PROPOSAL_EXPIRED` | Receiver attempts to accept an expired proposal | Initiator must create a new proposal. |
| Proposal already resolved | `ERR_CONN_PROPOSAL_RESOLVED` | Receiver attempts to accept/reject a proposal that has already been accepted or rejected | No action needed; the proposal has already been handled. |
| Connection already exists | `ERR_CONN_ALREADY_EXISTS` | Proposal sent to a peer with an existing active connection | No action needed unless the operator wants to renegotiate (disconnect first, then re-propose). |

### 14.2 Runtime Connection Errors

| Error | Code | When | Resolution |
|-------|------|------|------------|
| Transfer to non-active peer | `ERR_CONN_NOT_ACTIVE` | Transfer attempted on a connection not in ACTIVE state | Check connection status. Activate or reconnect as needed. |
| Transfer from unknown peer | `ERR_ID_UNKNOWN` | Transfer received from an HQ that is not in the peer list | Reject the transfer. If desired, initiate a peering ceremony. |
| Connection suspended | `ERR_CONN_SUSPENDED` | Transfer attempted on a suspended connection | Wait for suspension to be lifted, or contact the peer out-of-band. |

### 14.3 Error Behavior

All errors are:

1. **Logged** to the local transfer log with full details.
2. **Surfaced** to the operator (not silently swallowed).
3. **Non-destructive** -- an error during the ceremony does not corrupt existing connection state.
4. **Recoverable** -- after resolving the error condition, the ceremony can be retried from the point of failure.

---

## 15. End-to-End Walkthrough

### 15.1 Scenario: Stefan and Alex Connect for the First Time

**Context:** Stefan and Alex are colleagues at the same company. Stefan's HQ has architecture, frontend, and QA workers. Alex's HQ has backend, QA, and DevOps workers. They want to coordinate on the hq-cloud project and share testing knowledge.

They know each other from a shared Slack workspace. They have never connected their HQ instances before.

---

**Step 1: Stefan decides to connect.**

Stefan opens his HQ and runs:

```
> /run architect world connect alex
```

His HQ generates a fresh manifest, then creates a connection proposal:

```yaml
proposal:
  id: prop-7f3e2d1c
  version: v1
  from:
    owner: stefan
    instance-id: stefan-hq-primary
    display-name: "Stefan's HQ"
    world-version: v1
  to:
    owner: alex
  message: |
    Hey Alex -- proposing a World connection for the hq-cloud project.
    My HQ has architecture, frontend, and QA workers. Would like to
    coordinate on backend integration and share testing patterns.
  preferences:
    proposed-trust-level: verified
    proposed-transport: file
    collaboration-interests:
      - "Backend/frontend coordination for hq-cloud"
      - "E2E testing pattern sharing"
  proposed-at: "2026-02-16T10:00:00Z"
  expires-at: "2026-03-02T10:00:00Z"
  include-manifest: true
```

Stefan's HQ writes:
- `proposal-prop-7f3e2d1c.yaml`
- `manifest-stefan.yaml`

Stefan sends both files to Alex via Slack DM: "Hey Alex, here's my HQ World connection proposal. Manifests attached."

Stefan's HQ records the proposal locally:

```yaml
# config/world.yaml (updated)
connections:
  - peer: alex
    status: proposed
    proposal-id: prop-7f3e2d1c
    proposed-at: "2026-02-16T10:00:00Z"
```

**State: PROPOSED** (Stefan's side) / (Unknown on Alex's side)

---

**Step 2: Alex receives and reviews the proposal.**

Alex receives the files in Slack. He drops them into his HQ's import directory and runs:

```
> /run architect world review-proposal ~/hq-imports/proposal-prop-7f3e2d1c.yaml
```

His HQ displays:

```
Connection Proposal Review
==========================

From: stefan (Stefan's HQ)
  Instance: stefan-hq-primary
  Protocol: World v1

Message:
  Hey Alex -- proposing a World connection for the hq-cloud project.
  My HQ has architecture, frontend, and QA workers. Would like to
  coordinate on backend integration and share testing patterns.

Suggested Trust Level: verified
Suggested Transport: file

Collaboration Interests:
  - Backend/frontend coordination for hq-cloud
  - E2E testing pattern sharing

Manifest Summary (Stefan's HQ):
  Workers: 12 public of 17 total
    - architect (CodeWorker): system-design, api-design, architecture
    - frontend-dev (CodeWorker): react, nextjs, css, ui
    - qa-tester (CodeWorker): playwright, vitest, e2e
    - ... (9 more)
  Knowledge Domains: 6 public of 8 total
    - Testing & QA (deep)
    - Web Development (deep)
    - Agent Communication Protocol (deep)
    - ... (3 more)

Proposal expires: 2026-03-02

Proceed with this connection? [y/n]
```

Alex reviews. Stefan's capabilities look relevant -- the architect and frontend workers complement Alex's backend workers. The testing knowledge could be valuable.

Alex types `y`. His HQ moves the proposal to PENDING status and generates his own manifest.

**State: PENDING** (both sides)

---

**Step 3: Alex sends his manifest back to Stefan.**

Alex's HQ generates a fresh manifest and presents it for review:

```
Your manifest will share:
  Workers: 8 public of 10 total
    - backend-dev (CodeWorker): api-dev, database, backend, nodejs
    - qa-tester (CodeWorker): playwright, vitest, e2e, api-testing
    - devops (CodeWorker): aws, terraform, ci-cd, docker
    - ... (5 more)
  Knowledge Domains: 5 public of 7 total
    - Backend Development (deep)
    - Infrastructure & DevOps (moderate)
    - ... (3 more)

Send manifest to stefan? [y/n]
```

Alex approves. His HQ writes `manifest-alex.yaml`. Alex sends it to Stefan via Slack DM.

---

**Step 4: Both operators review manifests and choose trust levels.**

Stefan reviews Alex's manifest:

```
Peer Manifest: alex (Alex's HQ)
================================
Workers: 8 public of 10 total
  - backend-dev: API endpoints, business logic (api-dev, database, backend, nodejs)
  - qa-tester: E2E testing, test automation (playwright, vitest, e2e, api-testing)
  - devops: Infrastructure, CI/CD (aws, terraform, ci-cd, docker)
  ...

Knowledge Domains: 5 public of 7 total
  - Backend Development (deep)
  - Infrastructure & DevOps (moderate)
  ...

Connection Preferences:
  Transport: file
  Trust Level: verified
  Accepting Connections: true
```

Stefan decides: **Trust Level = Verified** (they work at the same company, share a Slack workspace).

Alex reviews Stefan's manifest and decides: **Trust Level = Verified** (same reasoning).

---

**Step 5: Both operators approve.**

Stefan approves:

```
> /run architect world approve --peer alex --trust-level verified
```

His HQ updates `config/world.yaml`:

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
    notes: "hq-cloud project collaboration"
```

Alex approves:

```
> /run architect world approve --peer stefan --trust-level verified
```

His HQ updates his `config/world.yaml` similarly.

**State: ACTIVE** (both sides)

---

**Step 6: Connection activation.**

Both HQs perform activation tasks:

- Cache the peer's manifest:
  - Stefan: `workspace/world/peers/alex/manifest.yaml`
  - Alex: `workspace/world/peers/stefan/manifest.yaml`

- Log the connection event:
  ```yaml
  - event: connection-activated
    peer: alex
    proposal-id: prop-7f3e2d1c
    timestamp: "2026-02-16T11:00:00Z"
    trust-level: verified
    transport: file
  ```

---

**Step 7: Confirmation.**

Stefan verifies:

```
> /run architect world peers
```

```
Connected Peers:
  1. alex (Alex's HQ)
     Status: active
     Trust: verified
     Connected: 2026-02-16
     Transport: file
     Workers: 8 (backend-dev, qa-tester, devops, ...)
     Knowledge: Backend Development (deep), Infrastructure (moderate), ...
```

Alex runs the same command and sees Stefan listed.

**The peering ceremony is complete.** Stefan and Alex can now exchange transfers: knowledge files, worker patterns, and project context.

---

### 15.2 Scenario: After Connection -- First Transfer

Immediately after connecting, Stefan wants to share his E2E testing knowledge with Alex.

```
> /run architect world export --type knowledge --files knowledge/testing/e2e-learnings.md --to alex
```

Stefan's HQ creates a transfer bundle and Stefan shares it with Alex. Alex imports it:

```
> /run architect world import ~/hq-imports/txfr-e2e-testing-001/

Transfer Preview:
  From: stefan (Stefan's HQ)
  Type: knowledge
  Connection Trust: verified
  Files: 1 (e2e-learnings.md)
  Domain: testing
  Hash: verified

  Accept? [y/n]
```

Alex types `y`. The knowledge file is staged to his inbox for review and integration.

This is the **first transfer** on the connection, so it requires manual approval regardless of trust level (Section 8.1). Future knowledge transfers in the `testing` domain can be batch-approved once the operators build confidence.

---

### 15.3 Scenario: Disconnection After Project Completion

Six months later, the hq-cloud project is complete. Stefan and Alex decide to disconnect their HQs since active collaboration has ended.

Stefan initiates:

```
> /run architect world disconnect alex
```

```
Disconnect from alex (Alex's HQ)?

  Connection since: 2026-02-16
  Trust level: trusted (upgraded from verified)
  Transfers exchanged: 23 (12 sent, 11 received)
  Last activity: 2026-08-10

  This will:
  - Remove Alex's cached manifest
  - Stop accepting transfers from Alex
  - Send a disconnect notification to Alex
  - Preserve transfer history (audit log)

  Proceed? [y/n]
```

Stefan types `y`. His HQ:

1. Updates the connection record to `status: disconnected`.
2. Sends a disconnect notification to Alex.
3. Removes `workspace/world/peers/alex/manifest.yaml`.
4. Logs the disconnection event.

Alex receives the notification. His HQ:

1. Updates the connection record to `status: disconnected`.
2. Removes `workspace/world/peers/stefan/manifest.yaml`.
3. Logs the disconnection event.

```
Connection Disconnected:
  stefan (Stefan's HQ) has disconnected.
  Message: "hq-cloud project complete. Great collaboration! Disconnect is clean."

  Transfer history preserved: 23 transfers over 6 months.
  To reconnect in the future, a new peering ceremony is required.
```

**The connection is cleanly terminated.** All previously transferred knowledge and worker patterns remain in both HQs. The transfer history is preserved for audit. If they want to reconnect later, they start a new peering ceremony.

---

## 16. Security Considerations

### 16.1 Proposal Spoofing

In v1, proposals are not cryptographically signed. An attacker could create a proposal claiming to be from a known operator. **Mitigation:** Operators should verify proposals through out-of-band means (ask the supposed sender via a trusted channel: "Did you send me this proposal?").

### 16.2 Manifest Tampering

Manifests could be tampered with in transit. **Mitigation:** Deliver manifests through trusted channels. In v1, the trust in the manifest derives from the trust in the delivery channel. Future versions may add manifest signing.

### 16.3 Connection Hijacking

If an attacker gains access to an operator's HQ files, they could modify connection records. **Mitigation:** Standard file system security. Connection changes are logged, so tampering is detectable through audit log review.

### 16.4 Social Engineering

An attacker could impersonate a known operator and send a convincing proposal. **Mitigation:** Always verify proposals out-of-band. At Trust Level 1 (Verified) and above, identity confirmation is a prerequisite.

### 16.5 Denial of Service

An attacker could flood an operator with connection proposals. **Mitigation:** Proposals are reviewed manually, so the attack surface is limited to operator annoyance. Implementations may add rate limiting on incoming proposals.

### 16.6 Future Improvements

| Improvement | Description | Version |
|-------------|-------------|---------|
| Proposal signing | Proposals signed with operator keypair | v2 |
| Manifest signing | Manifests signed with operator keypair | v2 |
| Key exchange | Public key exchange during peering ceremony | v2 |
| Challenge-response | Cryptographic identity verification in the ceremony | v2 |

---

## Appendix A: Proposal Schema (YAML)

```yaml
$schema: "https://json-schema.org/draft/2020-12/schema"
$id: "https://hq.dev/schemas/world-connection-proposal-v1.json"
title: "World Protocol Connection Proposal"
description: "Schema for connection proposals in the HQ World peering ceremony"
type: object
required:
  - proposal
additionalProperties: false
properties:
  proposal:
    type: object
    required:
      - id
      - version
      - from
      - to
      - proposed-at
      - expires-at
    additionalProperties: false
    properties:
      id:
        type: string
        pattern: "^prop-[a-f0-9]{8}$"
        description: "Unique proposal identifier"
      version:
        type: string
        pattern: "^v[0-9]+$"
        description: "World Protocol version"
      from:
        type: object
        required:
          - owner
          - instance-id
          - world-version
        additionalProperties: false
        properties:
          owner:
            type: string
            pattern: "^[a-z0-9][a-z0-9-]*[a-z0-9]$"
            minLength: 2
            maxLength: 32
          instance-id:
            type: string
            pattern: "^[a-z0-9][a-z0-9-]*[a-z0-9]$"
            minLength: 2
            maxLength: 64
          display-name:
            type: string
            maxLength: 128
          world-version:
            type: string
            pattern: "^v[0-9]+$"
      to:
        type: object
        required:
          - owner
        additionalProperties: false
        properties:
          owner:
            type: string
            pattern: "^[a-z0-9][a-z0-9-]*[a-z0-9]$"
            minLength: 2
            maxLength: 32
      message:
        type: string
        maxLength: 2048
        description: "Human-readable message explaining the connection request"
      preferences:
        type: object
        additionalProperties: false
        properties:
          proposed-trust-level:
            type: string
            enum: [open, verified, trusted]
          proposed-transport:
            type: string
            enum: [file, git, http, hiamp]
          collaboration-interests:
            type: array
            maxItems: 5
            items:
              type: string
              maxLength: 256
      proposed-at:
        type: string
        format: date-time
        description: "When the proposal was created (UTC)"
      expires-at:
        type: string
        format: date-time
        description: "When the proposal expires (UTC)"
      include-manifest:
        type: boolean
        default: false
        description: "Whether the initiator's manifest accompanies the proposal"
```

---

## Appendix B: Connection Record Schema

```yaml
$schema: "https://json-schema.org/draft/2020-12/schema"
$id: "https://hq.dev/schemas/world-connection-record-v1.json"
title: "World Protocol Connection Record"
description: "Schema for connection records in config/world.yaml"
type: object
required:
  - peer
  - status
  - trust-level
  - transport
  - proposal-id
additionalProperties: false
properties:
  peer:
    type: string
    pattern: "^[a-z0-9][a-z0-9-]*[a-z0-9]$"
    minLength: 2
    maxLength: 32
    description: "Connected peer's owner name"
  instance-id:
    type: string
    pattern: "^[a-z0-9][a-z0-9-]*[a-z0-9]$"
    minLength: 2
    maxLength: 64
    description: "Peer's instance identifier"
  display-name:
    type: string
    maxLength: 128
    description: "Peer's human-readable name"
  status:
    type: string
    enum: [proposed, pending, active, suspended, disconnected, rejected, expired]
    description: "Current connection state"
  trust-level:
    type: string
    enum: [open, verified, trusted]
    description: "Trust level for this peer"
  transport:
    type: string
    enum: [file, git, http, hiamp]
    description: "Default transport for this peer"
  transport-config:
    type: object
    description: "Transport-specific configuration"
  proposal-id:
    type: string
    pattern: "^prop-[a-f0-9]{8}$"
    description: "ID of the proposal that initiated this connection"
  connected-at:
    type: [string, "null"]
    format: date-time
    description: "When the connection became active"
  approved-at:
    type: [string, "null"]
    format: date-time
    description: "When this operator approved the connection"
  approved-by:
    type: [string, "null"]
    description: "The human operator who approved"
  disconnected-at:
    type: [string, "null"]
    format: date-time
    description: "When the connection was disconnected"
  disconnected-by:
    type: [string, "null"]
    description: "Who disconnected"
  disconnection-reason:
    type: [string, "null"]
    description: "Reason for disconnection"
  suspended-at:
    type: [string, "null"]
    format: date-time
    description: "When the connection was suspended"
  suspended-by:
    type: [string, "null"]
    description: "Who suspended"
  suspension-reason:
    type: [string, "null"]
    description: "Reason for suspension"
  suspension-expires:
    type: [string, "null"]
    format: date-time
    description: "When the suspension auto-expires"
  manifest-last-refreshed:
    type: [string, "null"]
    format: date-time
    description: "When the peer's manifest was last updated"
  manifest-refresh-interval:
    type: string
    pattern: "^[0-9]+(d|h|m)$"
    default: "7d"
    description: "How often to refresh the peer's manifest"
  auto-approve:
    type: array
    items:
      type: object
      properties:
        type:
          type: string
          enum: [knowledge, context]
        domains:
          type: array
          items:
            type: string
        projects:
          type: array
          items:
            type: string
    default: []
    description: "Auto-approval rules (Trust Level 2 only)"
  notes:
    type: [string, "null"]
    maxLength: 1024
    description: "Human-readable notes about this connection"
```

---

## Appendix C: Quick Reference

### Ceremony Steps

| Step | Action | Who | Artifact |
|------|--------|-----|----------|
| 1 | Create & send proposal | Initiator | `proposal-{id}.yaml` |
| 2 | Review & acknowledge | Receiver | (internal state change) |
| 3 | Exchange manifests | Both | `manifest-{owner}.yaml` |
| 4 | Review & choose trust level | Both | (internal decision) |
| 5 | Approve connection | Both | `config/world.yaml` update |
| 6 | Activate & cache | Both | Peer cache + event log |
| 7 | Confirm | Both | `/run architect world peers` |

### State Machine Summary

| State | Transfers? | Next States |
|-------|-----------|-------------|
| PROPOSED | No | PENDING, REJECTED, DISCONNECTED |
| PENDING | No | ACTIVE, REJECTED |
| ACTIVE | Yes | SUSPENDED, DISCONNECTED, EXPIRED |
| SUSPENDED | No | ACTIVE, DISCONNECTED, EXPIRED |
| DISCONNECTED | No | (terminal -- new ceremony needed) |
| REJECTED | No | (terminal -- new proposal needed) |
| EXPIRED | No | ACTIVE, DISCONNECTED |

### Trust Levels Summary

| Level | Code | Auto-Approve? | System Auto? |
|-------|------|--------------|--------------|
| 0 | `open` | Never | No |
| 1 | `verified` | Never | Yes |
| 2 | `trusted` | Configurable | Yes |

### Mandatory Human Approvals

- New connection (both sides)
- First transfer (receiver)
- Worker pattern integration (receiver)
- Trust upgrade (upgrading operator)
- Reconnection after disconnect (both sides)

### File Locations

| File | Purpose |
|------|---------|
| `config/world.yaml` | Connection records, trust levels, transport config |
| `config/manifest.yaml` | Local manifest + redaction rules |
| `workspace/world/peers/{owner}/manifest.yaml` | Cached peer manifest |
| `workspace/world/peers/{owner}/` | Peer-specific cached data |
| `workspace/world/transfers/{date}.yaml` | Transfer and connection event log |
| `workspace/world/inbox/{owner}/{type}/` | Incoming transfers staged for review |
| `workspace/world/quarantine/{owner}/` | Held transfers (suspended connection) |

---

*End of Peering Ceremony & Connection Model.*

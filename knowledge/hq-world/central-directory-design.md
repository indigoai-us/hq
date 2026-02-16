# Central Directory Design

**Version:** 1.0-draft
**Date:** 2026-02-16
**Status:** Design (future-proofing -- not for implementation in v1)
**Authors:** stefan/architect
**Companion to:** [World Protocol Spec](world-protocol-spec.md), [Manifest Schema](manifest-schema.md), [Peering Ceremony](peering-ceremony.md)

---

## Table of Contents

1. [Overview](#1-overview)
2. [Design Thesis](#2-design-thesis)
3. [Directory as Super-Peer](#3-directory-as-super-peer)
4. [Registration Protocol](#4-registration-protocol)
5. [Query Protocol](#5-query-protocol)
6. [Trust Model](#6-trust-model)
7. [Multiple Directories](#7-multiple-directories)
8. [Protocol Compatibility Proof](#8-protocol-compatibility-proof)
9. [Directory Operator Responsibilities](#9-directory-operator-responsibilities)
10. [End-to-End Scenarios](#10-end-to-end-scenarios)
11. [Anti-Patterns & Constraints](#11-anti-patterns--constraints)
12. [Future Considerations](#12-future-considerations)
- [Appendix A: Directory Manifest Extension](#appendix-a-directory-manifest-extension)
- [Appendix B: Query Message Schema](#appendix-b-query-message-schema)
- [Appendix C: Quick Reference](#appendix-c-quick-reference)

---

## 1. Overview

### 1.1 Purpose

This document describes how a central directory can overlay the HQ World's peer-to-peer topology without requiring any changes to the World Protocol. The directory is a **future-proofing design** -- it proves the protocol is clean enough that centralized discovery falls out naturally from the existing primitives.

The core insight: **a directory is just another peer that happens to collect and index manifests.** It uses the same peering ceremony, the same manifest format, the same transfer envelope, and the same trust model as every other HQ instance. The directory is not a protocol-level concept -- it is an application-level behavior exhibited by a particular kind of peer.

### 1.2 What This Document Is Not

This is not an implementation plan. We are not building a directory in v1. This document exists to:

1. **Validate the protocol design.** If a directory requires protocol changes, the protocol is not clean enough.
2. **Guide future implementation.** When the time comes to build a directory, this design provides the blueprint.
3. **Prevent premature centralization.** By designing the directory as a peer, we ensure the P2P foundation is never compromised.

### 1.3 The Problem a Directory Solves

In a pure P2P world, discovery is out-of-band. Stefan connects to Alex because they know each other from Slack. Maria connects to Stefan because they met at a conference. Discovery happens through human social networks -- conversations, introductions, shared workspaces.

This works at small scale. At larger scale, it becomes a bottleneck:

- **Discoverability.** An HQ operator with excellent testing knowledge has no way to be found by operators who need testing knowledge, unless they already know each other.
- **Cold starts.** A new HQ operator has no peers. They must find potential peers through entirely out-of-band means.
- **Community formation.** Groups of HQ operators working in the same domain (e.g., healthcare AI, e-commerce infrastructure) have no structured way to find each other.

A directory solves these problems by acting as a well-known peer that aggregates manifests and answers capability queries. It is the town square where business cards are posted on a bulletin board.

### 1.4 Relationship to Other Documents

| Document | What It Provides | How This Document Uses It |
|----------|-----------------|--------------------------|
| [World Protocol Spec](world-protocol-spec.md) | Protocol overview, Section 4.4 (Central Directory Overlay) | This document expands Section 4.4 into a full design. |
| [Manifest Schema](manifest-schema.md) | Manifest format and auto-generation | Directories index manifests in this exact format. |
| [Peering Ceremony](peering-ceremony.md) | Connection lifecycle | Directories connect to HQ instances using the standard ceremony. |
| [Transfer Protocol](transfer-protocol.md) | Transfer envelope and types | Directory queries use the existing transfer envelope. |

---

## 2. Design Thesis

### 2.1 A Directory Is a Peer

A directory is an HQ instance. It has an identity. It has a manifest. It connects to other HQ instances through the standard peering ceremony. It sends and receives transfers using the standard envelope format. From the perspective of the World Protocol, it is indistinguishable from any other peer.

What makes it a directory is not protocol-level special treatment. It is behavior:

| Regular Peer | Directory Peer |
|-------------|---------------|
| Connects to a few collaborators | Connects to many HQ instances willing to register |
| Caches peer manifests for its own use | Indexes peer manifests and makes them searchable |
| Answers capability queries about its own workers | Answers capability queries about all registered peers |
| Shares its own knowledge and worker patterns | Introduces peers to each other (but shares nothing of its own) |

The directory is a **super-peer** -- a peer with a particular purpose and scale, not a peer with special protocol privileges.

### 2.2 The Directory Does Not Vouch

A directory introduces peers. It does not vouch for them.

When Stefan queries a directory and discovers that Maria's HQ has design capabilities, the directory is saying: "Maria registered with me and her manifest says she has design workers." The directory is not saying: "I have verified Maria's capabilities" or "I trust Maria" or "You should connect to Maria."

Trust is always bilateral. Stefan decides whether to trust Maria based on his own evaluation -- the peering ceremony, the manifest exchange, out-of-band verification. The directory facilitates the introduction; the trust decision belongs to the operators.

This is the distinction between a **matchmaker** and a **guarantor**. The directory is the former, never the latter.

### 2.3 The Directory Is Additive

Adding a directory to the World requires zero protocol changes:

| Protocol Element | Used By Directory? | Changed? |
|-----------------|-------------------|---------|
| HQ Identity Model | Yes -- the directory has its own identity | No change |
| Manifest Schema | Yes -- the directory has its own manifest | No change |
| Peering Ceremony | Yes -- HQ instances connect to the directory via standard ceremony | No change |
| Transfer Envelope | Yes -- queries and responses use the standard envelope | No change |
| Trust Levels | Yes -- operators set trust levels for the directory peer | No change |
| Connection State Machine | Yes -- standard lifecycle applies | No change |
| Transport Abstraction | Yes -- directory uses whatever transport is configured | No change |

The directory is purely additive infrastructure. If all directories disappear, the P2P world continues to function. Existing peer connections are unaffected. The directory is a convenience layer, not a dependency.

---

## 3. Directory as Super-Peer

### 3.1 Directory Identity

A directory is an HQ instance with a manifest that identifies it as a directory through its capabilities and metadata:

```yaml
identity:
  owner: hq-directory-oss
  instance-id: hq-directory-oss-primary
  display-name: "HQ Open Source Directory"
  world-version: v1
  description: |
    Community directory for HQ instances in the open-source ecosystem.
    Register to be discoverable by other HQ operators.
```

The `owner` name follows the same format as any HQ instance. There is no special naming convention required, though descriptive names (e.g., `hq-directory-oss`, `acme-corp-directory`) are recommended.

### 3.2 Directory Manifest

A directory's manifest describes its purpose through the standard manifest fields:

```yaml
# config/manifest.yaml — a directory instance

identity:
  owner: hq-directory-oss
  instance-id: hq-directory-oss-primary
  display-name: "HQ Open Source Directory"
  world-version: v1
  description: |
    Community directory for open-source HQ instances.
    Register to make your capabilities discoverable.

capabilities:
  worker-count: 3
  public-worker-count: 3
  workers:
    - id: directory-indexer
      type: OpsWorker
      description: "Indexes registered HQ manifests for capability search"
      skills:
        - manifest-indexing
        - capability-search
      visibility: public

    - id: directory-query-responder
      type: OpsWorker
      description: "Responds to capability queries from connected peers"
      skills:
        - capability-query
        - peer-discovery
      visibility: public

    - id: directory-admin
      type: OpsWorker
      description: "Manages directory registrations, deregistrations, and health"
      skills:
        - registration-management
        - health-monitoring
      visibility: public

knowledge:
  domain-count: 2
  public-domain-count: 2
  domains:
    - id: hq-world
      label: "HQ World Protocol"
      description: "Directory operations, registration, query processing"
      depth: deep
      source: manual

    - id: directory-operations
      label: "Directory Operations"
      description: "Manifest indexing, capability search, peer introduction"
      depth: deep
      source: manual

connection:
  preferred-transport: file
  preferred-trust-level: open
  accepting-connections: true
  manifest-refresh-interval: 1d
  collaboration-interests:
    - "HQ instance registration and discovery"
    - "Capability-based peer matching"
    - "Open-source community building"

metadata:
  generated-at: "2026-02-16T12:00:00Z"
  hq-version: "4.0"
  tags:
    - directory
    - discovery
    - community
    - open-source
```

**Key observations:**

- The directory's `accepting-connections: true` signals it is open for registration.
- The `preferred-trust-level: open` signals that it accepts connections at minimal trust -- appropriate since the directory is a public service, not a trusted collaborator.
- The `collaboration-interests` describe the directory's purpose.
- The `tags` include `directory`, which is a conventional (not protocol-enforced) signal that this is a directory instance.
- The `manifest-refresh-interval: 1d` is shorter than the default 7 days, reflecting the directory's need for current data.

### 3.3 How a Directory Differs from a Regular Peer

| Aspect | Regular Peer | Directory Peer |
|--------|-------------|---------------|
| **Purpose** | Collaboration, data exchange | Discovery, peer introduction |
| **Connection count** | Few (2-20 peers) | Many (potentially hundreds) |
| **Manifest usage** | Cached for capability queries on known peers | Indexed and searchable across all registered peers |
| **Transfer types used** | Knowledge, worker-pattern, context, system | Primarily system (queries, manifest refresh); does not initiate knowledge/worker transfers |
| **Trust level offered** | Varies per peer | Typically offers Open (Level 0) to all |
| **Data shared** | Knowledge files, worker patterns, context | Query results (manifest excerpts) |
| **Connection preferences** | Selective | Open to all registrants |

### 3.4 What the Directory Stores

A directory maintains an index of all registered peers' manifests. This is an internal implementation detail -- the protocol does not specify how the directory stores its data. Conceptually, the directory maintains:

```
workspace/world/peers/
  stefan/manifest.yaml        # Stefan's cached manifest
  alex/manifest.yaml          # Alex's cached manifest
  maria/manifest.yaml         # Maria's cached manifest
  jordan/manifest.yaml        # Jordan's cached manifest
  ... (all registered peers)
```

This is identical to how any peer caches connected peers' manifests. The directory simply has more of them and indexes them for search.

---

## 4. Registration Protocol

### 4.1 Registration Is Peering

Registering with a directory is establishing a peer connection. The standard peering ceremony applies:

```
HQ Operator                          Directory Operator
     |                                      |
     |  Step 1: Send connection proposal    |
     |  --------------------------------->  |
     |                                      |
     |  Step 2: Directory acknowledges      |
     |  <---------------------------------  |
     |                                      |
     |  Step 3: Manifest exchange           |
     |  <-------------------------------->  |
     |                                      |
     |  Step 4: Trust negotiation           |
     |  (typically: open for both sides)    |
     |                                      |
     |  Step 5: Mutual approval             |
     |  <-------------------------------->  |
     |                                      |
     |  Step 6: Connection active           |
     |  (= registration complete)           |
     |                                      |
```

**There is no special registration message.** The peering ceremony IS the registration. When the connection becomes active, the HQ is registered -- its manifest is in the directory's peer cache and available for queries.

### 4.2 Registration Proposal

An HQ operator registers with a directory by sending a standard connection proposal:

```yaml
proposal:
  id: prop-d1r3c70r
  version: v1
  from:
    owner: stefan
    instance-id: stefan-hq-primary
    display-name: "Stefan's HQ"
    world-version: v1
  to:
    owner: hq-directory-oss
  message: |
    Registering my HQ with the open-source community directory.
    My instance has architecture, frontend, QA, and content workers.
    Knowledge domains include testing, web development, and AI security.
  preferences:
    proposed-trust-level: open
    proposed-transport: file
    collaboration-interests:
      - "Community discovery"
      - "Capability matching"
  proposed-at: "2026-02-16T10:00:00Z"
  expires-at: "2026-03-02T10:00:00Z"
  include-manifest: true
```

The proposal is identical to any other connection proposal. The `include-manifest: true` flag is recommended for directory registration since the directory needs the manifest to index the HQ's capabilities.

### 4.3 Directory Acceptance Policy

The directory operator defines their own acceptance policy. This is a human decision, not a protocol requirement. Common policies:

| Policy | Description | Use Case |
|--------|-------------|----------|
| **Open** | Accept all valid proposals | Public community directory |
| **Verified** | Accept proposals from operators with verified identity | Company-internal directory |
| **Invite-only** | Accept only proposals from pre-approved operators | Private consortium |
| **Domain-specific** | Accept proposals from operators in a specific domain | Industry-specific directory |

The directory operator may automate proposal acceptance (since the directory's role is discovery, not collaboration), but this is an implementation choice, not a protocol requirement. Even with automation, the peering ceremony steps are followed -- the automation just makes the human approval step instant.

### 4.4 Manifest as Registration Data

The HQ's manifest IS its registration data. There is no separate registration form, profile, or metadata to fill out. Whatever the manifest reveals is what the directory indexes.

This means:

- **Privacy controls apply.** Redacted workers and domains are not indexed. The operator controls exactly what the directory sees through the same redaction mechanism used for any peer (see [Manifest Schema, Section 9](manifest-schema.md#9-privacy--redaction)).
- **Freshness matters.** The directory uses the manifest as provided. Stale manifests lead to stale directory listings. Operators should refresh their manifests regularly (and the directory's short `manifest-refresh-interval` encourages this).
- **No extra metadata.** The directory does not ask for anything beyond the manifest. If the manifest format evolves (new optional fields), the directory benefits automatically.

### 4.5 Deregistration

Deregistering from a directory is disconnecting from it. The standard disconnection process applies (see [Peering Ceremony, Section 12](peering-ceremony.md#12-disconnection)):

1. Operator sets the directory connection to `disconnected`.
2. Optionally sends a disconnect notification.
3. Directory removes the operator's manifest from its index.
4. The operator's HQ is no longer discoverable through that directory.

**Unilateral deregistration:** The operator can deregister at any time without the directory's consent. The directory will eventually notice (failed health check or manifest refresh) and clean up its index.

**Directory-initiated removal:** The directory operator can also disconnect a registered HQ (e.g., for policy violations). This follows the standard unilateral disconnection flow -- the directory sets the connection to `disconnected` and removes the manifest from the index.

### 4.6 Registration Does Not Create a Trust Relationship

Registering with a directory means the directory has your manifest. It does not mean:

- The directory trusts you.
- You trust the directory.
- Other peers registered with the same directory trust you.
- The directory will vouch for you to other peers.

The connection between an HQ and a directory is typically at Trust Level 0 (Open). The directory is a bulletin board, not a credit bureau.

---

## 5. Query Protocol

### 5.1 Queries as System Transfers

Directory queries use the existing `system` transfer type with new sub-types. This is explicitly allowed by the protocol's versioning rules: "Adding a new system sub-type: No version bump. Old receivers ignore unknown sub-types." (See [World Protocol Spec, Section 11.2](world-protocol-spec.md#112-compatibility-rules)).

The query protocol introduces two new system sub-types:

| Sub-type | Direction | Description |
|----------|-----------|-------------|
| `directory-query` | HQ -> Directory | A capability search request |
| `directory-result` | Directory -> HQ | Search results |

### 5.2 Query Envelope

A query is a standard transfer envelope with `type: system`:

```yaml
envelope:
  id: txfr-query-001
  type: system
  from: stefan
  to: hq-directory-oss
  timestamp: "2026-02-16T14:00:00Z"
  version: v1
  description: "Capability query — looking for Playwright testing expertise"
  payload-hash: sha256:abc123...
  payload-size: 256
  transport: file
```

The payload contains the query:

```yaml
system:
  sub-type: directory-query
  query:
    # What to search for (at least one field required)
    capability: "playwright"           # Skill or capability keyword
    knowledge-domain: "testing"        # Knowledge domain ID
    worker-type: "CodeWorker"          # Worker type filter
    tags: ["e2e", "testing"]           # Manifest tag filter

    # How to return results
    max-results: 10                    # Maximum number of matches
    include-manifest-excerpt: true     # Include relevant manifest sections

  # Metadata
  query-id: qry-a1b2c3d4              # Unique query ID for correlation
```

### 5.3 Query Fields

| Field | Required | Format | Description |
|-------|----------|--------|-------------|
| `capability` | No | String (max 128 chars) | Free-text search across worker skills, descriptions, and names. Matches against skill tags and description text. |
| `knowledge-domain` | No | Domain ID | Exact match against knowledge domain IDs in registered manifests. |
| `worker-type` | No | Worker type enum | Filter by worker type (`CodeWorker`, `ContentWorker`, etc.). |
| `tags` | No | List of strings | Filter by manifest-level tags. All specified tags must match (AND logic). |
| `max-results` | No | Integer (default: 10, max: 50) | Maximum number of matching HQ instances to return. |
| `include-manifest-excerpt` | No | Boolean (default: true) | Whether to include relevant sections of matching manifests in the response. |
| `query-id` | Yes | `qry-{8-hex-chars}` | Unique query identifier for request/response correlation. |

**At least one search field (`capability`, `knowledge-domain`, `worker-type`, or `tags`) is required.** Fields can be combined for more specific queries (AND logic across fields).

### 5.4 Query Examples

**Search by capability:**

```yaml
query:
  capability: "playwright"
  query-id: qry-e2e00001
```

Finds HQ instances with workers whose skills or descriptions mention "playwright."

**Search by knowledge domain:**

```yaml
query:
  knowledge-domain: "ai-security"
  query-id: qry-sec00001
```

Finds HQ instances with a knowledge domain matching `ai-security`.

**Search by worker type and capability:**

```yaml
query:
  worker-type: "CodeWorker"
  capability: "infrastructure"
  query-id: qry-inf00001
```

Finds HQ instances with CodeWorkers skilled in infrastructure.

**Search by tags:**

```yaml
query:
  tags: ["fullstack", "typescript"]
  query-id: qry-tag00001
```

Finds HQ instances whose manifest tags include both `fullstack` and `typescript`.

**Combined search:**

```yaml
query:
  capability: "e2e-testing"
  knowledge-domain: "testing"
  worker-type: "CodeWorker"
  tags: ["playwright"]
  max-results: 5
  query-id: qry-cmb00001
```

Finds CodeWorkers with e2e-testing skills in HQ instances that have deep testing knowledge and are tagged with "playwright."

### 5.5 Query Results

The directory responds with a `directory-result` system transfer:

```yaml
envelope:
  id: txfr-result-001
  type: system
  from: hq-directory-oss
  to: stefan
  timestamp: "2026-02-16T14:05:00Z"
  version: v1
  description: "Query results — 3 matches for 'playwright' capability"
  payload-hash: sha256:def456...
  payload-size: 2048
  transport: file
```

Payload:

```yaml
system:
  sub-type: directory-result
  query-id: qry-e2e00001                  # Correlates to the original query
  result-count: 3                          # Number of matches
  total-registered: 47                     # Total HQs in the directory

  results:
    - owner: maria
      display-name: "Maria's HQ"
      relevance: high                       # high | medium | low
      match-reason: "Worker 'qa-engineer' has skill 'playwright'"
      accepting-connections: true
      excerpt:
        capabilities:
          workers:
            - id: qa-engineer
              type: CodeWorker
              description: "E2E testing, Playwright, test infrastructure"
              skills:
                - playwright
                - e2e-testing
                - test-infrastructure
        knowledge:
          domains:
            - id: testing
              label: "Testing & QA"
              depth: deep

    - owner: jordan
      display-name: "Jordan's HQ"
      relevance: medium
      match-reason: "Worker 'fullstack-dev' has skill 'playwright'"
      accepting-connections: true
      excerpt:
        capabilities:
          workers:
            - id: fullstack-dev
              type: CodeWorker
              description: "Full-stack development with testing focus"
              skills:
                - playwright
                - react
                - nodejs

    - owner: taylor
      display-name: "Taylor's HQ"
      relevance: low
      match-reason: "Knowledge domain 'testing' mentions Playwright"
      accepting-connections: false
      excerpt:
        knowledge:
          domains:
            - id: testing
              label: "Testing"
              depth: moderate
```

### 5.6 Result Fields

| Field | Required | Format | Description |
|-------|----------|--------|-------------|
| `query-id` | Yes | Query ID | Correlates the result to the original query. |
| `result-count` | Yes | Integer | Number of matching HQ instances in this response. |
| `total-registered` | Yes | Integer | Total HQ instances registered with this directory. Gives context for result density. |
| `results` | Yes | List of result entries | The matching HQ instances. |
| `results[].owner` | Yes | Owner name | The matched HQ's owner. |
| `results[].display-name` | No | String | The matched HQ's display name. |
| `results[].relevance` | Yes | `high` / `medium` / `low` | How well the match fits the query. |
| `results[].match-reason` | Yes | String | Human-readable explanation of why this HQ matched. |
| `results[].accepting-connections` | Yes | Boolean | Whether the matched HQ is currently accepting new connections. |
| `results[].excerpt` | No | Manifest excerpt | Relevant portions of the matched HQ's manifest. Only included if `include-manifest-excerpt: true` in the query. |

### 5.7 What the Directory Reveals

The query result contains **only information from the matched HQ's manifest**. Manifests are explicitly designed as public-facing business cards (see [Manifest Schema, Section 1.2](manifest-schema.md#12-what-the-manifest-is-not)). The directory does not reveal:

- Redacted workers or domains (they are not in the manifest)
- Connection history or transfer logs
- Trust levels between the directory and the matched HQ
- Other queries the matched HQ has made
- How many other HQs are connected to the matched HQ

The directory is a **search engine over public manifests**, not an intelligence service.

### 5.8 Query Rate Limiting

The directory operator may implement rate limiting on queries. This is an operational decision, not a protocol requirement. Excessive queries can be throttled or rejected:

```yaml
system:
  sub-type: directory-result
  query-id: qry-flood001
  error: ERR_QUERY_RATE_LIMITED
  message: "Query rate limit exceeded. Try again in 60 seconds."
  result-count: 0
  total-registered: 47
  results: []
```

The `ERR_QUERY_RATE_LIMITED` error follows the protocol's error code convention (new error codes do not require a version bump).

---

## 6. Trust Model

### 6.1 Directory Trust is Minimal

The trust relationship between an HQ and a directory is fundamentally different from the trust relationship between two collaborating peers:

| Collaborating Peers | HQ <-> Directory |
|--------------------|------------------|
| Exchange knowledge, worker patterns, context | Exchange manifests and queries |
| Trust governs what data flows | Trust governs only visibility (who can register, who can query) |
| Trust typically escalates over time | Trust typically stays at Open (Level 0) |
| High-value relationship | Utility relationship |

For most directory interactions, Trust Level 0 (Open) is sufficient and appropriate. The directory does not need to trust the HQ's content (it only indexes the manifest), and the HQ does not need to trust the directory's judgment (it only receives introductions).

### 6.2 The Introduction Model

When Stefan queries the directory and discovers Maria, the directory has performed an **introduction**. The introduction workflow:

```
     Stefan                Directory              Maria
       |                      |                      |
       |  Query: "playwright" |                      |
       |  ------------------> |                      |
       |                      |                      |
       |  Result: Maria has   |                      |
       |  playwright skills   |                      |
       |  <------------------ |                      |
       |                      |                      |
       |  (Directory's job is done)                   |
       |                      |                      |
       |  Standard peering ceremony begins            |
       |  -----------------------------------------> |
       |                                              |
       |  Manifest exchange, trust negotiation,       |
       |  human approval — ALL bilateral, between     |
       |  Stefan and Maria. Directory not involved.   |
       |  <----------------------------------------> |
```

After the introduction:

- The directory is not a party to the Stefan-Maria connection.
- The directory does not know whether Stefan contacted Maria.
- The directory does not know whether Stefan and Maria connected.
- Stefan's trust of Maria is based on his own evaluation, not the directory's endorsement.
- Maria's trust of Stefan is based on her own evaluation.

**The directory introduces. It does not vouch, endorse, recommend, or guarantee.**

### 6.3 What the Directory Cannot Do

The following actions are impossible for a directory within the World Protocol:

| Action | Why It Cannot Happen |
|--------|---------------------|
| Force a connection between two HQs | Connections require bilateral human approval. The directory is not a party. |
| Access a registered HQ's knowledge files | The manifest does not contain knowledge content. Knowledge transfers require an active connection and operator approval. |
| Read a registered HQ's worker instructions | Manifests contain skill tags and descriptions, not internal instructions. |
| Modify a registered HQ's trust levels | Trust is local and unilateral. Each operator manages their own. |
| Revoke a connection between two peers | Only the connected operators can disconnect. |
| Monitor transfers between connected peers | Transfers are direct between peers. The directory is not in the data path. |
| Override an operator's redaction choices | Redacted workers/domains never reach the manifest, so the directory never sees them. |

These constraints are not policy -- they are structural properties of the protocol. The directory cannot do these things because the protocol does not provide mechanisms for them.

### 6.4 Trust Level Guidance for Directory Connections

| Actor | Recommended Trust Level | Rationale |
|-------|------------------------|-----------|
| HQ operator -> Directory | Open (Level 0) | The directory only receives your manifest (which is public-facing by design) and sends query results. No sensitive data flows. |
| Directory -> Registered HQ | Open (Level 0) | The directory processes manifests and responds to queries. It does not need elevated trust. |

Trust Level 1 (Verified) may be appropriate for private directories where the directory operator wants to verify the identity of registrants before indexing them.

Trust Level 2 (Trusted) is almost never appropriate for directory connections. The directory relationship is utility, not collaboration.

### 6.5 Directory Reputation

The protocol does not include a directory reputation system. In v1, directory quality is evaluated informally:

- **Freshness.** Does the directory's index reflect current manifests? Are registered HQs active?
- **Coverage.** How many HQs are registered? Is the directory useful for the operator's domain?
- **Responsiveness.** Does the directory respond to queries promptly?
- **Policy transparency.** Does the directory operator publish their acceptance and removal policies?

Future versions may introduce a directory quality signal, but v1 relies on operator judgment -- consistent with the protocol's philosophy that humans make trust decisions.

---

## 7. Multiple Directories

### 7.1 An HQ Can Register with Multiple Directories

There is no protocol limit on how many directories an HQ can register with. Each directory connection is an independent peer connection in `config/world.yaml`:

```yaml
connections:
  # Regular peer connections
  - peer: alex
    status: active
    trust-level: verified
    transport: file
    # ...

  - peer: maria
    status: active
    trust-level: trusted
    transport: file
    # ...

  # Directory connections
  - peer: hq-directory-oss
    status: active
    trust-level: open
    transport: file
    proposal-id: prop-d1r3c70r
    connected-at: "2026-02-16T11:00:00Z"
    notes: "Open-source community directory"

  - peer: acme-corp-directory
    status: active
    trust-level: verified
    transport: http
    proposal-id: prop-c0rp0001
    connected-at: "2026-02-20T09:00:00Z"
    notes: "Company-internal directory"

  - peer: healthcare-ai-directory
    status: active
    trust-level: open
    transport: file
    proposal-id: prop-h3a1th01
    connected-at: "2026-03-01T14:00:00Z"
    notes: "Healthcare AI community directory"
```

### 7.2 Why Multiple Directories

Different directories serve different communities:

| Directory Type | Example | Audience |
|---------------|---------|----------|
| **Public community** | `hq-directory-oss` | All HQ operators in the open-source ecosystem |
| **Company-internal** | `acme-corp-directory` | HQ instances within a company |
| **Industry-specific** | `healthcare-ai-directory` | HQ operators working in healthcare AI |
| **Regional** | `hq-directory-eu` | HQ operators in a geographic region |
| **Skill-specific** | `testing-guild-directory` | HQ operators focused on testing expertise |

An HQ operator chooses which directories to register with based on which communities they want to be discoverable in.

### 7.3 Directories Are Independent

Directories do not need to know about each other. There is no directory federation, no cross-directory search, no directory hierarchy. Each directory is an independent peer with its own index.

```
                    ┌──────────────┐
                    │ hq-directory │
                    │    -oss      │
                    └──┬───┬───┬──┘
                       │   │   │
            ┌──────────┘   │   └──────────┐
            │              │              │
       ┌────┴────┐   ┌────┴────┐   ┌────┴────┐
       │ Stefan  │   │  Alex   │   │  Maria  │
       │   HQ    │   │   HQ    │   │   HQ    │
       └────┬────┘   └─────────┘   └────┬────┘
            │                           │
            └──────────┐   ┌────────────┘
                       │   │
                    ┌──┴───┴──┐
                    │ acme-   │
                    │ corp-   │
                    │directory│
                    └─────────┘

  Stefan and Maria are registered with both directories.
  Alex is registered only with the OSS directory.
  The directories are independent — neither knows about the other.
```

### 7.4 Query Aggregation

When an HQ operator queries multiple directories, they send separate queries to each and aggregate the results locally. The protocol does not provide a multi-directory query mechanism -- each query is a standard point-to-point system transfer.

```
Stefan's HQ:
  1. Send query to hq-directory-oss      -> Results A
  2. Send query to acme-corp-directory   -> Results B
  3. Merge Results A + B locally
  4. Deduplicate (if the same HQ appears in both)
  5. Present unified results to operator
```

Deduplication uses the `owner` field -- if the same owner appears in results from multiple directories, the results are merged. The more recent manifest excerpt takes precedence.

### 7.5 Manifest Consistency Across Directories

An HQ registered with multiple directories sends the same manifest to all of them. The manifest is generated from the same source files (see [Manifest Schema, Section 8](manifest-schema.md#8-auto-generation)), so it is inherently consistent.

However, refresh timing may cause temporary inconsistency. If Stefan updates his manifest and refreshes with directory A but has not yet refreshed with directory B, the two directories may have slightly different versions. This is acceptable -- the `generated-at` timestamp in the manifest allows queryors to assess freshness.

---

## 8. Protocol Compatibility Proof

This section proves that every aspect of the directory design uses existing protocol primitives with no modifications.

### 8.1 Identity: No Change

A directory uses a standard HQ identity:

```yaml
identity:
  owner: hq-directory-oss          # Standard owner format
  instance-id: hq-dir-oss-primary  # Standard instance-id format
  display-name: "HQ OSS Directory" # Standard display-name
  world-version: v1                # Standard version
```

Every field follows the World Protocol Spec, Section 3. No new identity fields are needed.

### 8.2 Manifest: No Change

A directory's manifest follows the standard manifest schema ([Manifest Schema](manifest-schema.md)). It happens to describe directory-specific workers (indexer, query-responder), but the schema is unchanged. The `tags: ["directory"]` convention is informational, not structural.

### 8.3 Peering Ceremony: No Change

Registration uses the standard 7-step peering ceremony ([Peering Ceremony](peering-ceremony.md)). The proposal format, manifest exchange, trust negotiation, and approval gates are all unchanged. The directory operator may automate their approval step (common for public directories), but this is an implementation choice within the existing ceremony framework.

### 8.4 Transfer Envelope: No Change

Queries and results use the standard transfer envelope ([Transfer Protocol](transfer-protocol.md)):

- `type: system` -- existing transfer type.
- `sub-type: directory-query` / `directory-result` -- new sub-types, which are explicitly allowed without a version bump per the protocol's compatibility rules.

### 8.5 Trust Model: No Change

Directory connections use the standard trust levels (Open, Verified, Trusted). No new trust levels, no new trust semantics. The recommendation to use Open (Level 0) for directories is guidance, not a protocol change.

### 8.6 Connection Lifecycle: No Change

Directory connections follow the standard state machine: PROPOSED -> PENDING -> ACTIVE -> (SUSPENDED | DISCONNECTED | EXPIRED). No new states, no new transitions.

### 8.7 Transport: No Change

Directories use whatever transport is configured -- file, git, HTTP, HIAMP. No new transports are needed, though a directory is a natural candidate for HTTP transport (future) since it serves many clients.

### 8.8 Error Handling: No Change

Directory-specific errors (e.g., `ERR_QUERY_RATE_LIMITED`) follow the existing error code convention. New error codes are allowed without a version bump.

### 8.9 Summary

| Protocol Element | Change Required | Explanation |
|-----------------|----------------|-------------|
| Identity | None | Standard identity fields |
| Manifest | None | Standard schema, directory-specific content |
| Peering Ceremony | None | Standard ceremony for registration |
| Transfer Envelope | None | `type: system` with new sub-types (allowed) |
| Trust Model | None | Standard levels, Open recommended for directories |
| Connection Lifecycle | None | Standard state machine |
| Transport | None | Standard transports |
| Error Handling | None | New error codes follow existing convention |
| Versioning | None | New sub-types do not require version bump |

**Zero protocol changes.** The directory is purely additive.

---

## 9. Directory Operator Responsibilities

### 9.1 The Directory Operator Is a Human

A directory is an HQ instance, and HQ instances have human operators. The directory operator is the person who:

- Decides the directory's acceptance policy (who can register).
- Manages the directory's peer connections.
- Monitors the directory's health and performance.
- Handles abuse and policy violations.
- Decides when to remove a registered HQ.

The directory may automate many of these tasks (e.g., auto-accepting proposals, auto-processing queries), but the operator retains ultimate control -- consistent with the protocol's sovereignty principle.

### 9.2 Operational Duties

| Duty | Description | Frequency |
|------|-------------|-----------|
| **Index maintenance** | Ensure the manifest index is current. Remove stale entries (HQs that have not refreshed their manifest beyond a threshold). | Daily |
| **Health monitoring** | Periodically ping registered HQs. Flag unreachable instances. | Weekly |
| **Policy enforcement** | Remove HQs that violate the directory's terms (spam manifests, misleading capability claims). | As needed |
| **Query performance** | Ensure queries are answered promptly. Scale infrastructure as registration count grows. | Ongoing |
| **Transparency** | Publish the directory's acceptance policy, removal criteria, and query handling rules. | At launch, updated as needed |

### 9.3 Directory Transparency

A well-operated directory should publish:

1. **Acceptance policy.** Who can register? Is it open, verified, or invite-only?
2. **Removal criteria.** Under what conditions will a registered HQ be removed?
3. **Data handling.** How long are manifests cached? Are query logs retained?
4. **Uptime commitment.** What availability does the directory target?
5. **Operator contact.** How to reach the directory operator for issues.

This information can be included in the directory's manifest `description` field or linked from it. The protocol does not enforce transparency -- it is a best practice for directory operators.

---

## 10. End-to-End Scenarios

### 10.1 Scenario: Registering with a Directory

**Context:** Stefan wants to make his HQ discoverable through the open-source community directory.

**Step 1: Stefan discovers the directory.**

Stefan learns about `hq-directory-oss` through a community forum post. The post includes the directory's manifest and connection instructions.

**Step 2: Stefan sends a connection proposal.**

```
> /run architect world connect hq-directory-oss
```

Stefan's HQ generates a proposal with `include-manifest: true` and sends it to the directory operator (via the contact method published in the forum post).

**Step 3: Directory processes the proposal.**

The directory operator (or their automated system) reviews the proposal, validates Stefan's manifest, and accepts the connection.

**Step 4: Connection active = registered.**

Stefan's manifest is now indexed by the directory. Other HQ operators can discover Stefan through capability queries.

```
> /run architect world peers

Connected Peers:
  1. alex (Alex's HQ)           — Trust: verified, active
  2. maria (Maria's HQ)         — Trust: trusted, active
  3. hq-directory-oss (HQ OSS)  — Trust: open, active  [DIRECTORY]
```

**Step 5: Stefan keeps his manifest fresh.**

Stefan's HQ refreshes its manifest with the directory every day (matching the directory's `manifest-refresh-interval: 1d`). When Stefan adds new workers or knowledge, the directory automatically gets the updated manifest on the next refresh cycle.

### 10.2 Scenario: Querying a Directory for Peers

**Context:** Stefan is starting a project that requires UI/UX design expertise. None of his current peers have design workers. He queries the community directory.

**Step 1: Stefan formulates the query.**

```
> /run architect world query --directory hq-directory-oss --capability design --knowledge-domain ux-patterns
```

Stefan's HQ creates a system transfer with sub-type `directory-query` and sends it to the directory.

**Step 2: Directory processes the query.**

The directory searches its manifest index for HQ instances with:
- Workers whose skills include "design"
- Knowledge domains matching "ux-patterns"

**Step 3: Stefan receives results.**

```
Directory Query Results (hq-directory-oss)
==========================================

Query: capability="design" + knowledge-domain="ux-patterns"
Matches: 2 of 47 registered HQs

1. maria (Maria's HQ)                        [RELEVANCE: HIGH]
   Match: Worker 'designer' has skills: design, figma, ux, prototyping
   Knowledge: "UX Patterns" (deep)
   Accepting connections: Yes

2. chen (Chen's HQ)                           [RELEVANCE: MEDIUM]
   Match: Worker 'product-designer' has skills: design, user-research
   Knowledge: "UX Patterns" (moderate)
   Accepting connections: Yes
```

**Step 4: Stefan decides to connect to Maria.**

Stefan reviews the excerpts. Maria's HQ looks like a strong match -- deep UX knowledge and a dedicated designer worker.

```
> /run architect world connect maria
```

Stefan initiates a standard peering ceremony with Maria. **The directory is not involved in this step.** Stefan and Maria complete the ceremony directly -- proposal, manifest exchange, trust negotiation, mutual approval.

**Step 5: Connection established.**

Stefan and Maria are now peers. They can exchange design knowledge, share worker patterns, and coordinate on projects. The directory's job was the introduction -- everything after that is between Stefan and Maria.

### 10.3 Scenario: Directory-Brokered Peering

**Context:** A company runs an internal directory. Two employees who have never met discover each other through the directory and connect.

**Step 1: Both employees register with the company directory.**

Alice (backend team, New York) and Bob (frontend team, London) both register their HQs with `acme-corp-directory`. The directory operator auto-accepts all proposals from employees with verified corporate identity.

**Step 2: Alice needs frontend expertise.**

```
> /run architect world query --directory acme-corp-directory --capability react --worker-type CodeWorker
```

Results show Bob's HQ has a frontend-dev worker with React skills.

**Step 3: Alice connects to Bob.**

Alice sends a connection proposal to Bob:

```yaml
proposal:
  id: prop-a11c3b0b
  version: v1
  from:
    owner: alice
    instance-id: alice-hq-acme
    display-name: "Alice's HQ"
    world-version: v1
  to:
    owner: bob
  message: |
    Hi Bob -- found you through the Acme directory. I'm on the backend
    team in New York. Working on the checkout redesign and need frontend
    coordination. Your React skills would be a great match.
  preferences:
    proposed-trust-level: verified
    proposed-transport: http
```

**Step 4: Bob reviews and accepts.**

Bob sees the proposal. He checks Alice's manifest (backend-dev, api-design, database skills). Looks relevant for the checkout project. He accepts.

**Step 5: Connection active.**

Alice and Bob are now peers. They can share knowledge, coordinate through context transfers, and eventually share worker patterns. The directory brokered the introduction; the relationship is theirs.

**Key point:** The directory never had access to Alice's or Bob's knowledge files, worker instructions, or project details. It only saw their manifests (business cards). The actual collaboration happens over a direct peer connection.

---

## 11. Anti-Patterns & Constraints

### 11.1 Things a Directory Must Not Do

| Anti-Pattern | Why It Is Wrong |
|-------------|----------------|
| **Act as a transfer relay** | Transfers are direct between peers. The directory is not in the data path. If Stefan wants to send knowledge to Maria, it goes Stefan -> Maria, not Stefan -> Directory -> Maria. |
| **Store knowledge content** | The directory indexes manifests (business cards). It never stores or caches knowledge files, worker instructions, or project context from registered HQs. |
| **Vouch for registered HQs** | The directory confirms "this HQ registered and provided this manifest." It does not confirm "this HQ is trustworthy" or "this manifest is accurate." |
| **Auto-connect peers** | The directory introduces. Connecting requires the standard peering ceremony with bilateral human approval. The directory cannot short-circuit this. |
| **Require registration for peering** | Registration with a directory is voluntary. Two HQ instances can peer directly without any directory involvement. The P2P foundation is always available. |
| **Charge for connections** | The directory does not intermediate connections, so it cannot gate them. It can gate registration (who gets indexed), but not peering. |
| **Retain deregistered manifests** | When an HQ deregisters, its manifest must be removed from the index. The directory may retain the connection record (audit log), but the manifest content must be purged. |

### 11.2 Single Point of Failure Mitigation

A directory is a centralized service. To mitigate single-point-of-failure risk:

- **Multiple directories.** HQ operators register with multiple directories. If one goes down, the others still function.
- **P2P fallback.** If all directories are unavailable, existing peer connections continue to work. Discovery reverts to out-of-band methods. The directory is a convenience, not a dependency.
- **Cached results.** HQ instances cache directory query results locally. If the directory is temporarily unavailable, recent results are still usable.
- **No lock-in.** Deregistering from a directory has no effect on existing peer connections. The directory cannot hold connections hostage.

### 11.3 Scalability Considerations

| Scale | Challenge | Mitigation |
|-------|-----------|------------|
| 10-50 HQs | Manageable manually | File-based transport works fine |
| 50-500 HQs | Index performance, query latency | HTTP transport, basic indexing |
| 500+ HQs | Full-text search, query routing | Dedicated search infrastructure, multiple sharded directories |

The protocol does not dictate directory implementation. A directory serving 10 HQs can use YAML files in a directory. A directory serving 1,000 HQs can use Elasticsearch. The query protocol is the same in both cases.

---

## 12. Future Considerations

### 12.1 Not in v1, but Designed For

| Feature | Description | Why Not v1 |
|---------|-------------|------------|
| **Directory federation** | Directories that synchronize registrations with each other | Adds complexity without clear demand at current scale |
| **Directory signing** | Directories cryptographically sign query results | Requires key infrastructure not yet defined |
| **Reputation scoring** | Directories track peer interaction quality and provide reputation signals | Risk of creating implicit trust hierarchies |
| **Sponsored listings** | Directories allow HQs to highlight certain capabilities | Business model concern, not protocol concern |
| **Real-time queries** | WebSocket or streaming query responses | Requires non-file transport maturity |
| **Cross-directory search** | Query multiple directories in a single request | Requires directory-to-directory protocol, complex |

### 12.2 Migration Path

When a directory is eventually implemented:

1. **No protocol upgrade.** Existing HQ instances can register with a directory without updating their protocol implementation.
2. **Existing connections unaffected.** Adding a directory connection does not change existing peer connections.
3. **Gradual adoption.** Operators register with directories at their own pace. There is no flag day, no migration deadline.
4. **Backward compatible.** HQ instances that choose not to use directories continue to function in the P2P world exactly as before.

---

## Appendix A: Directory Manifest Extension

A directory's manifest is a standard manifest. The following conventions (not schema changes) signal that an HQ instance is acting as a directory:

| Convention | How | Purpose |
|-----------|-----|---------|
| **Tag convention** | Include `directory` in `metadata.tags` | Allows programmatic identification |
| **Worker naming** | Name workers `directory-indexer`, `directory-query-responder` | Signals directory purpose in capability catalog |
| **Description** | Include "directory" or "discovery" in `identity.description` | Human-readable signal |
| **Connection preferences** | Set `accepting-connections: true` and `preferred-trust-level: open` | Signals the directory is open for registration |

These are conventions. The protocol does not define a "directory type" -- a directory is recognized by its behavior and self-description, not by a special field.

---

## Appendix B: Query Message Schema

```yaml
# directory-query payload schema
$schema: "https://json-schema.org/draft/2020-12/schema"
$id: "https://hq.dev/schemas/world-directory-query-v1.json"
title: "World Protocol Directory Query"
description: "Schema for directory capability queries"
type: object
required:
  - system
properties:
  system:
    type: object
    required:
      - sub-type
      - query
    properties:
      sub-type:
        type: string
        const: directory-query
      query:
        type: object
        required:
          - query-id
        properties:
          capability:
            type: string
            maxLength: 128
            description: "Free-text skill or capability search"
          knowledge-domain:
            type: string
            pattern: "^[a-z0-9][a-z0-9-]*[a-z0-9]$"
            maxLength: 64
            description: "Knowledge domain ID to match"
          worker-type:
            type: string
            enum: [CodeWorker, ContentWorker, SocialWorker, ResearchWorker, OpsWorker]
            description: "Worker type filter"
          tags:
            type: array
            items:
              type: string
              maxLength: 64
            description: "Manifest tag filter (AND logic)"
          max-results:
            type: integer
            minimum: 1
            maximum: 50
            default: 10
            description: "Maximum results to return"
          include-manifest-excerpt:
            type: boolean
            default: true
            description: "Include relevant manifest sections in results"
          query-id:
            type: string
            pattern: "^qry-[a-f0-9]{8}$"
            description: "Unique query identifier"
        # At least one search field required (enforced at application level)
```

```yaml
# directory-result payload schema
$schema: "https://json-schema.org/draft/2020-12/schema"
$id: "https://hq.dev/schemas/world-directory-result-v1.json"
title: "World Protocol Directory Result"
description: "Schema for directory query results"
type: object
required:
  - system
properties:
  system:
    type: object
    required:
      - sub-type
      - query-id
      - result-count
      - total-registered
      - results
    properties:
      sub-type:
        type: string
        const: directory-result
      query-id:
        type: string
        pattern: "^qry-[a-f0-9]{8}$"
        description: "Correlates to the original query"
      result-count:
        type: integer
        minimum: 0
        description: "Number of matches"
      total-registered:
        type: integer
        minimum: 0
        description: "Total HQs in the directory"
      error:
        type: string
        description: "Error code if query failed"
      message:
        type: string
        description: "Error message if query failed"
      results:
        type: array
        items:
          type: object
          required:
            - owner
            - relevance
            - match-reason
            - accepting-connections
          properties:
            owner:
              type: string
              pattern: "^[a-z0-9][a-z0-9-]*[a-z0-9]$"
            display-name:
              type: string
              maxLength: 128
            relevance:
              type: string
              enum: [high, medium, low]
            match-reason:
              type: string
              maxLength: 512
            accepting-connections:
              type: boolean
            excerpt:
              type: object
              description: "Relevant sections of the matched HQ's manifest"
```

---

## Appendix C: Quick Reference

### Directory Registration

| Step | Action | Protocol Element Used |
|------|--------|----------------------|
| 1 | HQ sends connection proposal to directory | Standard peering ceremony, Step 1 |
| 2 | Directory accepts proposal | Standard peering ceremony, Steps 2-5 |
| 3 | Connection active = registered | Standard connection activation |
| 4 | Manifest refreshed periodically | Standard system transfer (`manifest-refresh`) |
| 5 | Deregister by disconnecting | Standard disconnection |

### Directory Query Flow

| Step | Action | Protocol Element Used |
|------|--------|----------------------|
| 1 | HQ sends query to directory | System transfer (`directory-query`) |
| 2 | Directory searches manifest index | Internal operation (not protocol) |
| 3 | Directory sends results | System transfer (`directory-result`) |
| 4 | HQ reviews results | Local operation |
| 5 | HQ connects to discovered peer | Standard peering ceremony (direct, not through directory) |

### Trust Summary

| Actor | Trust Level | Rationale |
|-------|------------|-----------|
| HQ -> Directory | Open (0) | Utility relationship; only manifests exchanged |
| Directory -> HQ | Open (0) | Registration only; no sensitive data |
| HQ -> Discovered Peer | Per peering ceremony | Bilateral, based on direct evaluation |

### What the Directory Sees vs. Does Not See

| Sees (in manifest) | Does Not See |
|-------------------|-------------|
| Owner, instance-id | Worker instructions |
| Worker IDs, types, skills | Knowledge file contents |
| Knowledge domain labels | Project details |
| Connection preferences | Transfer history |
| Public metadata, tags | Other peer connections |

### Protocol Changes Required

**None.** The directory uses:
- Standard identity (Section 3 of World Protocol Spec)
- Standard manifest (Manifest Schema)
- Standard peering ceremony (Peering Ceremony)
- Standard transfer envelope with existing `system` type
- New `directory-query` and `directory-result` sub-types (allowed without version bump)
- Standard trust levels (Open recommended)
- Standard connection lifecycle

---

*End of Central Directory Design.*

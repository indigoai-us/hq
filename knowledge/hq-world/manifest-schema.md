# HQ Manifest Schema

**Version:** 1.0-draft
**Date:** 2026-02-16
**Status:** Draft
**Companion to:** [World Protocol Spec](world-protocol-spec.md)

---

## Table of Contents

1. [Overview](#1-overview)
2. [Manifest Structure](#2-manifest-structure)
3. [Identity Block](#3-identity-block)
4. [Capability Catalog](#4-capability-catalog)
5. [Knowledge Domains](#5-knowledge-domains)
6. [Connection Preferences](#6-connection-preferences)
7. [Public Metadata](#7-public-metadata)
8. [Auto-Generation](#8-auto-generation)
9. [Privacy & Redaction](#9-privacy--redaction)
10. [JSON Schema for Validation](#10-json-schema-for-validation)
11. [Manifest Lifecycle](#11-manifest-lifecycle)

---

## 1. Overview

### 1.1 What the Manifest Is

The HQ manifest is the **business card** of an HQ instance. It is a structured YAML document that describes who the HQ is, what it can do, and how it prefers to connect -- without revealing internal implementation details.

When two HQ instances begin the peering ceremony (see [World Protocol Spec, Section 5.2](world-protocol-spec.md#52-peering-ceremony)), they exchange manifests. The manifest gives each operator enough information to decide:

- **Do I want to connect to this HQ?** (identity, reputation)
- **What can this HQ offer me?** (capabilities, knowledge domains)
- **What does this HQ need from me?** (connection preferences, collaboration interests)

### 1.2 What the Manifest Is Not

The manifest is not a configuration file. It does not control HQ behavior. It is a **read-only projection** of an HQ instance's public-facing attributes, generated from internal configuration files (`agents.md`, `workers/registry.yaml`, `knowledge/`, `config/hiamp.yaml`).

The manifest does not contain:

- Worker internal instructions or prompts
- Knowledge file contents (only domain labels)
- Security credentials, tokens, or secrets
- Project details, workspace state, or audit logs
- Personal information beyond what the operator chooses to share

### 1.3 Design Goals

- **Generatable.** A manifest can be fully auto-generated from existing HQ files. No manual authoring required (though manual curation is supported).
- **YAML-native.** Consistent with HQ conventions (`registry.yaml`, `hiamp.yaml`, `worker.yaml`).
- **HIAMP-compatible.** Identity fields are a superset of HIAMP identity. If HIAMP is configured, the manifest identity MUST match.
- **Validatable.** A JSON Schema (Section 10) enables programmatic validation.
- **Privacy-respecting.** Workers and knowledge domains can be opted out. The operator controls exactly what is revealed.

---

## 2. Manifest Structure

The manifest is a YAML document with five top-level sections:

```yaml
# HQ Manifest — {display-name}
# Generated: {timestamp}
# World Protocol: v1

identity:
  # Who this HQ is (Section 3)

capabilities:
  # What this HQ can do — workers and their skills (Section 4)

knowledge:
  # What this HQ knows — knowledge domains (Section 5)

connection:
  # How this HQ prefers to connect (Section 6)

metadata:
  # Additional public information (Section 7)
```

All sections are required except `metadata`, which is optional. Empty sections (e.g., an HQ with no public workers) use an empty list or object as appropriate.

### 2.1 File Location

The manifest is stored at:

```
{HQ_ROOT}/config/manifest.yaml
```

When received from a peer, the manifest is cached at:

```
{HQ_ROOT}/workspace/world/peers/{owner}/manifest.yaml
```

### 2.2 Encoding

- File encoding: UTF-8
- YAML version: 1.2
- Maximum file size: 64 KB (manifests larger than this indicate a problem -- they should be concise)

---

## 3. Identity Block

The `identity` section identifies this HQ instance in the World. It extends the HIAMP identity model with World-specific fields.

```yaml
identity:
  owner: stefan                        # Required. Operator's unique name.
  instance-id: stefan-hq-primary       # Required. Globally unique instance ID.
  display-name: "Stefan's HQ"         # Optional. Human-readable label.
  world-version: v1                    # Required. World Protocol version.
  description: |                       # Optional. Brief description of this HQ.
    Personal OS for orchestrating work across companies,
    workers, and AI. Focused on web/fullstack development,
    AI/ML, and infrastructure.
```

### 3.1 Field Reference

| Field | Required | Format | Source | Description |
|-------|----------|--------|--------|-------------|
| `owner` | Yes | `[a-z0-9][a-z0-9-]*[a-z0-9]` (2-32 chars) | `agents.md` operator name, lowercased | The operator's unique name. Serves as the primary namespace in the World. |
| `instance-id` | Yes | `[a-z0-9][a-z0-9-]*[a-z0-9]` (2-64 chars) | `config/hiamp.yaml` or generated | Globally unique identifier for this HQ instance. |
| `display-name` | No | Free-form string (max 128 chars) | `agents.md` or `config/hiamp.yaml` | Human-readable label shown to peers. |
| `world-version` | Yes | `v{major}` | Constant `v1` | The World Protocol version this manifest conforms to. |
| `description` | No | Free-form string (max 512 chars) | `agents.md` focus areas or manual | A brief, human-readable description of this HQ instance. Helps peers understand the HQ's focus and purpose. |

### 3.2 Relationship to HIAMP Identity

The manifest identity is a **superset** of HIAMP identity. When both are configured:

| HIAMP Field (`config/hiamp.yaml`) | Manifest Field | Rule |
|-----------------------------------|----------------|------|
| `identity.owner` | `identity.owner` | MUST be identical. |
| `identity.instance-id` | `identity.instance-id` | MUST be identical. |
| `identity.display-name` | `identity.display-name` | MUST be identical if both are set. |
| (not present) | `identity.world-version` | World-specific field. |
| (not present) | `identity.description` | World-specific field. |

An HQ instance can have a manifest without HIAMP, and can have HIAMP without a manifest. When both exist, identity fields MUST be consistent.

### 3.3 Identity Derivation

The identity block is derived from existing HQ files during auto-generation:

1. **`owner`**: Read from `agents.md` -- extract the operator's name, lowercase it, replace spaces with hyphens.
2. **`instance-id`**: Read from `config/hiamp.yaml` if it exists. If not, generate as `{owner}-hq-{random-4}` where `random-4` is 4 random lowercase alphanumeric characters.
3. **`display-name`**: Read from `config/hiamp.yaml` or `agents.md`. If neither provides one, use `"{Name}'s HQ"` where `{Name}` is the operator name from `agents.md`.
4. **`world-version`**: Always `v1` for this spec.
5. **`description`**: Constructed from `agents.md` focus areas and role, or set manually.

---

## 4. Capability Catalog

The `capabilities` section lists the HQ's workers and their skills. This is the primary mechanism for peer capability discovery -- when another operator asks "what can this HQ do?", the capability catalog answers.

```yaml
capabilities:
  worker-count: 17                     # Total workers (including hidden)
  public-worker-count: 12             # Workers visible in this manifest

  workers:
    - id: architect
      type: CodeWorker
      team: dev-team
      description: "System design, API design, architecture decisions"
      skills:
        - system-design
        - api-design
        - architecture
      visibility: public

    - id: backend-dev
      type: CodeWorker
      team: dev-team
      description: "API endpoints, business logic, backend implementation"
      skills:
        - api-dev
        - database
        - backend
      visibility: public

    - id: frontend-dev
      type: CodeWorker
      team: dev-team
      description: "React/Next components, pages, UI implementation"
      skills:
        - react
        - nextjs
        - css
        - ui
      visibility: public
```

### 4.1 Capability Fields

| Field | Required | Format | Description |
|-------|----------|--------|-------------|
| `worker-count` | Yes | Integer | Total number of workers in this HQ, including hidden ones. Gives peers a sense of scale without revealing hidden workers. |
| `public-worker-count` | Yes | Integer | Number of workers visible in this manifest. |
| `workers` | Yes | List of worker entries | The public workers, with their skills and descriptions. |

### 4.2 Worker Entry Fields

| Field | Required | Format | Source | Description |
|-------|----------|--------|--------|-------------|
| `id` | Yes | `[a-z0-9][a-z0-9-]*[a-z0-9]` | `registry.yaml` `id` | Worker identifier. |
| `type` | Yes | `CodeWorker` \| `ContentWorker` \| `SocialWorker` \| `ResearchWorker` \| `OpsWorker` | `registry.yaml` `type` | Worker type classification. |
| `team` | No | String | `registry.yaml` `team` | Team grouping (e.g., `dev-team`, `content-team`). |
| `description` | Yes | String (max 256 chars) | `registry.yaml` `description` | Brief description of what the worker does. |
| `skills` | Yes | List of strings | `worker.yaml` skills or derived from `registry.yaml` description | Searchable skill tags. Used for capability queries. |
| `visibility` | Yes | `public` \| `unlisted` | `registry.yaml` `visibility` or manifest override | `public` workers appear in the manifest. `unlisted` workers are excluded. |

### 4.3 Auto-Derivation from registry.yaml

The capability catalog is **auto-derived** from `workers/registry.yaml`. The generation algorithm:

1. Read all worker entries from `registry.yaml`.
2. For each worker with `status: active`:
   a. Include the worker if `visibility: public` (the default).
   b. Exclude the worker if `visibility: private` in registry, or if it appears in the manifest's redaction list (Section 9).
   c. Copy `id`, `type`, `team`, and `description` directly from the registry entry.
   d. Derive `skills` from the worker's `worker.yaml` file if it contains a `skills:` field. If not, derive skills from the registry `description` by extracting key terms.
3. Set `worker-count` to the total number of active workers.
4. Set `public-worker-count` to the number of workers included in the manifest.
5. Workers of type `Library` are excluded from the manifest (they are internal utilities, not capabilities).

**Skill derivation priority:**

1. Explicit `skills:` list in `worker.yaml` (highest priority).
2. Skills inferred from `worker.yaml` skill file names (e.g., `skills/test-plan.md` yields skill `test-plan`).
3. Skills extracted from the `description` field in `registry.yaml` (lowest priority, used as fallback).

### 4.4 Opt-Out per Worker

An operator can exclude specific workers from the manifest by adding them to the redaction list in `config/manifest.yaml`:

```yaml
# In config/manifest.yaml (local config, not the generated manifest)
redact:
  workers:
    - security-scanner      # Don't reveal security tooling
    - content-legal          # Don't reveal legal review capability
```

Redacted workers are counted in `worker-count` but not listed in `workers`. This reveals the HQ's scale without exposing sensitive capabilities.

### 4.5 Skill Taxonomy

Skills are free-form strings. There is no enforced taxonomy in v1. However, the following conventions are recommended for discoverability:

| Convention | Example | Purpose |
|-----------|---------|---------|
| Lowercase, hyphenated | `e2e-testing` | Consistent formatting |
| Technology names | `react`, `playwright`, `vitest` | Stack discovery |
| Capability verbs | `code-review`, `system-design` | Functional discovery |
| Domain labels | `frontend`, `backend`, `devops` | Domain discovery |

Future versions may introduce a shared skill taxonomy for cross-HQ standardization, but v1 keeps it open to avoid premature constraint.

---

## 5. Knowledge Domains

The `knowledge` section describes what knowledge areas this HQ covers. It does not share knowledge content -- only domain labels and metadata that help peers understand the HQ's expertise.

```yaml
knowledge:
  domain-count: 8                      # Total knowledge domains
  public-domain-count: 6              # Domains visible in this manifest

  domains:
    - id: testing
      label: "Testing & QA"
      description: "E2E testing patterns, Playwright, Vitest, test fixtures, CI testing"
      depth: deep                      # surface | moderate | deep
      source: auto-detected

    - id: ai-security
      label: "AI Security"
      description: "AI security framework, credential isolation, prompt injection defense"
      depth: moderate
      source: auto-detected

    - id: agent-protocol
      label: "Agent Communication Protocol"
      description: "HIAMP spec, inter-agent messaging, worker addressing, Slack transport"
      depth: deep
      source: auto-detected

    - id: hq-world
      label: "HQ World Protocol"
      description: "Federation protocol for HQ instances, peering, transfers, trust"
      depth: deep
      source: auto-detected

    - id: web-development
      label: "Web Development"
      description: "React, Next.js, TypeScript, Node.js, full-stack patterns"
      depth: deep
      source: manual

    - id: infrastructure
      label: "Infrastructure & DevOps"
      description: "AWS CDK, ECS Fargate, CI/CD, Docker, cloud deployment"
      depth: moderate
      source: manual
```

### 5.1 Knowledge Domain Fields

| Field | Required | Format | Description |
|-------|----------|--------|-------------|
| `domain-count` | Yes | Integer | Total number of knowledge domains, including hidden ones. |
| `public-domain-count` | Yes | Integer | Number of domains visible in the manifest. |
| `domains` | Yes | List of domain entries | The public knowledge domains. |

### 5.2 Domain Entry Fields

| Field | Required | Format | Description |
|-------|----------|--------|-------------|
| `id` | Yes | `[a-z0-9][a-z0-9-]*[a-z0-9]` (2-64 chars) | Machine-readable domain identifier. |
| `label` | Yes | String (max 128 chars) | Human-readable domain name. |
| `description` | Yes | String (max 512 chars) | What this domain covers, including key topics and technologies. |
| `depth` | Yes | `surface` \| `moderate` \| `deep` | How much knowledge the HQ has in this domain. |
| `source` | Yes | `auto-detected` \| `manual` | Whether this domain was auto-detected from HQ files or manually curated. |

### 5.3 Depth Levels

| Level | Label | Meaning |
|-------|-------|---------|
| `surface` | Surface | Basic coverage. A few files or notes on the topic. |
| `moderate` | Moderate | Working knowledge. Multiple files, patterns, and guides. |
| `deep` | Deep | Comprehensive coverage. Extensive knowledge base with proven patterns, learnings, and battle-tested guides. |

Depth is self-assessed by the operator (or estimated by the auto-detection algorithm based on file count and content volume). It is a signal to peers, not a guarantee.

### 5.4 Auto-Detection from Knowledge Directories

Knowledge domains are **auto-detected** from the HQ's `knowledge/` directory structure. The algorithm:

1. Scan `knowledge/` for top-level subdirectories.
2. For each subdirectory:
   a. Use the directory name as the domain `id` (lowercased, hyphenated).
   b. Generate a `label` by title-casing the directory name.
   c. Generate a `description` by reading README.md or INDEX.md in the directory (first paragraph).
   d. Estimate `depth` based on:
      - File count < 3: `surface`
      - File count 3-10: `moderate`
      - File count > 10: `deep`
   e. Set `source: auto-detected`.
3. Also scan `companies/*/knowledge/` for company-scoped knowledge domains.
4. Merge auto-detected domains with any manually curated domains from `config/manifest.yaml`.
5. Apply redaction (Section 9) to exclude private domains.

**Manual override:** An operator can add, modify, or remove domains in `config/manifest.yaml`:

```yaml
# In config/manifest.yaml (local config)
knowledge:
  manual-domains:
    - id: web-development
      label: "Web Development"
      description: "React, Next.js, TypeScript, Node.js, full-stack patterns"
      depth: deep
  redact:
    domains:
      - loom                   # Internal tooling knowledge, don't share
      - Ralph                  # Personal assistant knowledge
```

### 5.5 Knowledge Domain vs. Knowledge Content

The manifest shares **domain metadata** (labels, descriptions, depth) -- never **knowledge content** (actual files). Sharing knowledge content requires a Knowledge Transfer (see [World Protocol Spec, Section 6.4](world-protocol-spec.md#64-knowledge-transfer)).

A peer who sees `testing: deep` in the manifest knows that this HQ has extensive testing knowledge and can request a knowledge transfer if connected. The manifest is the catalog; the transfer protocol is the delivery mechanism.

---

## 6. Connection Preferences

The `connection` section tells peers how this HQ prefers to interact. It provides hints for the peering ceremony and ongoing collaboration.

```yaml
connection:
  preferred-transport: file            # file | git | http | hiamp
  preferred-trust-level: verified      # open | verified | trusted
  manifest-refresh-interval: 7d       # How often to refresh manifests
  accepting-connections: true          # Whether this HQ is open to new peers
  collaboration-interests:             # What this HQ is interested in
    - "Testing patterns and E2E automation"
    - "Worker pattern sharing (pollination)"
    - "Full-stack web development knowledge"
  hiamp-enabled: true                  # Whether HIAMP is configured
```

### 6.1 Connection Preference Fields

| Field | Required | Format | Description |
|-------|----------|--------|-------------|
| `preferred-transport` | Yes | `file` \| `git` \| `http` \| `hiamp` | The transport this HQ prefers for transfers. Peers can still use other transports if available. |
| `preferred-trust-level` | No | `open` \| `verified` \| `trusted` | The trust level this HQ typically extends to new peers. Informational -- actual trust is set per-peer. |
| `manifest-refresh-interval` | No | Duration string (`7d`, `24h`, `30d`) | How often this HQ expects to refresh its manifest with peers. Default: `7d`. |
| `accepting-connections` | Yes | Boolean | Whether this HQ is currently open to new peer connections. `false` means it is not accepting proposals. |
| `collaboration-interests` | No | List of strings (max 5, max 256 chars each) | Topics or capabilities this HQ is interested in collaborating on. Helps peers decide if a connection would be mutually beneficial. |
| `hiamp-enabled` | No | Boolean | Whether this HQ has HIAMP configured for real-time worker-to-worker messaging. Informational -- helps peers know if HIAMP transport is available. |

### 6.2 Duration String Format

Duration strings use a simple format:

| Unit | Suffix | Example |
|------|--------|---------|
| Days | `d` | `7d` = 7 days |
| Hours | `h` | `24h` = 24 hours |
| Minutes | `m` | `30m` = 30 minutes |

Only one unit per string. `7d` is valid; `7d12h` is not. For sub-day precision, use hours or minutes.

---

## 7. Public Metadata

The `metadata` section provides additional public information that does not fit into other sections. It is entirely optional and operator-curated.

```yaml
metadata:
  generated-at: "2026-02-16T12:00:00Z"   # When this manifest was generated
  generator-version: "1.0.0"             # Manifest generator version
  hq-version: "4.0"                       # HQ platform version (from registry.yaml)
  operator:                                # Optional operator context
    role: "Software Engineer"
    focus: ["Web/Frontend", "Backend/APIs", "AI/ML", "Infrastructure"]
    timezone: null                         # Optional, for coordination
  tags:                                    # Free-form searchable tags
    - fullstack
    - ai
    - devops
    - typescript
```

### 7.1 Metadata Fields

| Field | Required | Format | Description |
|-------|----------|--------|-------------|
| `generated-at` | Yes | ISO 8601 datetime (UTC) | When this manifest was generated. Helps peers assess freshness. |
| `generator-version` | No | Semver string | Version of the manifest generator tool. |
| `hq-version` | No | String | HQ platform version (from `registry.yaml` `version` field). |
| `operator` | No | Object | Optional operator context derived from `agents.md`. |
| `operator.role` | No | String | Operator's role (from `agents.md`). |
| `operator.focus` | No | List of strings | Operator's focus areas (from `agents.md`). |
| `operator.timezone` | No | IANA timezone string | Operator's timezone for coordination. |
| `tags` | No | List of strings (max 20) | Free-form tags for searchability. Used by directory queries (future). |

### 7.2 Operator Context Privacy

The `operator` block is optional. An operator who prefers anonymity can omit it entirely. The identity block (`owner`, `instance-id`) is sufficient for protocol operation -- the operator context is purely informational.

---

## 8. Auto-Generation

The manifest can be fully generated from existing HQ files. This section describes the generation algorithm so any tool can produce a valid manifest.

### 8.1 Source Files

| Manifest Section | Source File(s) | Derivation |
|-----------------|---------------|------------|
| `identity.owner` | `agents.md` | Operator name, lowercased, hyphenated |
| `identity.instance-id` | `config/hiamp.yaml` or generated | HIAMP instance-id, or `{owner}-hq-{random-4}` |
| `identity.display-name` | `config/hiamp.yaml` or `agents.md` | HIAMP display-name, or `"{Name}'s HQ"` |
| `identity.world-version` | Constant | `v1` |
| `identity.description` | `agents.md` | Derived from focus areas and role |
| `capabilities.workers` | `workers/registry.yaml` + `workers/*/worker.yaml` | Active, public workers with skills |
| `knowledge.domains` | `knowledge/` directory tree | Auto-detected from subdirectories |
| `connection` | `config/manifest.yaml` (local config) | Operator-set preferences |
| `metadata` | `agents.md`, `registry.yaml` | Role, focus areas, tags |

### 8.2 Generation Algorithm

```
FUNCTION generate_manifest(hq_root):
  manifest = {}

  # Step 1: Identity
  agents = read_yaml(hq_root / "agents.md")  # parse YAML front-matter or structured sections
  hiamp = read_yaml(hq_root / "config/hiamp.yaml")  # may not exist
  local_config = read_yaml(hq_root / "config/manifest.yaml")  # may not exist

  manifest.identity.owner = derive_owner(agents)
  manifest.identity.instance_id = hiamp.identity.instance_id OR generate_instance_id(owner)
  manifest.identity.display_name = hiamp.identity.display_name OR "{agents.name}'s HQ"
  manifest.identity.world_version = "v1"
  manifest.identity.description = derive_description(agents)

  # Step 2: Capabilities
  registry = read_yaml(hq_root / "workers/registry.yaml")
  redacted_workers = local_config.redact.workers OR []

  all_workers = registry.workers.filter(w => w.status == "active" AND w.type != "Library")
  public_workers = all_workers.filter(w =>
    w.visibility != "private" AND w.id NOT IN redacted_workers
  )

  FOR each worker IN public_workers:
    worker_yaml = read_yaml(hq_root / worker.path / "worker.yaml")
    skills = worker_yaml.skills
              OR derive_skills_from_skill_files(worker.path / "skills/")
              OR extract_skills_from_description(worker.description)
    entry = {
      id: worker.id,
      type: worker.type,
      team: worker.team,
      description: worker.description,
      skills: skills,
      visibility: "public"
    }
    manifest.capabilities.workers.append(entry)

  manifest.capabilities.worker_count = len(all_workers)
  manifest.capabilities.public_worker_count = len(public_workers)

  # Step 3: Knowledge Domains
  redacted_domains = local_config.redact.domains OR []
  domains = []

  FOR each dir IN list_directories(hq_root / "knowledge/"):
    IF dir.name IN redacted_domains: CONTINUE
    domain = {
      id: slugify(dir.name),
      label: title_case(dir.name),
      description: extract_description(dir / "README.md" OR dir / "INDEX.md"),
      depth: estimate_depth(count_files(dir)),
      source: "auto-detected"
    }
    domains.append(domain)

  # Add company-scoped knowledge
  FOR each company_dir IN list_directories(hq_root / "companies/"):
    FOR each knowledge_dir IN list_directories(company_dir / "knowledge/"):
      IF knowledge_dir.name IN redacted_domains: CONTINUE
      # Same derivation as above, with company prefix
      ...

  # Merge manual domains
  FOR each manual_domain IN local_config.knowledge.manual_domains OR []:
    domains = merge_or_add(domains, manual_domain)

  manifest.knowledge.domain_count = len(all_domains_including_redacted)
  manifest.knowledge.public_domain_count = len(domains)
  manifest.knowledge.domains = domains

  # Step 4: Connection Preferences
  manifest.connection = local_config.connection OR defaults()

  # Step 5: Metadata
  manifest.metadata.generated_at = now_utc()
  manifest.metadata.generator_version = GENERATOR_VERSION
  manifest.metadata.hq_version = registry.version
  manifest.metadata.operator = derive_operator_context(agents)
  manifest.metadata.tags = local_config.tags OR derive_tags(agents, registry)

  RETURN manifest
```

### 8.3 Regeneration

The manifest SHOULD be regenerated:

- Before any peering ceremony (to ensure fresh data).
- After adding or removing workers from `registry.yaml`.
- After significant changes to knowledge directories.
- On a regular schedule (e.g., weekly) if the HQ participates in directory listings.

Regeneration is idempotent -- running the generator twice with the same inputs produces the same manifest (except for `generated-at`).

### 8.4 Command Integration

The manifest generator integrates with HQ's command system:

```
> /run architect world manifest generate
```

This command:

1. Reads all source files.
2. Applies redaction rules from `config/manifest.yaml`.
3. Writes the generated manifest to `config/manifest.yaml` (output section, separate from the config section).
4. Displays a summary of what is included and what is redacted.

For a quick preview without writing to disk:

```
> /run architect world manifest preview
```

---

## 9. Privacy & Redaction

The manifest is the public face of an HQ instance. Operators control what is revealed through redaction rules.

### 9.1 Redaction Config

Redaction rules live in the local `config/manifest.yaml` file (distinct from the generated manifest output):

```yaml
# config/manifest.yaml — local configuration for manifest generation
redact:
  workers:
    - security-scanner         # Reason: don't reveal security tooling
    - content-legal            # Reason: don't reveal legal review capability
  domains:
    - loom                     # Reason: internal tooling
    - Ralph                    # Reason: personal assistant
  operator:
    hide-role: false           # Whether to hide the operator's role
    hide-focus: false          # Whether to hide focus areas
    hide-timezone: true        # Whether to hide timezone
```

### 9.2 Redaction Behavior

| What is redacted | Effect on manifest |
|-----------------|-------------------|
| A worker | Worker is removed from `capabilities.workers`. `worker-count` still includes it. `public-worker-count` does not. |
| A knowledge domain | Domain is removed from `knowledge.domains`. `domain-count` still includes it. `public-domain-count` does not. |
| Operator role | `metadata.operator.role` is omitted. |
| Operator focus | `metadata.operator.focus` is omitted. |
| Operator timezone | `metadata.operator.timezone` is omitted. |

### 9.3 Why Counts Include Redacted Items

The `worker-count` and `domain-count` fields include redacted items intentionally. This gives peers a sense of the HQ's overall scale without revealing specifics. A manifest showing 17 total workers but only 12 public ones tells the peer "this HQ has more capabilities than what is listed here" -- which is honest without being revealing.

If an operator wants to hide even the count, they can override the counts in the local config:

```yaml
# config/manifest.yaml
overrides:
  worker-count: null           # Omit worker count from manifest
  domain-count: null           # Omit domain count from manifest
```

---

## 10. JSON Schema for Validation

The following JSON Schema validates a generated HQ manifest. Implementations SHOULD validate manifests at generation time (for outgoing manifests) and at receipt time (for incoming peer manifests).

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://hq.dev/schemas/world-manifest-v1.json",
  "title": "HQ World Manifest",
  "description": "Schema for HQ instance manifest — the business card of an HQ in the World Protocol",
  "type": "object",
  "required": ["identity", "capabilities", "knowledge", "connection"],
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
          "description": "Operator's unique name"
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
          "description": "Human-readable label"
        },
        "world-version": {
          "type": "string",
          "pattern": "^v[0-9]+$",
          "description": "World Protocol version"
        },
        "description": {
          "type": "string",
          "maxLength": 512,
          "description": "Brief description of this HQ instance"
        }
      }
    },
    "capabilities": {
      "type": "object",
      "required": ["public-worker-count", "workers"],
      "additionalProperties": false,
      "properties": {
        "worker-count": {
          "type": "integer",
          "minimum": 0,
          "description": "Total workers including redacted"
        },
        "public-worker-count": {
          "type": "integer",
          "minimum": 0,
          "description": "Workers visible in this manifest"
        },
        "workers": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["id", "type", "description", "skills", "visibility"],
            "additionalProperties": false,
            "properties": {
              "id": {
                "type": "string",
                "pattern": "^[a-z0-9][a-z0-9-]*[a-z0-9]$",
                "minLength": 2,
                "maxLength": 64,
                "description": "Worker identifier"
              },
              "type": {
                "type": "string",
                "enum": [
                  "CodeWorker",
                  "ContentWorker",
                  "SocialWorker",
                  "ResearchWorker",
                  "OpsWorker"
                ],
                "description": "Worker type classification"
              },
              "team": {
                "type": "string",
                "maxLength": 64,
                "description": "Team grouping"
              },
              "description": {
                "type": "string",
                "maxLength": 256,
                "description": "What this worker does"
              },
              "skills": {
                "type": "array",
                "minItems": 1,
                "items": {
                  "type": "string",
                  "pattern": "^[a-z0-9][a-z0-9-]*[a-z0-9]$",
                  "maxLength": 64
                },
                "description": "Searchable skill tags"
              },
              "visibility": {
                "type": "string",
                "enum": ["public", "unlisted"],
                "description": "Visibility level"
              }
            }
          }
        }
      }
    },
    "knowledge": {
      "type": "object",
      "required": ["public-domain-count", "domains"],
      "additionalProperties": false,
      "properties": {
        "domain-count": {
          "type": "integer",
          "minimum": 0,
          "description": "Total domains including redacted"
        },
        "public-domain-count": {
          "type": "integer",
          "minimum": 0,
          "description": "Domains visible in this manifest"
        },
        "domains": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["id", "label", "description", "depth", "source"],
            "additionalProperties": false,
            "properties": {
              "id": {
                "type": "string",
                "pattern": "^[a-z0-9][a-z0-9-]*[a-z0-9]$",
                "minLength": 2,
                "maxLength": 64,
                "description": "Domain identifier"
              },
              "label": {
                "type": "string",
                "maxLength": 128,
                "description": "Human-readable domain name"
              },
              "description": {
                "type": "string",
                "maxLength": 512,
                "description": "What this domain covers"
              },
              "depth": {
                "type": "string",
                "enum": ["surface", "moderate", "deep"],
                "description": "Depth of knowledge"
              },
              "source": {
                "type": "string",
                "enum": ["auto-detected", "manual"],
                "description": "How this domain was discovered"
              }
            }
          }
        }
      }
    },
    "connection": {
      "type": "object",
      "required": ["preferred-transport", "accepting-connections"],
      "additionalProperties": false,
      "properties": {
        "preferred-transport": {
          "type": "string",
          "enum": ["file", "git", "http", "hiamp"],
          "description": "Preferred transfer transport"
        },
        "preferred-trust-level": {
          "type": "string",
          "enum": ["open", "verified", "trusted"],
          "description": "Default trust level for new peers"
        },
        "manifest-refresh-interval": {
          "type": "string",
          "pattern": "^[0-9]+(d|h|m)$",
          "description": "How often to refresh manifests with peers"
        },
        "accepting-connections": {
          "type": "boolean",
          "description": "Whether open to new peer connections"
        },
        "collaboration-interests": {
          "type": "array",
          "maxItems": 5,
          "items": {
            "type": "string",
            "maxLength": 256
          },
          "description": "Topics of collaboration interest"
        },
        "hiamp-enabled": {
          "type": "boolean",
          "description": "Whether HIAMP messaging is configured"
        }
      }
    },
    "metadata": {
      "type": "object",
      "required": ["generated-at"],
      "additionalProperties": false,
      "properties": {
        "generated-at": {
          "type": "string",
          "format": "date-time",
          "description": "When this manifest was generated (UTC)"
        },
        "generator-version": {
          "type": "string",
          "description": "Manifest generator version"
        },
        "hq-version": {
          "type": "string",
          "description": "HQ platform version"
        },
        "operator": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "role": {
              "type": "string",
              "maxLength": 128,
              "description": "Operator's role"
            },
            "focus": {
              "type": "array",
              "items": {
                "type": "string",
                "maxLength": 128
              },
              "description": "Operator's focus areas"
            },
            "timezone": {
              "type": ["string", "null"],
              "description": "Operator's timezone (IANA format)"
            }
          }
        },
        "tags": {
          "type": "array",
          "maxItems": 20,
          "items": {
            "type": "string",
            "pattern": "^[a-z0-9][a-z0-9-]*[a-z0-9]$",
            "maxLength": 64
          },
          "description": "Free-form searchable tags"
        }
      }
    }
  }
}
```

### 10.1 Validation Notes

- The schema uses JSON Schema Draft 2020-12, consistent with the World Protocol envelope schema.
- `worker-count` and `domain-count` are optional (can be omitted via privacy overrides).
- Worker `skills` require at least one entry -- a worker with no skills is not useful for capability discovery.
- All identifiers use the same `[a-z0-9][a-z0-9-]*[a-z0-9]` pattern used throughout HQ and the World Protocol.
- `metadata` is the only optional top-level section, but `generated-at` is required within it if the section is present.

---

## 11. Manifest Lifecycle

### 11.1 Creation

A manifest is created when an operator first joins the World or when they run the manifest generator. Creation is always explicit -- there is no implicit manifest generation.

### 11.2 Refresh

Manifests should be refreshed when the HQ's capabilities or knowledge change. Peers are notified of manifest refreshes through `system` transfers with sub-type `manifest-refresh` (see [World Protocol Spec, Section 6.7](world-protocol-spec.md#67-system-transfer)).

### 11.3 Comparison

When a peer sends an updated manifest, the receiving HQ can diff it against the cached version to identify changes:

- **New workers:** Capabilities that were not in the previous manifest.
- **Removed workers:** Capabilities that are no longer listed.
- **New knowledge domains:** Areas of expertise that were not previously known.
- **Changed connection preferences:** Updated transport preferences or collaboration interests.

The diff is presented to the operator for awareness. No action is required -- manifest refresh does not change the connection state.

### 11.4 Archival

Old manifests are retained in the transfer log for historical reference. This provides an audit trail of how a peer's capabilities have evolved over time.

---

*End of HQ Manifest Schema.*

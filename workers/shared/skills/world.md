# world

Interact with connected HQ instances in the World federation -- query peers, browse capabilities, export/import transfer bundles, and manage connections through the peering ceremony. Any worker in the registry can use this skill to participate in inter-HQ collaboration.

This skill wraps the World Protocol (see `knowledge/hq-world/`) and the `@hq/world` library. All protocol complexity (envelope formatting, hash verification, manifest exchange, trust enforcement, transfer lifecycle) is handled under the hood. The worker invokes sub-commands; the skill handles the protocol.

## Arguments

`$ARGUMENTS` = `<sub-command> [options]`

Sub-commands: `peers`, `capabilities`, `export`, `import`, `connect`

## Sub-commands

### peers

List all connected HQ instances with their connection status and last-seen activity.

```
world peers [options]
```

**Optional:**
- `--status <status>` - Filter by connection status: `active`, `suspended`, `proposed`, `pending`, `disconnected`, `all` (default: `active`)
- `--verbose` - Show extended details (trust level, transport, manifest age, transfer counts)
- `--hq-root <path>` - HQ root directory (defaults to `$HQ_ROOT`)

**Process:**

1. Load World config from `config/world.yaml`
2. Read the `connections` list and filter by `--status`
3. For each matching connection, read cached peer manifest from `workspace/world/peers/{owner}/manifest.yaml`
4. Compute last-seen timestamp from the most recent entry in `workspace/world/transfers/` involving this peer
5. Display results as a formatted table

**Output:**

```
Connected Peers (3 active):

  #  Peer             Display Name      Status   Trust      Last Seen              Transport
  1  alex             Alex's HQ         active   verified   2026-02-16T15:30:00Z   file
  2  maria            Maria's HQ        active   trusted    2026-02-15T10:00:00Z   git
  3  jordan           Jordan's HQ       active   open       2026-02-10T08:00:00Z   file

Use 'world capabilities <peer>' to browse a peer's catalog.
Use 'world connect <owner>' to initiate a new connection.
```

**Verbose output (with --verbose):**

```
Connected Peers (3 active):

  1. alex (Alex's HQ)
     Status: active | Trust: verified | Transport: file
     Connected: 2026-02-16T11:00:00Z | Last seen: 2026-02-16T15:30:00Z
     Manifest age: 0 days (refreshed today)
     Transfers: 12 sent, 8 received (20 total)
     Export path: ~/hq-exports/alex/
     Import path: ~/hq-imports/alex/
     Notes: hq-cloud project collaboration

  2. maria (Maria's HQ)
     Status: active | Trust: trusted | Transport: git
     Connected: 2026-01-20T09:00:00Z | Last seen: 2026-02-15T10:00:00Z
     Manifest age: 1 day
     Transfers: 5 sent, 7 received (12 total)
     Auto-approve: knowledge[testing, infrastructure], context[hq-cloud]

  3. jordan (Jordan's HQ)
     Status: active | Trust: open | Transport: file
     Connected: 2026-02-10T08:00:00Z | Last seen: 2026-02-10T08:00:00Z
     Manifest age: 6 days
     Transfers: 0 sent, 0 received (0 total)
     Notes: exploratory connection
```

### capabilities

Browse a peer's workers, skills, and knowledge domains from their cached manifest.

```
world capabilities <peer> [options]
```

**Required:**
- `<peer>` - Peer owner name (e.g., `alex`)

**Optional:**
- `--section <section>` - Show only a specific section: `workers`, `skills`, `knowledge`, `all` (default: `all`)
- `--search <query>` - Filter capabilities by keyword match across workers, skills, and knowledge
- `--hq-root <path>` - HQ root directory

**Process:**

1. Load World config from `config/world.yaml`
2. Validate the peer exists and is in an active (or suspended) connection state
3. Read cached peer manifest from `workspace/world/peers/{peer}/manifest.yaml`
4. If the manifest is stale (older than `manifest-refresh-interval`), warn the operator
5. Parse the manifest sections: workers, knowledge domains, metadata
6. If `--search` is provided, filter all sections by keyword match
7. Display formatted capability catalog

**Output:**

```
Capabilities: alex (Alex's HQ)
================================
Manifest generated: 2026-02-16T10:00:00Z (today)
Protocol: World v1

Workers (8 public of 10 total):
  #  ID              Type          Skills                         Description
  1  backend-dev     CodeWorker    api-dev, database, nodejs      API endpoints, business logic
  2  qa-tester       CodeWorker    playwright, vitest, e2e        E2E testing, test automation
  3  devops          CodeWorker    aws, terraform, docker         Infrastructure, CI/CD
  4  frontend-dev    CodeWorker    react, nextjs, css             UI components, pages
  5  database-dev    CodeWorker    postgres, redis, migrations    Schema design, optimization
  6  security-dev    CodeWorker    auth, encryption, audit        Security hardening
  7  data-analyst    ResearchWorker python, sql, dashboards       Data analysis, reporting
  8  content-writer  ContentWorker  docs, guides, changelogs      Technical documentation

Knowledge Domains (5 public of 7 total):
  #  Domain                    Depth       Description
  1  Backend Development       deep        API design, Node.js, Express, database patterns
  2  Infrastructure & DevOps   moderate    AWS, Terraform, CI/CD pipelines
  3  Testing & QA              moderate    E2E testing, Playwright, test patterns
  4  Security                  surface     Authentication, authorization basics
  5  Data Engineering          surface     ETL patterns, data pipelines

Collaboration Interests:
  - Backend/frontend coordination
  - Testing pattern sharing
  - Infrastructure knowledge exchange

Use 'world export --to alex ...' to send a transfer.
Use 'world capabilities alex --search testing' to filter by keyword.
```

**Search output (with --search testing):**

```
Capabilities: alex (matching "testing")
========================================

Workers:
  - qa-tester (CodeWorker): playwright, vitest, e2e — E2E testing, test automation

Knowledge Domains:
  - Testing & QA (moderate): E2E testing, Playwright, test patterns

3 matches found across 2 sections.
```

### export

Package selected items from this HQ into a transfer bundle for a connected peer. This implements the sending side of the World Protocol transfer lifecycle.

```
world export --to <peer> --type <type> [type-specific options]
```

**Required:**
- `--to <peer>` - Target peer owner name (must be an active connection)
- `--type <type>` - Transfer type: `knowledge`, `worker-pattern`, `context`

**Knowledge transfer options:**
- `--files "<paths>"` - Comma-separated file paths to include (relative to HQ root)
- `--domain <domain>` - Primary knowledge domain label (e.g., `testing`)
- `--description "<text>"` - Human-readable description of the transfer

**Worker pattern transfer options:**
- `--worker <worker-id>` - Worker to export as a pattern
- `--description "<text>"` - Human-readable description

**Context transfer options:**
- `--project <name>` - Project name
- `--include <items>` - Comma-separated items: `brief`, `status`, `coordination`
- `--description "<text>"` - Human-readable description

**Common options:**
- `--supersedes <transfer-id>` - ID of a previous transfer this updates (creates a chain)
- `--dry-run` - Show what would be packaged without creating the bundle
- `--output-dir <path>` - Override output directory (defaults to peer's `export-path` from config)
- `--hq-root <path>` - HQ root directory

**Process:**

1. Load World config from `config/world.yaml`
2. Validate the target peer exists and connection is `active`
3. Validate transfer type and gather source files:
   - **knowledge**: Read specified `--files`, validate they exist, compute hashes
   - **worker-pattern**: Read `workers/{team}/{worker-id}/worker.yaml` and skills, sanitize (strip secrets, absolute paths, project-specific refs)
   - **context**: Generate context files for `--project` (brief, status, coordination as selected)
4. If `--supersedes` is set, validate the referenced transfer exists in the local transfer log and increment sequence number
5. Generate transfer ID: `txfr-{12 random hex chars}`
6. Build the bundle directory:
   ```
   txfr-{id}/
   ├── envelope.yaml        # Transfer envelope
   ├── payload/
   │   ├── manifest.yaml    # Payload manifest
   │   ├── {type}/          # knowledge/ | worker/ | context/
   │   │   └── ...
   │   └── metadata/
   │       ├── provenance.yaml
   │       └── adaptation.yaml   # (worker-pattern only)
   └── VERIFY.sha256        # Integrity checksums
   ```
7. Compute SHA-256 hashes for all payload files
8. Write `VERIFY.sha256` with per-file checksums
9. Compute aggregate `payload-hash` for the envelope
10. Write `envelope.yaml` with all required fields
11. Log the transfer as `sent` in `workspace/world/transfers/{date}.yaml`
12. Output the bundle location and summary

**Output:**

```
Transfer bundle created.
  Transfer ID: txfr-a1b2c3d4e5f6
  Type:        knowledge
  To:          alex (Alex's HQ)
  Domain:      testing
  Files:       2 (5,632 bytes total)
    - knowledge/e2e-learnings.md (3,584 bytes)
    - knowledge/testing/clerk-auth-patterns.md (2,048 bytes)
  Hash:        sha256:3f2b7c9d...
  Chain:       new (sequence 1)
  Bundle:      ~/hq-exports/alex/txfr-a1b2c3d4e5f6/

  Description: E2E testing patterns from BrandStage and hq-cloud projects.

Deliver the bundle to alex via your preferred channel.
The bundle is ready at the export path above.
```

**Worker pattern export output:**

```
Transfer bundle created.
  Transfer ID: txfr-b2c3d4e5f6a7
  Type:        worker-pattern
  To:          alex (Alex's HQ)
  Worker:      qa-tester (v2.1)
  Skills:      test-plan, write-test
  Size:        12,288 bytes
  Hash:        sha256:9d0e1f2a...
  Chain:       new (sequence 1)
  Bundle:      ~/hq-exports/alex/txfr-b2c3d4e5f6a7/

  Sanitization applied:
    - Stripped absolute file paths (replaced with domain labels)
    - Removed project-specific instructions
    - Generated adaptation.yaml with 3 customization points

  Description: QA tester worker pattern (v2.1) — test planning and writing.

Deliver the bundle to alex via your preferred channel.
```

**Dry run output (with --dry-run):**

```
Dry Run — No bundle created.

Would export:
  Type:   knowledge
  To:     alex
  Domain: testing
  Files:
    - knowledge/testing/e2e-learnings.md (3,584 bytes, sha256:a1b2c3...)
    - knowledge/testing/clerk-auth-patterns.md (2,048 bytes, sha256:b2c3d4...)
  Total size: 5,632 bytes

No issues detected. Run without --dry-run to create the bundle.
```

### import

Process an incoming transfer bundle from a connected peer. This implements the receiving side of the World Protocol transfer lifecycle.

```
world import <bundle-path> [options]
```

**Required:**
- `<bundle-path>` - Path to the transfer bundle directory or archive

**Optional:**
- `--auto-accept` - Skip interactive approval (only works for auto-approvable transfers at Trust Level 2, matching configured rules)
- `--preview-only` - Show the transfer preview without staging or approving
- `--force` - Force-accept a quarantined transfer (use with caution)
- `--hq-root <path>` - HQ root directory

**Process:**

1. If `<bundle-path>` is an archive (.tar.gz, .zip), extract to a temporary directory
2. Read `envelope.yaml` and validate all required fields
3. Validate `envelope.from` is a connected peer with an active connection
4. **Integrity verification:**
   a. Check `payload-size` matches actual payload size
   b. Verify each file in `VERIFY.sha256` against computed hashes
   c. Compute aggregate payload hash and compare with `envelope.payload-hash`
   d. Verify manifest item hashes against computed file hashes
   e. If ANY check fails: quarantine to `workspace/world/quarantine/{transfer-id}/` and report error
5. **Conflict detection** (if `envelope.supersedes` is set):
   a. Look up the superseded transfer in the transfer log
   b. Check if the superseded content was integrated locally
   c. If integrated, compare current file hash against `integration-hash`
   d. If hashes differ, flag a conflict with resolution options
6. **Display preview:**
   - Show sender, type, description, files, sizes, chain info
   - For worker patterns: show customization points and requirements
   - For context: show project name, snapshot age, included items
   - For conflicts: show resolution options
7. **Operator approval:**
   - Prompt `Accept this transfer? [y/n]`
   - For conflicts: prompt `[1] Accept update / [2] Keep local / [3] Merge manually`
   - If `--auto-accept` and transfer matches auto-approval rules: skip prompt
   - If `--preview-only`: stop here (no staging)
8. **Staging:**
   - Extract payload to `workspace/world/inbox/{sender}/{type}/{transfer-id}/`
   - Write `status.yaml` with staging metadata
9. **Log the transfer** in `workspace/world/transfers/{date}.yaml`
10. Output confirmation with next steps

**Output:**

```
Transfer Preview:
  From:         alex (Alex's HQ)
  Type:         knowledge
  Domain:       testing
  Connection:   active (trust: verified)
  Files:        2 knowledge files (5,632 bytes)
    - e2e-learnings.md (3,584 bytes) — Comprehensive E2E testing patterns
    - testing/clerk-auth-patterns.md (2,048 bytes) — Clerk auth testing
  Hash:         verified
  Chain:        new (first transfer)
  Description:  E2E testing patterns from BrandStage and hq-cloud projects.

  Accept this transfer? [y/n] y

Transfer accepted and staged.
  Staged to: workspace/world/inbox/alex/knowledge/txfr-a1b2c3d4e5f6/
  Status:    staged (awaiting integration)

  Next steps:
  1. Review staged files at the path above
  2. Integrate into your knowledge base (copy to knowledge/{target}/)
  3. The transfer log has been updated
```

**Conflict output:**

```
Transfer Preview:
  From:     alex (Alex's HQ)
  Type:     knowledge (UPDATE)
  Domain:   testing
  Chain:    sequence 2, supersedes txfr-a1b2c3d4e5f6

  CONFLICT DETECTED:
  The file knowledge/e2e-learnings.md from the previous transfer
  (txfr-a1b2c3d4e5f6) has been modified locally since integration.

    Integration hash: sha256:a1b2c3...
    Current hash:     sha256:f8e7d6...

  Options:
    [1] Accept update — replace local version with sender's update
    [2] Keep local — reject the update, keep your modifications
    [3] Merge manually — stage both versions for side-by-side review

  Choose [1/2/3]:
```

**Quarantine output (failed verification):**

```
Transfer QUARANTINED.
  Transfer ID: txfr-suspicious-001
  From:        alex
  Type:        knowledge
  Error:       ERR_TXFR_HASH_MISMATCH

  Details:
    Payload hash in envelope:  sha256:abcdef1234567890...
    Computed payload hash:     sha256:9876543210fedcba...
    Mismatching files:
      - payload/knowledge/patterns.md

  The transfer has been quarantined at:
    workspace/world/quarantine/txfr-suspicious-001/

  Actions:
    - Inspect the quarantined files
    - Contact alex to verify the transfer
    - Use 'world import --force <path>' to override (not recommended)
```

### connect

Initiate or respond to a peering ceremony to establish a connection with another HQ instance. This walks through the multi-step human-gated peering process.

```
world connect <sub-action> [options]
```

**Sub-actions:**
- `propose` - Create and send a connection proposal to a new peer
- `review` - Review an incoming connection proposal
- `exchange` - Send your manifest to a peer during the ceremony
- `approve` - Approve a pending connection and activate it
- `disconnect` - Terminate an active connection
- `suspend` - Temporarily pause a connection
- `resume` - Lift a suspension and reactivate

#### connect propose

Create a connection proposal for a new peer.

```
world connect propose --to <owner> [options]
```

**Required:**
- `--to <owner>` - Target peer's owner name

**Optional:**
- `--message "<text>"` - Human-readable message explaining why you want to connect (strongly recommended)
- `--trust-level <level>` - Suggested trust level: `open`, `verified`, `trusted` (default: `verified`)
- `--transport <transport>` - Suggested transport: `file`, `git`, `http`, `hiamp` (default: `file`)
- `--interests "<items>"` - Comma-separated collaboration interests
- `--include-manifest` - Include your manifest with the proposal (saves a round-trip)
- `--expires-in <duration>` - Proposal expiry duration (default: `14d`)
- `--hq-root <path>` - HQ root directory

**Process:**

1. Load World config from `config/world.yaml`
2. Validate no active connection exists for this peer
3. Generate proposal ID: `prop-{8 random hex chars}`
4. If `--include-manifest`, generate a fresh manifest
5. Create proposal YAML file:
   ```yaml
   proposal:
     id: prop-a1b2c3d4
     version: v1
     from:
       owner: stefan
       instance-id: stefan-hq-primary
       display-name: "Stefan's HQ"
       world-version: v1
     to:
       owner: alex
     message: "..."
     preferences:
       proposed-trust-level: verified
       proposed-transport: file
       collaboration-interests: [...]
     proposed-at: "2026-02-16T10:00:00Z"
     expires-at: "2026-03-02T10:00:00Z"
     include-manifest: true
   ```
6. Write proposal file to the peer's export path
7. Add connection record with `status: proposed` to `config/world.yaml`
8. Log the proposal event
9. Output the proposal file path and delivery instructions

**Output:**

```
Connection proposal created.
  Proposal ID: prop-a1b2c3d4
  To:          alex
  Trust:       verified (suggested)
  Transport:   file (suggested)
  Expires:     2026-03-02T10:00:00Z (14 days)
  Manifest:    included

  Files created:
    ~/hq-exports/alex/proposal-prop-a1b2c3d4.yaml
    ~/hq-exports/alex/manifest-stefan.yaml

  Next step: Deliver these files to alex via your preferred channel
  (Slack DM, email, shared drive, etc.)

  Your connection status: PROPOSED (waiting for alex's response)
```

#### connect review

Review an incoming connection proposal from another HQ operator.

```
world connect review <proposal-path>
```

**Required:**
- `<proposal-path>` - Path to the proposal YAML file

**Process:**

1. Read and validate the proposal file
2. Check proposal has not expired
3. Display the proposal details for operator review
4. If the proposal includes a manifest, display manifest summary
5. Prompt the operator: `Proceed with this connection? [y/n]`
6. If accepted:
   a. Add connection record with `status: pending` to `config/world.yaml`
   b. Generate a fresh manifest for the peer
   c. Output the manifest file path for delivery
7. If rejected:
   a. Add connection record with `status: rejected` to `config/world.yaml`
   b. Log the rejection

**Output (accepted):**

```
Connection Proposal Review
==========================
From: alex (Alex's HQ)
  Instance: alex-hq-primary
  Protocol: World v1

Message:
  Hey Stefan -- proposing a World connection for testing pattern
  sharing. My HQ has backend and QA workers.

Suggested Trust: verified
Suggested Transport: file

Manifest Summary (Alex's HQ):
  Workers: 8 public (backend-dev, qa-tester, devops, ...)
  Knowledge: Backend Development (deep), Testing & QA (moderate), ...

Proposal expires: 2026-03-02

Proceed with this connection? [y/n] y

Connection accepted. Status: PENDING

Your manifest has been generated:
  ~/hq-exports/alex/manifest-stefan.yaml

Next step: Send your manifest to alex and wait for mutual approval.
```

#### connect approve

Approve a pending connection and activate it.

```
world connect approve --peer <owner> --trust-level <level> [options]
```

**Required:**
- `--peer <owner>` - Peer to approve
- `--trust-level <level>` - Trust level for this connection: `open`, `verified`, `trusted`

**Optional:**
- `--transport <transport>` - Transport to use (defaults to peer's suggested or config default)
- `--export-path <path>` - Export directory for this peer
- `--import-path <path>` - Import directory for this peer
- `--notes "<text>"` - Notes about this connection
- `--hq-root <path>` - HQ root directory

**Process:**

1. Load World config and find the connection record for this peer
2. Validate connection is in `pending` state
3. Update connection record:
   - `status: active`
   - `trust-level`, `transport`, `transport-config`
   - `connected-at`, `approved-at`, `approved-by`
   - `manifest-last-refreshed`
4. Cache the peer's manifest to `workspace/world/peers/{owner}/manifest.yaml`
5. Create peer workspace directory structure
6. Log the connection activation event
7. Output confirmation

**Output:**

```
Connection approved and activated.
  Peer:      alex (Alex's HQ)
  Status:    ACTIVE
  Trust:     verified
  Transport: file
  Connected: 2026-02-16T11:00:00Z

  Peer manifest cached at: workspace/world/peers/alex/manifest.yaml
  Export path: ~/hq-exports/alex/
  Import path: ~/hq-imports/alex/

  The connection is live. You can now exchange transfers with alex.
  Use 'world peers' to see all connections.
  Use 'world export --to alex ...' to send your first transfer.
```

#### connect disconnect

Terminate an active connection with a peer.

```
world connect disconnect --peer <owner> [options]
```

**Required:**
- `--peer <owner>` - Peer to disconnect from

**Optional:**
- `--reason "<text>"` - Reason for disconnection
- `--no-notify` - Skip sending a disconnect notification to the peer
- `--hq-root <path>` - HQ root directory

**Process:**

1. Load World config and find the connection record
2. Validate connection is `active` or `suspended`
3. Display connection summary and confirmation prompt:
   - Connection duration, trust level, total transfers
4. On confirmation:
   a. Update connection record: `status: disconnected`, `disconnected-at`, `disconnected-by`, `disconnection-reason`
   b. Unless `--no-notify`: create a `system` disconnect transfer for the peer
   c. Remove cached peer manifest from `workspace/world/peers/{owner}/`
   d. Log the disconnection event
5. Output confirmation

**Output:**

```
Disconnect from alex (Alex's HQ)?

  Connection since: 2026-02-16
  Trust level: verified
  Transfers exchanged: 20 (12 sent, 8 received)
  Last activity: 2026-02-16T15:30:00Z

  This will:
  - Remove Alex's cached manifest
  - Stop accepting transfers from Alex
  - Send a disconnect notification to Alex
  - Preserve transfer history (audit log)

  Proceed? [y/n] y

Connection disconnected.
  Peer:   alex
  Status: DISCONNECTED
  Reason: Collaboration completed

  Disconnect notification sent to: ~/hq-exports/alex/txfr-disconnect-001/
  Transfer history preserved in workspace/world/transfers/.

  To reconnect in the future, a new peering ceremony is required.
```

#### connect suspend

Temporarily pause an active connection.

```
world connect suspend --peer <owner> [options]
```

**Required:**
- `--peer <owner>` - Peer to suspend

**Optional:**
- `--reason "<text>"` - Reason for suspension
- `--expires-in <duration>` - Auto-expiry duration (e.g., `7d`, `30d`)
- `--no-notify` - Skip sending a suspend notification
- `--hq-root <path>` - HQ root directory

**Output:**

```
Connection suspended.
  Peer:    alex
  Status:  SUSPENDED
  Reason:  Reviewing recent knowledge transfer for accuracy
  Expires: 2026-02-23T15:00:00Z (7 days)

  Incoming transfers from alex will be held in quarantine.
  Outgoing transfers to alex are blocked.

  Use 'world connect resume --peer alex' to reactivate.
```

#### connect resume

Lift a suspension and reactivate a connection.

```
world connect resume --peer <owner>
```

**Required:**
- `--peer <owner>` - Peer to resume

**Output:**

```
Connection reactivated.
  Peer:   alex
  Status: ACTIVE (was suspended since 2026-02-16)

  Held transfers released to inbox: 2 items
  Use 'world import' to review held transfers.
```

## Integration with Worker Execution

This skill is designed to be invoked during any worker's execution flow via `/run`:

```
/run architect world peers
/run architect world capabilities alex
/run backend-dev world export --to alex --type knowledge --files knowledge/testing/e2e-learnings.md --domain testing
/run qa-tester world import ~/hq-imports/alex/txfr-a1b2c3d4e5f6/
/run architect world connect propose --to alex --message "Testing pattern exchange"
/run architect world connect approve --peer alex --trust-level verified
```

Any worker in the registry can use this skill. The worker's identity is used for provenance tracking (which worker initiated the export/import) but does not restrict access -- all workers share the same World connections and transfer capabilities.

## Required Configuration

The skill requires:

1. **`config/world.yaml`** -- World Protocol configuration with identity, connections, and preferences.
   - See `knowledge/hq-world/configuration.md` for full schema.
   - Auto-generatable: run `world connect init` (or the equivalent setup in `/run architect world init`).

2. **`workspace/world/`** -- System-managed state directory (created automatically on first use).
   ```
   workspace/world/
   ├── peers/          # Cached peer manifests
   ├── transfers/      # Transfer event log
   ├── inbox/          # Staged incoming transfers
   ├── quarantine/     # Failed-verification transfers
   └── context/        # Integrated ephemeral context
   ```

If `config/world.yaml` does not exist, the skill will offer to generate it from existing HQ files (`config/hiamp.yaml`, `agents.md`).

## Protocol Reference

| Concept | Documentation |
|---------|---------------|
| World Protocol overview | `knowledge/hq-world/world-protocol-spec.md` |
| Manifest format & auto-generation | `knowledge/hq-world/manifest-schema.md` |
| Peering ceremony & connection states | `knowledge/hq-world/peering-ceremony.md` |
| Transfer envelope, types, versioning | `knowledge/hq-world/transfer-protocol.md` |
| Local config & state structure | `knowledge/hq-world/configuration.md` |

## Trust Level Behavior

The skill enforces trust level rules automatically:

| Trust Level | Transfer Handling | System Transfers |
|-------------|-------------------|------------------|
| 0 (Open) | All require manual approval | Require manual approval |
| 1 (Verified) | All require manual approval | Auto-processed |
| 2 (Trusted) | Auto-approval for configured domains/projects | Auto-processed |

Worker pattern transfers **always** require manual approval regardless of trust level.

## Transfer Types

| Type | Sub-command | Payload Contains | Max Size |
|------|------------|-----------------|----------|
| Knowledge | `export --type knowledge` | Markdown files, guides, patterns | 1 MB |
| Worker Pattern | `export --type worker-pattern` | worker.yaml, skills/*.md, adaptation notes | 512 KB |
| Context | `export --type context` | Project briefs, status snapshots, coordination maps | 256 KB |

## Rules

- Always validate the target peer has an active connection before exporting. The skill checks `config/world.yaml` automatically.
- Never include secrets, API keys, or tokens in any transfer bundle. Worker pattern sanitization strips these automatically.
- When exporting worker patterns, sanitization is mandatory: strip absolute paths, project-specific references, secrets. The adaptation.yaml guides the receiver on customization.
- Every transfer is logged to `workspace/world/transfers/`. No transfer is silent.
- Import always runs integrity verification (hash checks) before presenting the preview. Failures go to quarantine.
- The `connect` sub-command enforces human approval gates at every stage. No connection activates without explicit operator consent on both sides.
- Trust levels are local decisions. Changing trust level for a peer does not notify the peer.
- Disconnected and rejected connection records are retained in `config/world.yaml` for audit purposes.
- Transfer bundles are retained after integration to support rollback (retention period: per `preferences.transfer-retention.bundles`).
- Manifest cache in `workspace/world/peers/` is read-only. Workers can query it but never modify it.
- If `config/world.yaml` is missing, provide a clear error message pointing to the configuration documentation and offer auto-generation.
- All sub-commands output structured, human-readable results suitable for worker context windows.
- This skill parallels the HIAMP `message` skill. HIAMP handles real-time messaging; `world` handles structured data transfers and federation.

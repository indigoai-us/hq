# Quick Start: Join the HQ World

Get your HQ instance connected to a peer in under 10 steps.

**Prerequisites:** An HQ installation with at least one worker and some knowledge content.

---

## Step 1: Generate Your World Config

Create `config/world.yaml` with your identity:

```yaml
identity:
  owner: stefan                    # Your unique owner name (lowercase, 2+ chars)
  instance-id: stefan-hq-primary   # Unique ID for this installation
  display-name: "Stefan's HQ"     # Human-readable label
  world-version: v1

connections: []                    # Empty — no peers yet

preferences:
  default-transport: file          # MVP uses file-based exchange
  default-trust-level: verified    # Trust level for new connections
  auto-approve:
    enabled: false                 # Require manual approval for all transfers
  manifest-refresh:
    interval: 7d                   # How often to request updated manifests
```

> **Tip:** If you have `config/hiamp.yaml`, reuse the same `owner` and `instance-id` values. The World Protocol and HIAMP share identity fields for consistency.

## Step 2: Create Your Manifest

Your manifest is your HQ's "business card" -- what you share with peers so they can see your capabilities. Create it at `config/manifest.yaml` or generate it automatically:

```yaml
manifest-version: v1
identity:
  owner: stefan
  instance-id: stefan-hq-primary
  display-name: "Stefan's HQ"

capabilities:
  workers:
    - id: qa-tester
      type: CodeWorker
      description: "Automated testing specialist"
      skills:
        - { id: test-plan }
        - { id: write-test }
      visibility: public
  worker-count: 1

knowledge-domains:
  - id: testing
    name: Testing
    description: "E2E and unit testing patterns"
    visibility: public

connection-preferences:
  preferred-transport: [file]
  preferred-trust-level: verified
```

> **Tip:** The manifest can be auto-generated from your existing `workers/registry.yaml` and `knowledge/` directory. See [manifest-schema.md](manifest-schema.md) for auto-generation details.

## Step 3: Create the World Workspace

Set up the state directories the protocol needs:

```bash
mkdir -p workspace/world/peers
mkdir -p workspace/world/transfers
mkdir -p workspace/world/inbox
mkdir -p workspace/world/quarantine
```

Add `workspace/world/` to your `.gitignore` -- state directories are not versioned.

## Step 4: Send a Connection Proposal

To connect with another HQ operator, create a proposal file:

```yaml
proposal:
  id: prop-a1b2c3d4              # Random 8-hex-char ID
  version: v1
  from:
    owner: stefan
    instance-id: stefan-hq-primary
    display-name: "Stefan's HQ"
    world-version: v1
  to:
    owner: alex                   # The peer you're connecting to
  message: |
    Proposing a World connection for our collaboration.
    My HQ has QA testing workers and testing knowledge.
  preferences:
    proposed-trust-level: verified
    proposed-transport: file
    collaboration-interests:
      - "Testing pattern sharing"
      - "Worker pattern exchange"
  proposed-at: "2026-02-16T10:00:00Z"
  expires-at: "2026-03-02T10:00:00Z"
  include-manifest: true
```

Save as `proposal-prop-a1b2c3d4.yaml` and share it with your peer (Slack, email, git -- the protocol does not care how).

Include your manifest alongside the proposal so the peer can review your capabilities.

## Step 5: Exchange Manifests

When you receive a proposal from a peer:

1. Read their proposal and manifest
2. Review their capabilities, workers, and knowledge domains
3. Create or update your own manifest (Step 2)
4. Share your manifest back with the peer

Cache their manifest locally:

```bash
mkdir -p workspace/world/peers/alex
cp alex-manifest.yaml workspace/world/peers/alex/manifest.yaml
```

## Step 6: Approve the Connection

After reviewing the peer's manifest, add them to your `config/world.yaml`:

```yaml
connections:
  - peer:
      owner: alex
      instance-id: alex-hq-primary
    status: active
    trust-level: 1                 # 0=open, 1=verified, 2=trusted
    connected-at: "2026-02-16T14:00:00Z"
    last-seen: "2026-02-16T14:00:00Z"
    transport: file
```

Both operators must approve independently. Confirm with your peer that they have also added you.

## Step 7: Export a Transfer

Now that you are connected, share knowledge or worker patterns:

```typescript
import { exportKnowledge } from '@indigoai/hq-world';

const result = await exportKnowledge({
  files: ['knowledge/testing/e2e-patterns.md'],
  domain: 'testing',
  to: 'alex',
  from: 'stefan',
  instanceId: 'stefan-hq-primary',
  hqRoot: '/path/to/hq',
  outputDir: '/path/to/output',
  description: 'E2E testing patterns for our collaboration',
});

// result.bundlePath contains the transfer bundle directory
```

Or use the **world skill** from any worker: `world export --type knowledge --files knowledge/testing/ --to alex`

The bundle directory is self-contained -- share it with your peer however you like.

## Step 8: Import a Transfer

When you receive a transfer bundle from a peer:

```typescript
import { previewImport, stageTransfer } from '@indigoai/hq-world';

// 1. Preview — verify integrity, check for conflicts
const preview = await previewImport({
  bundlePath: '/path/to/received-bundle',
  hqRoot: '/path/to/hq',
});

console.log(preview.summary);        // Human-readable summary
console.log(preview.verification);    // Integrity check result
console.log(preview.conflicts);       // Any conflicts with local content

// 2. If approved — stage to inbox
const staged = await stageTransfer({
  bundlePath: '/path/to/received-bundle',
  hqRoot: '/path/to/hq',
});

// 3. Review staged content at workspace/world/inbox/{sender}/
// 4. Move approved content to its final location in your HQ
```

Or use the **world skill**: `world import --bundle /path/to/bundle`

## Step 9: Verify the Connection Works

Check that everything is in place:

- `config/world.yaml` shows your peer with `status: active`
- `workspace/world/peers/{peer}/manifest.yaml` contains their cached manifest
- `workspace/world/transfers/` has log entries for your transfers
- `workspace/world/inbox/` shows any staged incoming transfers

Use the **world skill** to check connection status: `world peers`

---

## What's Next

- **Transfer more content** -- share knowledge bases, worker patterns, or project context
- **Upgrade trust** -- increase trust level as the relationship matures
- **Connect more peers** -- repeat the ceremony with additional operators
- **Explore peer capabilities** -- browse their manifest to discover useful workers and knowledge

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Integrity verification fails | The bundle may have been corrupted in transit. Ask the sender to re-export. |
| Conflicts detected on import | Your HQ already has content at the same path. Preview shows the conflict details -- decide whether to keep local, accept incoming, or merge manually. |
| Transfer log is empty | Ensure `workspace/world/transfers/` directory exists. Logs are created automatically on first transfer. |
| Peer manifest is stale | Ask the peer to re-share their manifest. Cache it in `workspace/world/peers/{owner}/manifest.yaml`. |
| Connection shows as suspended | One operator suspended the connection. Coordinate with your peer to resolve the issue and reactivate. |

## Reference

- [World Protocol Spec](world-protocol-spec.md) -- Full protocol specification
- [Manifest Schema](manifest-schema.md) -- Manifest format and auto-generation
- [Peering Ceremony](peering-ceremony.md) -- Detailed connection lifecycle
- [Transfer Protocol](transfer-protocol.md) -- Transfer envelope and payload types
- [Configuration](configuration.md) -- Config and state directory structure

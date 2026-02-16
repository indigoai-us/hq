/**
 * End-to-End Validation Tests for the HQ World Protocol.
 *
 * These tests simulate TWO distinct HQ instances (HQ-A "stefan" and HQ-B "alex")
 * with separate identities, world configs, and workspace directories. They validate
 * the full lifecycle flows described in the World Protocol specification:
 *
 * 1. Peering Ceremony — two HQs complete the full connection flow from proposal to active
 * 2. Knowledge Transfer — HQ-A exports knowledge, HQ-B imports and verifies it
 * 3. Worker Pattern Sharing — HQ-A shares a worker pattern, HQ-B adapts it to a different structure
 * 4. Capability Discovery — HQ-B queries HQ-A's capabilities via cached manifest
 *
 * These tests go beyond the unit-level round-trip tests in transfer.test.ts by
 * simulating the full World Protocol state: config/world.yaml, workspace/world/peers/,
 * workspace/world/transfers/, and workspace/world/inbox/.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, rm, stat, readdir, cp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import yaml from 'js-yaml';

import {
  exportKnowledge,
  exportWorkerPattern,
} from '../export.js';

import {
  previewImport,
  stageTransfer,
  readEnvelope,
  readPayloadManifest,
  readAdaptation,
  detectConflicts,
} from '../import.js';

import {
  hashFile,
  hashBuffer,
  verifyBundle,
} from '../integrity.js';

import {
  logExport,
  logReceive,
  logApproval,
  logRejection,
  logIntegration,
  logQuarantine,
  readTransferLog,
} from '../transfer-log.js';

import {
  generateTransferId,
  utcNow,
} from '../utils.js';

import type {
  TransferEnvelope,
  KnowledgeManifest,
  WorkerPatternManifest,
} from '../types/index.js';

// ============================================================================
// Helpers
// ============================================================================

/** Create a temp directory for tests */
async function createTempDir(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), `hq-world-e2e-${prefix}-`));
}

/** Create a fully initialized HQ instance with world config and workspace */
async function createHQInstance(
  rootDir: string,
  owner: string,
  instanceId: string,
  displayName: string,
): Promise<void> {
  // Config directory
  await mkdir(join(rootDir, 'config'), { recursive: true });

  // World config
  const worldConfig = {
    identity: {
      owner,
      'instance-id': instanceId,
      'display-name': displayName,
      'world-version': 'v1',
    },
    connections: [],
    preferences: {
      'default-transport': 'file',
      'default-trust-level': 'verified',
      'auto-approve': { enabled: false },
      'manifest-refresh': { interval: '7d' },
    },
  };
  await writeFile(
    join(rootDir, 'config', 'world.yaml'),
    yaml.dump(worldConfig, { lineWidth: -1 }),
  );

  // Workspace directories
  await mkdir(join(rootDir, 'workspace', 'world', 'peers'), { recursive: true });
  await mkdir(join(rootDir, 'workspace', 'world', 'transfers'), { recursive: true });
  await mkdir(join(rootDir, 'workspace', 'world', 'inbox'), { recursive: true });
  await mkdir(join(rootDir, 'workspace', 'world', 'quarantine'), { recursive: true });
}

/** Create a connection proposal YAML file */
function createProposal(
  from: { owner: string; instanceId: string; displayName: string },
  to: { owner: string },
  message: string,
): Record<string, unknown> {
  const proposalId = `prop-${Math.random().toString(16).slice(2, 10)}`;
  const now = utcNow();
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

  return {
    proposal: {
      id: proposalId,
      version: 'v1',
      from: {
        owner: from.owner,
        'instance-id': from.instanceId,
        'display-name': from.displayName,
        'world-version': 'v1',
      },
      to: {
        owner: to.owner,
      },
      message,
      preferences: {
        'proposed-trust-level': 'verified',
        'proposed-transport': 'file',
        'collaboration-interests': ['Knowledge sharing', 'Worker pattern exchange'],
      },
      'proposed-at': now,
      'expires-at': expiresAt,
      'include-manifest': true,
    },
  };
}

/** Create an HQ manifest for capability discovery */
function createManifest(
  owner: string,
  instanceId: string,
  displayName: string,
  workers: Array<{ id: string; type: string; description: string; skills: string[] }>,
  knowledgeDomains: Array<{ id: string; name: string; description: string }>,
): Record<string, unknown> {
  return {
    'manifest-version': 'v1',
    'generated-at': utcNow(),
    identity: {
      owner,
      'instance-id': instanceId,
      'display-name': displayName,
      'world-version': 'v1',
    },
    capabilities: {
      workers: workers.map((w) => ({
        id: w.id,
        type: w.type,
        description: w.description,
        skills: w.skills.map((s) => ({ id: s })),
        visibility: 'public',
      })),
      'worker-count': workers.length,
    },
    'knowledge-domains': knowledgeDomains.map((d) => ({
      id: d.id,
      name: d.name,
      description: d.description,
      visibility: 'public',
    })),
    'connection-preferences': {
      'preferred-transport': ['file'],
      'preferred-trust-level': 'verified',
    },
  };
}

/** Add a connection record to world.yaml */
async function addConnection(
  hqRoot: string,
  peerOwner: string,
  peerInstanceId: string,
  status: string,
  trustLevel: number,
): Promise<void> {
  const configPath = join(hqRoot, 'config', 'world.yaml');
  const content = await readFile(configPath, 'utf-8');
  const config = yaml.load(content) as Record<string, unknown>;

  const connections = (config.connections as unknown[]) || [];
  connections.push({
    peer: {
      owner: peerOwner,
      'instance-id': peerInstanceId,
    },
    status,
    'trust-level': trustLevel,
    'connected-at': utcNow(),
    'last-seen': utcNow(),
    transport: 'file',
  });

  config.connections = connections;
  await writeFile(configPath, yaml.dump(config, { lineWidth: -1 }));
}

/** Cache a peer's manifest */
async function cachePeerManifest(
  hqRoot: string,
  peerOwner: string,
  manifest: Record<string, unknown>,
): Promise<void> {
  const peerDir = join(hqRoot, 'workspace', 'world', 'peers', peerOwner);
  await mkdir(peerDir, { recursive: true });
  await writeFile(join(peerDir, 'manifest.yaml'), yaml.dump(manifest, { lineWidth: -1 }));
}

// ============================================================================
// 1. Peering Ceremony — Full Connection Flow
// ============================================================================

describe('E2E: Peering Ceremony', () => {
  let hqA: string;
  let hqB: string;

  beforeEach(async () => {
    hqA = await createTempDir('hq-a-peer');
    hqB = await createTempDir('hq-b-peer');

    await createHQInstance(hqA, 'stefan', 'stefan-hq-primary', "Stefan's HQ");
    await createHQInstance(hqB, 'alex', 'alex-hq-primary', "Alex's HQ");
  });

  afterEach(async () => {
    await rm(hqA, { recursive: true, force: true });
    await rm(hqB, { recursive: true, force: true });
  });

  it('completes full peering ceremony from proposal to active connection', async () => {
    // ---------------------------------------------------------------
    // Step 1: Stefan creates a connection proposal
    // ---------------------------------------------------------------
    const proposal = createProposal(
      { owner: 'stefan', instanceId: 'stefan-hq-primary', displayName: "Stefan's HQ" },
      { owner: 'alex' },
      'Proposing a World connection for hq-cloud collaboration. My HQ has architecture, frontend, and QA workers.',
    );

    // Write proposal to a file (the artifact that gets shared out-of-band)
    const proposalPath = join(hqA, 'workspace', 'world', `proposal-${(proposal.proposal as Record<string, unknown>).id}.yaml`);
    await writeFile(proposalPath, yaml.dump(proposal, { lineWidth: -1 }));

    // Verify proposal structure
    const proposalDoc = proposal.proposal as Record<string, unknown>;
    expect(proposalDoc.id).toMatch(/^prop-[a-f0-9]{8}$/);
    expect(proposalDoc.version).toBe('v1');
    expect((proposalDoc.from as Record<string, unknown>).owner).toBe('stefan');
    expect((proposalDoc.to as Record<string, unknown>).owner).toBe('alex');

    // ---------------------------------------------------------------
    // Step 2: Alex receives and acknowledges the proposal
    // ---------------------------------------------------------------
    // Alex reads the proposal (delivered out-of-band)
    const receivedProposal = yaml.load(
      await readFile(proposalPath, 'utf-8'),
    ) as Record<string, unknown>;
    const receivedProposalDoc = receivedProposal.proposal as Record<string, unknown>;

    expect((receivedProposalDoc.from as Record<string, unknown>).owner).toBe('stefan');
    expect(receivedProposalDoc.message).toContain('hq-cloud collaboration');

    // ---------------------------------------------------------------
    // Step 3: Both operators create and exchange manifests
    // ---------------------------------------------------------------
    const manifestA = createManifest(
      'stefan',
      'stefan-hq-primary',
      "Stefan's HQ",
      [
        { id: 'architect', type: 'CodeWorker', description: 'System design', skills: ['design-review', 'architecture'] },
        { id: 'frontend-dev', type: 'CodeWorker', description: 'React/Next.js', skills: ['component', 'page'] },
        { id: 'qa-tester', type: 'CodeWorker', description: 'Testing specialist', skills: ['test-plan', 'write-test'] },
      ],
      [
        { id: 'testing', name: 'Testing', description: 'E2E and unit testing patterns' },
        { id: 'architecture', name: 'Architecture', description: 'System design patterns' },
      ],
    );

    const manifestB = createManifest(
      'alex',
      'alex-hq-primary',
      "Alex's HQ",
      [
        { id: 'backend-dev', type: 'CodeWorker', description: 'Node.js/Fastify', skills: ['api-route', 'database'] },
        { id: 'devops', type: 'CodeWorker', description: 'AWS/Docker', skills: ['deploy', 'ci-cd'] },
      ],
      [
        { id: 'backend', name: 'Backend', description: 'API and database patterns' },
        { id: 'devops', name: 'DevOps', description: 'Deployment and infrastructure' },
      ],
    );

    // Each side caches the other's manifest
    await cachePeerManifest(hqA, 'alex', manifestB);
    await cachePeerManifest(hqB, 'stefan', manifestA);

    // Verify manifest cache on both sides
    const cachedManifestOnA = yaml.load(
      await readFile(join(hqA, 'workspace', 'world', 'peers', 'alex', 'manifest.yaml'), 'utf-8'),
    ) as Record<string, unknown>;
    expect((cachedManifestOnA.identity as Record<string, unknown>).owner).toBe('alex');

    const cachedManifestOnB = yaml.load(
      await readFile(join(hqB, 'workspace', 'world', 'peers', 'stefan', 'manifest.yaml'), 'utf-8'),
    ) as Record<string, unknown>;
    expect((cachedManifestOnB.identity as Record<string, unknown>).owner).toBe('stefan');

    // ---------------------------------------------------------------
    // Step 4: Trust negotiation — both operators review and choose trust levels
    // ---------------------------------------------------------------
    // Stefan sets Alex at trust level 1 (Verified)
    // Alex sets Stefan at trust level 1 (Verified)
    // Trust is asymmetric — each side decides independently

    // ---------------------------------------------------------------
    // Step 5: Human approval — both operators approve
    // ---------------------------------------------------------------
    // Stefan approves the connection to Alex
    await addConnection(hqA, 'alex', 'alex-hq-primary', 'active', 1);
    // Alex approves the connection to Stefan
    await addConnection(hqB, 'stefan', 'stefan-hq-primary', 'active', 1);

    // ---------------------------------------------------------------
    // Step 6 & 7: Activation and confirmation
    // ---------------------------------------------------------------
    // Verify both sides show active connections
    const configA = yaml.load(
      await readFile(join(hqA, 'config', 'world.yaml'), 'utf-8'),
    ) as Record<string, unknown>;
    const connectionsA = configA.connections as Array<Record<string, unknown>>;
    expect(connectionsA).toHaveLength(1);
    expect(connectionsA[0].status).toBe('active');
    expect((connectionsA[0].peer as Record<string, unknown>).owner).toBe('alex');
    expect(connectionsA[0]['trust-level']).toBe(1);

    const configB = yaml.load(
      await readFile(join(hqB, 'config', 'world.yaml'), 'utf-8'),
    ) as Record<string, unknown>;
    const connectionsB = configB.connections as Array<Record<string, unknown>>;
    expect(connectionsB).toHaveLength(1);
    expect(connectionsB[0].status).toBe('active');
    expect((connectionsB[0].peer as Record<string, unknown>).owner).toBe('stefan');
    expect(connectionsB[0]['trust-level']).toBe(1);

    // Both sides have distinct identities
    expect((configA.identity as Record<string, unknown>).owner).toBe('stefan');
    expect((configB.identity as Record<string, unknown>).owner).toBe('alex');
  });

  it('handles rejection during peering ceremony', async () => {
    // Step 1: Stefan proposes
    const proposal = createProposal(
      { owner: 'stefan', instanceId: 'stefan-hq-primary', displayName: "Stefan's HQ" },
      { owner: 'alex' },
      'Connection proposal for collaboration.',
    );

    // Step 2: Alex reviews but decides to reject
    const proposalDoc = proposal.proposal as Record<string, unknown>;

    // Alex adds the proposal as a rejected connection
    await addConnection(hqB, 'stefan', 'stefan-hq-primary', 'rejected', 0);

    // Verify Alex's connection shows rejected
    const configB = yaml.load(
      await readFile(join(hqB, 'config', 'world.yaml'), 'utf-8'),
    ) as Record<string, unknown>;
    const connectionsB = configB.connections as Array<Record<string, unknown>>;
    expect(connectionsB[0].status).toBe('rejected');

    // Stefan should NOT have an active connection
    const configA = yaml.load(
      await readFile(join(hqA, 'config', 'world.yaml'), 'utf-8'),
    ) as Record<string, unknown>;
    const connectionsA = (configA.connections as unknown[]) || [];
    expect(connectionsA).toHaveLength(0);
  });

  it('supports asymmetric trust levels within bilateral connection', async () => {
    // Stefan trusts Alex at level 2 (Trusted)
    await addConnection(hqA, 'alex', 'alex-hq-primary', 'active', 2);
    // Alex trusts Stefan at level 1 (Verified)
    await addConnection(hqB, 'stefan', 'stefan-hq-primary', 'active', 1);

    const configA = yaml.load(
      await readFile(join(hqA, 'config', 'world.yaml'), 'utf-8'),
    ) as Record<string, unknown>;
    const configB = yaml.load(
      await readFile(join(hqB, 'config', 'world.yaml'), 'utf-8'),
    ) as Record<string, unknown>;

    const connA = (configA.connections as Array<Record<string, unknown>>)[0];
    const connB = (configB.connections as Array<Record<string, unknown>>)[0];

    // Connection is bilateral but trust is asymmetric
    expect(connA.status).toBe('active');
    expect(connB.status).toBe('active');
    expect(connA['trust-level']).toBe(2); // Stefan trusts Alex more
    expect(connB['trust-level']).toBe(1); // Alex trusts Stefan less
  });

  it('supports connection suspension and reconnection', async () => {
    // Establish active connection
    await addConnection(hqA, 'alex', 'alex-hq-primary', 'active', 1);
    await addConnection(hqB, 'stefan', 'stefan-hq-primary', 'active', 1);

    // Stefan suspends the connection
    const configPathA = join(hqA, 'config', 'world.yaml');
    const configA = yaml.load(await readFile(configPathA, 'utf-8')) as Record<string, unknown>;
    const connectionsA = configA.connections as Array<Record<string, unknown>>;
    connectionsA[0].status = 'suspended';
    connectionsA[0]['suspended-at'] = utcNow();
    connectionsA[0]['suspended-by'] = 'stefan';
    await writeFile(configPathA, yaml.dump(configA, { lineWidth: -1 }));

    // Verify suspended state
    const updatedConfigA = yaml.load(await readFile(configPathA, 'utf-8')) as Record<string, unknown>;
    expect((updatedConfigA.connections as Array<Record<string, unknown>>)[0].status).toBe('suspended');

    // Reactivate
    const configA2 = yaml.load(await readFile(configPathA, 'utf-8')) as Record<string, unknown>;
    (configA2.connections as Array<Record<string, unknown>>)[0].status = 'active';
    delete (configA2.connections as Array<Record<string, unknown>>)[0]['suspended-at'];
    delete (configA2.connections as Array<Record<string, unknown>>)[0]['suspended-by'];
    await writeFile(configPathA, yaml.dump(configA2, { lineWidth: -1 }));

    const reactivatedConfig = yaml.load(await readFile(configPathA, 'utf-8')) as Record<string, unknown>;
    expect((reactivatedConfig.connections as Array<Record<string, unknown>>)[0].status).toBe('active');
  });
});

// ============================================================================
// 2. Knowledge Transfer — Full E2E Flow Between Two HQ Instances
// ============================================================================

describe('E2E: Knowledge Transfer', () => {
  let hqA: string;
  let hqB: string;
  let exportDir: string;

  beforeEach(async () => {
    hqA = await createTempDir('hq-a-knowledge');
    hqB = await createTempDir('hq-b-knowledge');
    exportDir = await createTempDir('export-knowledge');

    // Initialize both HQ instances with full World Protocol state
    await createHQInstance(hqA, 'stefan', 'stefan-hq-primary', "Stefan's HQ");
    await createHQInstance(hqB, 'alex', 'alex-hq-primary', "Alex's HQ");

    // Establish active connections on both sides
    await addConnection(hqA, 'alex', 'alex-hq-primary', 'active', 1);
    await addConnection(hqB, 'stefan', 'stefan-hq-primary', 'active', 1);

    // HQ-A has rich knowledge content
    await mkdir(join(hqA, 'knowledge', 'testing'), { recursive: true });
    await mkdir(join(hqA, 'knowledge', 'architecture'), { recursive: true });
    await writeFile(
      join(hqA, 'knowledge', 'testing', 'e2e-patterns.md'),
      '# E2E Testing Patterns\n\n## Core Principles\n\n1. Test behavior, not implementation\n2. Use realistic fixtures\n3. Clean up in teardown\n4. Prefer integration over unit tests for API code\n\n## Patterns\n\n### Page Object Model\nEncapsulate page interactions in reusable objects.\n\n### Factory Functions\nGenerate test data with sensible defaults.\n',
    );
    await writeFile(
      join(hqA, 'knowledge', 'testing', 'vitest-setup.md'),
      '# Vitest Configuration\n\nStandard vitest setup for TypeScript projects.\n\n```typescript\nexport default defineConfig({\n  test: { globals: true, environment: "node" }\n});\n```\n',
    );
    await writeFile(
      join(hqA, 'knowledge', 'architecture', 'api-patterns.md'),
      '# API Patterns\n\n## Route Organization\nGroup routes by domain, not by HTTP method.\n\n## Error Handling\nUse structured error codes with ERR_ prefix.\n',
    );
  });

  afterEach(async () => {
    await rm(hqA, { recursive: true, force: true });
    await rm(hqB, { recursive: true, force: true });
    await rm(exportDir, { recursive: true, force: true });
  });

  it('exports knowledge from HQ-A, imports to HQ-B, verifies content matches', async () => {
    // ---------------------------------------------------------------
    // Phase 1: HQ-A exports a knowledge directory
    // ---------------------------------------------------------------
    const exportResult = await exportKnowledge({
      files: ['knowledge/testing'],
      domain: 'testing',
      to: 'alex',
      from: 'stefan',
      instanceId: 'stefan-hq-primary',
      hqRoot: hqA,
      outputDir: exportDir,
      description: 'E2E testing patterns and vitest setup for the hq-cloud project',
    });

    expect(exportResult.transferId).toMatch(/^txfr-[a-f0-9]{12}$/);
    expect(exportResult.fileCount).toBe(2); // e2e-patterns.md + vitest-setup.md
    expect(exportResult.envelope.type).toBe('knowledge');
    expect(exportResult.envelope.from).toBe('stefan');
    expect(exportResult.envelope.to).toBe('alex');

    // Log export on HQ-A
    await logExport(hqA, exportResult.envelope);

    // Verify export log on HQ-A
    const exportLogs = await readTransferLog(hqA, exportResult.envelope.timestamp.split('T')[0]);
    const sentEntry = exportLogs.find((e) => e.event === 'sent' && e.id === exportResult.transferId);
    expect(sentEntry).toBeDefined();
    expect(sentEntry!.direction).toBe('outbound');
    expect(sentEntry!.type).toBe('knowledge');

    // ---------------------------------------------------------------
    // Phase 2: Bundle is shared out-of-band (simulated — it's just a directory)
    // ---------------------------------------------------------------
    // In the real world, Stefan would share the bundle directory with Alex
    // via Slack, email, git, etc. The protocol doesn't care how.

    // ---------------------------------------------------------------
    // Phase 3: HQ-B previews the incoming transfer
    // ---------------------------------------------------------------
    const preview = await previewImport({
      bundlePath: exportResult.bundlePath,
      hqRoot: hqB,
    });

    // Verify integrity passes
    expect(preview.verification.valid).toBe(true);
    expect(preview.verification.errors).toHaveLength(0);

    // Verify envelope metadata
    expect(preview.envelope.from).toBe('stefan');
    expect(preview.envelope.to).toBe('alex');
    expect(preview.envelope.type).toBe('knowledge');
    expect(preview.envelope.description).toContain('E2E testing patterns');

    // No conflicts (HQ-B has no existing testing knowledge)
    expect(preview.conflicts).toHaveLength(0);

    // Human-readable summary
    expect(preview.summary).toContain('stefan');
    expect(preview.summary).toContain('Knowledge');
    expect(preview.summary).toContain('verified');

    // ---------------------------------------------------------------
    // Phase 4: Alex approves — stage the transfer to HQ-B's inbox
    // ---------------------------------------------------------------
    const stageResult = await stageTransfer({
      bundlePath: exportResult.bundlePath,
      hqRoot: hqB,
    });

    expect(stageResult.transferId).toBe(exportResult.transferId);
    expect(stageResult.stagedTo).toContain('inbox');
    expect(stageResult.stagedTo).toContain('stefan');
    expect(stageResult.stagedTo).toContain('knowledge');

    // Log receive and approval on HQ-B
    await logReceive(hqB, exportResult.envelope, stageResult.stagedTo);
    await logApproval(hqB, exportResult.transferId, 'stefan', 'knowledge', 'alex');

    // ---------------------------------------------------------------
    // Phase 5: Verify staged content matches original bit-for-bit
    // ---------------------------------------------------------------
    const stagedPatternsPath = join(
      hqB,
      stageResult.stagedTo,
      'payload',
      'knowledge',
      'testing',
      'e2e-patterns.md',
    );
    const stagedSetupPath = join(
      hqB,
      stageResult.stagedTo,
      'payload',
      'knowledge',
      'testing',
      'vitest-setup.md',
    );

    const originalPatterns = await readFile(join(hqA, 'knowledge', 'testing', 'e2e-patterns.md'), 'utf-8');
    const stagedPatterns = await readFile(stagedPatternsPath, 'utf-8');
    expect(stagedPatterns).toBe(originalPatterns);

    const originalSetup = await readFile(join(hqA, 'knowledge', 'testing', 'vitest-setup.md'), 'utf-8');
    const stagedSetup = await readFile(stagedSetupPath, 'utf-8');
    expect(stagedSetup).toBe(originalSetup);

    // Hash verification
    const originalHash = await hashFile(join(hqA, 'knowledge', 'testing', 'e2e-patterns.md'));
    const stagedHash = await hashFile(stagedPatternsPath);
    expect(stagedHash).toBe(originalHash);

    // ---------------------------------------------------------------
    // Phase 6: Simulate integration — move from inbox to knowledge/
    // ---------------------------------------------------------------
    const integrationTarget = 'knowledge/testing/e2e-patterns.md';
    const integrationHash = await hashFile(stagedPatternsPath);
    await logIntegration(hqB, exportResult.transferId, 'stefan', 'knowledge', integrationTarget, integrationHash);

    // Verify complete transfer log on HQ-B
    const importLogs = await readTransferLog(hqB);
    const events = importLogs.map((e) => e.event);
    expect(events).toContain('received');
    expect(events).toContain('approved');
    expect(events).toContain('integrated');

    // All entries reference the same transfer ID
    const relevantEntries = importLogs.filter((e) => e.id === exportResult.transferId);
    expect(relevantEntries.length).toBeGreaterThanOrEqual(3);
  });

  it('detects conflicts when HQ-B already has knowledge at the same path', async () => {
    // HQ-B already has testing knowledge with different content
    await mkdir(join(hqB, 'knowledge', 'testing'), { recursive: true });
    await writeFile(
      join(hqB, 'knowledge', 'testing', 'e2e-patterns.md'),
      '# E2E Testing Patterns\n\n## Alex\'s Version\n\nDifferent patterns here.\n',
    );

    // Export from HQ-A
    const exportResult = await exportKnowledge({
      files: ['knowledge/testing/e2e-patterns.md'],
      domain: 'testing',
      to: 'alex',
      from: 'stefan',
      instanceId: 'stefan-hq-primary',
      hqRoot: hqA,
      outputDir: exportDir,
    });

    // Preview on HQ-B — should detect conflict
    const preview = await previewImport({
      bundlePath: exportResult.bundlePath,
      hqRoot: hqB,
    });

    expect(preview.verification.valid).toBe(true);
    expect(preview.conflicts.length).toBeGreaterThan(0);
    expect(preview.conflicts[0].localPath).toBe('knowledge/testing/e2e-patterns.md');
    expect(preview.conflicts[0].description).toContain('different');
  });

  it('handles chain transfers with supersedes and sequence', async () => {
    // First transfer
    const result1 = await exportKnowledge({
      files: ['knowledge/testing/e2e-patterns.md'],
      domain: 'testing',
      to: 'alex',
      from: 'stefan',
      instanceId: 'stefan-hq-primary',
      hqRoot: hqA,
      outputDir: exportDir,
      description: 'Initial testing patterns',
      sequence: 1,
    });

    expect(result1.envelope.sequence).toBe(1);
    expect(result1.envelope.supersedes).toBeNull();

    // Update the knowledge on HQ-A
    await writeFile(
      join(hqA, 'knowledge', 'testing', 'e2e-patterns.md'),
      '# E2E Testing Patterns v2\n\nUpdated with new patterns.\n',
    );

    // Second transfer supersedes the first
    const result2 = await exportKnowledge({
      files: ['knowledge/testing/e2e-patterns.md'],
      domain: 'testing',
      to: 'alex',
      from: 'stefan',
      instanceId: 'stefan-hq-primary',
      hqRoot: hqA,
      outputDir: exportDir,
      description: 'Updated testing patterns',
      supersedes: result1.transferId,
      sequence: 2,
    });

    expect(result2.envelope.sequence).toBe(2);
    expect(result2.envelope.supersedes).toBe(result1.transferId);

    // Preview the superseding transfer on HQ-B
    const preview = await previewImport({
      bundlePath: result2.bundlePath,
      hqRoot: hqB,
    });

    expect(preview.envelope.supersedes).toBe(result1.transferId);
    expect(preview.summary).toContain('sequence 2');
    expect(preview.summary).toContain('supersedes');
  });

  it('quarantines transfer when integrity verification fails', async () => {
    // Export from HQ-A
    const exportResult = await exportKnowledge({
      files: ['knowledge/testing/e2e-patterns.md'],
      domain: 'testing',
      to: 'alex',
      from: 'stefan',
      instanceId: 'stefan-hq-primary',
      hqRoot: hqA,
      outputDir: exportDir,
    });

    // Tamper with the bundle after export (simulating corruption in transit)
    // Note: single-file export places files directly in payload/knowledge/{filename}
    await writeFile(
      join(exportResult.bundlePath, 'payload', 'knowledge', 'e2e-patterns.md'),
      '# TAMPERED CONTENT — this should be detected\n',
    );

    // Preview detects the tampering
    const preview = await previewImport({
      bundlePath: exportResult.bundlePath,
      hqRoot: hqB,
    });

    expect(preview.verification.valid).toBe(false);
    expect(preview.verification.errors.length).toBeGreaterThan(0);

    // Log quarantine event on HQ-B
    await logQuarantine(
      hqB,
      exportResult.transferId,
      'stefan',
      'knowledge',
      'ERR_TXFR_INTEGRITY',
      'Payload hash mismatch — bundle may have been tampered with in transit',
    );

    const logs = await readTransferLog(hqB);
    const quarantineEntry = logs.find((e) => e.event === 'quarantined');
    expect(quarantineEntry).toBeDefined();
    expect(quarantineEntry!['error-code']).toBe('ERR_TXFR_INTEGRITY');
  });
});

// ============================================================================
// 3. Worker Pattern Sharing — Export, Import, Adaptation
// ============================================================================

describe('E2E: Worker Pattern Sharing (Pollination)', () => {
  let hqA: string;
  let hqB: string;
  let exportDir: string;

  beforeEach(async () => {
    hqA = await createTempDir('hq-a-worker');
    hqB = await createTempDir('hq-b-worker');
    exportDir = await createTempDir('export-worker');

    // Initialize both HQ instances
    await createHQInstance(hqA, 'stefan', 'stefan-hq-primary', "Stefan's HQ");
    await createHQInstance(hqB, 'alex', 'alex-hq-primary', "Alex's HQ");

    // Establish connections
    await addConnection(hqA, 'alex', 'alex-hq-primary', 'active', 1);
    await addConnection(hqB, 'stefan', 'stefan-hq-primary', 'active', 1);

    // HQ-A has a mature qa-tester worker with multiple skills
    const workerDir = join(hqA, 'workers', 'dev-team', 'qa-tester');
    await mkdir(join(workerDir, 'skills'), { recursive: true });

    await writeFile(
      join(workerDir, 'worker.yaml'),
      yaml.dump({
        id: 'qa-tester',
        type: 'CodeWorker',
        status: 'active',
        description: 'Automated testing specialist — E2E, integration, and unit tests',
        skills: [
          { id: 'test-plan', description: 'Generate structured test plans from PRDs', file: 'skills/test-plan.md' },
          { id: 'write-test', description: 'Write E2E and integration tests', file: 'skills/write-test.md' },
          { id: 'coverage-analysis', description: 'Analyze test coverage gaps', file: 'skills/coverage-analysis.md' },
        ],
        instructions: 'You are a QA testing specialist. Write tests that verify behavior, not implementation. Use Page Object Model for E2E tests. Always include teardown logic.',
        context: {
          base: ['knowledge/testing/e2e-patterns.md', 'knowledge/testing/vitest-setup.md'],
        },
      }),
    );

    await writeFile(
      join(workerDir, 'skills', 'test-plan.md'),
      '# Test Plan Skill\n\nGenerate structured test plans from PRDs and acceptance criteria.\n\n## Process\n\n1. Read the PRD acceptance criteria\n2. Map each criterion to one or more test cases\n3. Classify tests as unit, integration, or E2E\n4. Generate a test matrix\n5. Identify edge cases and failure modes\n',
    );

    await writeFile(
      join(workerDir, 'skills', 'write-test.md'),
      '# Write Test Skill\n\nWrite E2E and integration tests using vitest and Playwright.\n\n## Conventions\n\n- Use `describe/it` blocks with clear names\n- One assertion per test when possible\n- Use factory functions for test data\n- Clean up in afterEach\n',
    );

    await writeFile(
      join(workerDir, 'skills', 'coverage-analysis.md'),
      '# Coverage Analysis Skill\n\nAnalyze test coverage and identify gaps.\n\n## Process\n\n1. Map user stories to test files\n2. Check each acceptance criterion has a corresponding test\n3. Report untested paths\n4. Suggest priority order for new tests\n',
    );

    // HQ-B has a DIFFERENT worker structure (workers/ instead of workers/dev-team/)
    // This simulates adaptation to a different HQ layout
    await mkdir(join(hqB, 'workers', 'engineering'), { recursive: true });
    await writeFile(
      join(hqB, 'workers', 'engineering', 'backend-dev.yaml'),
      yaml.dump({
        id: 'backend-dev',
        type: 'CodeWorker',
        description: 'Node.js backend developer',
      }),
    );
  });

  afterEach(async () => {
    await rm(hqA, { recursive: true, force: true });
    await rm(hqB, { recursive: true, force: true });
    await rm(exportDir, { recursive: true, force: true });
  });

  it('exports worker pattern from HQ-A, imports to HQ-B with different structure, verifies adaptation', async () => {
    // ---------------------------------------------------------------
    // Phase 1: Stefan exports the qa-tester worker pattern
    // ---------------------------------------------------------------
    const exportResult = await exportWorkerPattern({
      workerDir: 'workers/dev-team/qa-tester',
      to: 'alex',
      from: 'stefan',
      instanceId: 'stefan-hq-primary',
      hqRoot: hqA,
      outputDir: exportDir,
      patternVersion: '3.0',
      description: 'Battle-tested QA tester worker with 3 skills — evolved through BrandStage and hq-cloud projects',
      adaptation: {
        requires: {
          'knowledge-domains': ['testing', 'e2e'],
          tools: ['vitest', 'playwright'],
        },
        'customization-points': [
          {
            field: 'worker.yaml > instructions',
            guidance: 'Adapt to your testing framework and project conventions',
            priority: 'high',
          },
          {
            field: 'worker.yaml > context.base',
            guidance: 'Point to your local knowledge paths for testing documentation',
            priority: 'high',
          },
          {
            field: 'skills/write-test.md > Conventions',
            guidance: 'Update testing conventions to match your stack (Jest, Mocha, etc.)',
            priority: 'medium',
          },
        ],
        'not-included': [
          'Knowledge files (knowledge/testing/) — must be transferred separately',
          'CI/CD configuration',
          'Project-specific test fixtures',
        ],
        'evolution-notes': 'This worker evolved through 3 projects: BrandStage E2E testing, hq-cloud API tests, and Synesis agent tests. The test-plan skill was added in v2.0 after discovering that PRD-driven test generation improved coverage significantly.',
      },
    });

    expect(exportResult.transferId).toMatch(/^txfr-[a-f0-9]{12}$/);
    expect(exportResult.fileCount).toBe(4); // worker.yaml + 3 skills
    expect(exportResult.envelope.type).toBe('worker-pattern');

    // Log export on HQ-A
    await logExport(hqA, exportResult.envelope);

    // ---------------------------------------------------------------
    // Phase 2: Alex previews the incoming worker pattern
    // ---------------------------------------------------------------
    const preview = await previewImport({
      bundlePath: exportResult.bundlePath,
      hqRoot: hqB,
    });

    // Integrity verified
    expect(preview.verification.valid).toBe(true);

    // Pattern metadata is correct
    expect(preview.envelope.type).toBe('worker-pattern');
    expect(preview.envelope.from).toBe('stefan');
    expect(preview.summary).toContain('Worker Pattern');
    expect(preview.summary).toContain('qa-tester');
    expect(preview.summary).toContain('v3.0');

    // Adaptation notes are present
    expect(preview.adaptation).toBeDefined();
    expect(preview.adaptation!['pattern-name']).toBe('qa-tester');
    expect(preview.adaptation!['pattern-version']).toBe('3.0');
    expect(preview.adaptation!['pattern-origin']).toBe('stefan');
    expect(preview.adaptation!['customization-points']).toHaveLength(3);
    expect(preview.adaptation!['not-included']).toHaveLength(3);
    expect(preview.adaptation!['evolution-notes']).toContain('BrandStage');

    // Adaptation requires
    expect(preview.adaptation!.requires).toBeDefined();
    expect(preview.adaptation!.requires!['knowledge-domains']).toContain('testing');
    expect(preview.adaptation!.requires!.tools).toContain('vitest');

    // ---------------------------------------------------------------
    // Phase 3: Alex stages the transfer
    // ---------------------------------------------------------------
    const stageResult = await stageTransfer({
      bundlePath: exportResult.bundlePath,
      hqRoot: hqB,
    });

    expect(stageResult.stagedTo).toContain('worker-pattern');
    expect(stageResult.stagedTo).toContain('qa-tester');

    // Log receive and approval
    await logReceive(hqB, exportResult.envelope, stageResult.stagedTo);
    await logApproval(hqB, exportResult.transferId, 'stefan', 'worker-pattern', 'alex');

    // ---------------------------------------------------------------
    // Phase 4: Verify the staged worker pattern content
    // ---------------------------------------------------------------
    const stagedWorkerPath = join(hqB, stageResult.stagedTo, 'payload', 'worker');

    // worker.yaml content matches
    const originalWorkerYaml = await readFile(
      join(hqA, 'workers', 'dev-team', 'qa-tester', 'worker.yaml'),
      'utf-8',
    );
    const stagedWorkerYaml = await readFile(
      join(stagedWorkerPath, 'worker.yaml'),
      'utf-8',
    );
    expect(stagedWorkerYaml).toBe(originalWorkerYaml);

    // All 3 skills match
    for (const skillFile of ['test-plan.md', 'write-test.md', 'coverage-analysis.md']) {
      const originalSkill = await readFile(
        join(hqA, 'workers', 'dev-team', 'qa-tester', 'skills', skillFile),
        'utf-8',
      );
      const stagedSkill = await readFile(
        join(stagedWorkerPath, 'skills', skillFile),
        'utf-8',
      );
      expect(stagedSkill).toBe(originalSkill);
    }

    // Hashes match for all files
    const originalWorkerHash = await hashFile(
      join(hqA, 'workers', 'dev-team', 'qa-tester', 'worker.yaml'),
    );
    const stagedWorkerHash = await hashFile(join(stagedWorkerPath, 'worker.yaml'));
    expect(stagedWorkerHash).toBe(originalWorkerHash);

    // ---------------------------------------------------------------
    // Phase 5: Verify adaptation notes guide the receiving operator
    // ---------------------------------------------------------------
    const adaptationContent = await readFile(
      join(hqB, stageResult.stagedTo, 'payload', 'metadata', 'adaptation.yaml'),
      'utf-8',
    );
    const adaptation = yaml.load(adaptationContent) as Record<string, unknown>;

    expect(adaptation['pattern-name']).toBe('qa-tester');
    expect(adaptation['pattern-version']).toBe('3.0');
    expect(adaptation['pattern-origin']).toBe('stefan');

    // The customization points tell Alex what needs to change
    const customizationPoints = adaptation['customization-points'] as Array<Record<string, unknown>>;
    expect(customizationPoints.some((cp) => cp.priority === 'high')).toBe(true);

    // ---------------------------------------------------------------
    // Phase 6: Alex "adapts" the worker to their HQ structure
    // (Simulated — in practice, this is manual with guidance from adaptation notes)
    // ---------------------------------------------------------------
    // Alex's HQ uses workers/engineering/ instead of workers/dev-team/
    const adaptedWorkerDir = join(hqB, 'workers', 'engineering', 'qa-tester');
    await mkdir(join(adaptedWorkerDir, 'skills'), { recursive: true });

    // Copy worker.yaml and modify instructions for Alex's conventions
    const workerConfig = yaml.load(stagedWorkerYaml) as Record<string, unknown>;
    workerConfig.instructions = 'You are a QA testing specialist. Write tests that verify behavior. Use Jest and Supertest for API tests. Always clean up test databases.';
    (workerConfig.context as Record<string, unknown>).base = ['knowledge/testing/api-test-patterns.md'];
    await writeFile(join(adaptedWorkerDir, 'worker.yaml'), yaml.dump(workerConfig, { lineWidth: -1 }));

    // Copy skills unchanged (adaptation notes say medium priority)
    for (const skillFile of ['test-plan.md', 'write-test.md', 'coverage-analysis.md']) {
      const skillContent = await readFile(join(stagedWorkerPath, 'skills', skillFile), 'utf-8');
      await writeFile(join(adaptedWorkerDir, 'skills', skillFile), skillContent);
    }

    // Verify the adapted worker exists in HQ-B's structure
    const adaptedConfig = yaml.load(
      await readFile(join(adaptedWorkerDir, 'worker.yaml'), 'utf-8'),
    ) as Record<string, unknown>;

    // Core identity preserved
    expect(adaptedConfig.id).toBe('qa-tester');
    expect(adaptedConfig.type).toBe('CodeWorker');
    // Instructions adapted to Alex's stack
    expect(adaptedConfig.instructions).toContain('Jest and Supertest');
    // Context paths adapted
    expect((adaptedConfig.context as Record<string, unknown>).base).toContain('knowledge/testing/api-test-patterns.md');

    // Skills are preserved (same content)
    for (const skillFile of ['test-plan.md', 'write-test.md', 'coverage-analysis.md']) {
      const originalSkill = await readFile(
        join(hqA, 'workers', 'dev-team', 'qa-tester', 'skills', skillFile),
        'utf-8',
      );
      const adaptedSkill = await readFile(
        join(adaptedWorkerDir, 'skills', skillFile),
        'utf-8',
      );
      expect(adaptedSkill).toBe(originalSkill);
    }

    // Log integration for the worker pattern
    const integrationHash = await hashFile(join(adaptedWorkerDir, 'worker.yaml'));
    await logIntegration(
      hqB,
      exportResult.transferId,
      'stefan',
      'worker-pattern',
      'workers/engineering/qa-tester',
      integrationHash,
    );

    // Full transfer log
    const logs = await readTransferLog(hqB);
    const events = logs.map((e) => e.event);
    expect(events).toContain('received');
    expect(events).toContain('approved');
    expect(events).toContain('integrated');
  });

  it('round-trip preserves all worker files with correct hashes', async () => {
    const exportResult = await exportWorkerPattern({
      workerDir: 'workers/dev-team/qa-tester',
      to: 'alex',
      from: 'stefan',
      instanceId: 'stefan-hq-primary',
      hqRoot: hqA,
      outputDir: exportDir,
      patternVersion: '3.0',
    });

    // Verify bundle integrity
    const verification = await verifyBundle(
      exportResult.bundlePath,
      exportResult.envelope['payload-hash'],
      exportResult.envelope['payload-size'],
    );
    expect(verification.valid).toBe(true);

    // Stage on HQ-B
    const stageResult = await stageTransfer({
      bundlePath: exportResult.bundlePath,
      hqRoot: hqB,
    });

    // Verify all original files have matching hashes in the staged bundle
    const originalFiles = [
      'workers/dev-team/qa-tester/worker.yaml',
      'workers/dev-team/qa-tester/skills/test-plan.md',
      'workers/dev-team/qa-tester/skills/write-test.md',
      'workers/dev-team/qa-tester/skills/coverage-analysis.md',
    ];

    const stagedBase = join(hqB, stageResult.stagedTo, 'payload', 'worker');

    for (const originalFile of originalFiles) {
      const fileName = originalFile.replace('workers/dev-team/qa-tester/', '');
      const originalHash = await hashFile(join(hqA, originalFile));
      const stagedHash = await hashFile(join(stagedBase, fileName));
      expect(stagedHash).toBe(originalHash);
    }
  });
});

// ============================================================================
// 4. Capability Discovery — Query Peer Capabilities via Cached Manifest
// ============================================================================

describe('E2E: Capability Discovery', () => {
  let hqA: string;
  let hqB: string;

  beforeEach(async () => {
    hqA = await createTempDir('hq-a-discovery');
    hqB = await createTempDir('hq-b-discovery');

    await createHQInstance(hqA, 'stefan', 'stefan-hq-primary', "Stefan's HQ");
    await createHQInstance(hqB, 'alex', 'alex-hq-primary', "Alex's HQ");

    // Establish connections
    await addConnection(hqA, 'alex', 'alex-hq-primary', 'active', 1);
    await addConnection(hqB, 'stefan', 'stefan-hq-primary', 'active', 1);
  });

  afterEach(async () => {
    await rm(hqA, { recursive: true, force: true });
    await rm(hqB, { recursive: true, force: true });
  });

  it('discovers peer capabilities through cached manifest', async () => {
    // Stefan caches Alex's manifest (received during peering ceremony)
    const alexManifest = createManifest(
      'alex',
      'alex-hq-primary',
      "Alex's HQ",
      [
        { id: 'backend-dev', type: 'CodeWorker', description: 'Node.js/Fastify specialist', skills: ['api-route', 'database', 'auth'] },
        { id: 'devops', type: 'CodeWorker', description: 'AWS/Docker specialist', skills: ['deploy', 'ci-cd', 'monitoring'] },
        { id: 'data-analyst', type: 'ResearchWorker', description: 'Data analysis and reporting', skills: ['sql-query', 'dashboard'] },
      ],
      [
        { id: 'backend', name: 'Backend Patterns', description: 'API design, database patterns, auth flows' },
        { id: 'devops', name: 'DevOps', description: 'Deployment, CI/CD, monitoring' },
        { id: 'analytics', name: 'Analytics', description: 'Data analysis and business intelligence' },
      ],
    );

    await cachePeerManifest(hqA, 'alex', alexManifest);

    // Now Stefan can query Alex's capabilities
    const cachedManifest = yaml.load(
      await readFile(join(hqA, 'workspace', 'world', 'peers', 'alex', 'manifest.yaml'), 'utf-8'),
    ) as Record<string, unknown>;

    // Verify identity
    const identity = cachedManifest.identity as Record<string, unknown>;
    expect(identity.owner).toBe('alex');
    expect(identity['display-name']).toBe("Alex's HQ");

    // Query workers
    const capabilities = cachedManifest.capabilities as Record<string, unknown>;
    const workers = capabilities.workers as Array<Record<string, unknown>>;
    expect(workers).toHaveLength(3);

    // Find specific worker capabilities
    const backendDev = workers.find((w) => w.id === 'backend-dev');
    expect(backendDev).toBeDefined();
    expect(backendDev!.description).toContain('Fastify');
    const backendSkills = (backendDev!.skills as Array<Record<string, unknown>>).map((s) => s.id);
    expect(backendSkills).toContain('api-route');
    expect(backendSkills).toContain('auth');

    // Query knowledge domains
    const knowledgeDomains = cachedManifest['knowledge-domains'] as Array<Record<string, unknown>>;
    expect(knowledgeDomains).toHaveLength(3);

    const backendDomain = knowledgeDomains.find((d) => d.id === 'backend');
    expect(backendDomain).toBeDefined();
    expect(backendDomain!.description).toContain('API design');

    // Query connection preferences
    const prefs = cachedManifest['connection-preferences'] as Record<string, unknown>;
    expect(prefs['preferred-transport']).toContain('file');
  });

  it('both HQs can discover each other\'s capabilities', async () => {
    // Exchange manifests
    const stefanManifest = createManifest(
      'stefan',
      'stefan-hq-primary',
      "Stefan's HQ",
      [
        { id: 'architect', type: 'CodeWorker', description: 'System design', skills: ['design-review'] },
        { id: 'qa-tester', type: 'CodeWorker', description: 'Testing', skills: ['test-plan', 'write-test'] },
      ],
      [
        { id: 'testing', name: 'Testing', description: 'E2E and unit testing' },
      ],
    );

    const alexManifest = createManifest(
      'alex',
      'alex-hq-primary',
      "Alex's HQ",
      [
        { id: 'backend-dev', type: 'CodeWorker', description: 'Backend', skills: ['api-route'] },
      ],
      [
        { id: 'backend', name: 'Backend', description: 'API patterns' },
      ],
    );

    // Each caches the other's manifest
    await cachePeerManifest(hqA, 'alex', alexManifest);
    await cachePeerManifest(hqB, 'stefan', stefanManifest);

    // Stefan sees Alex's workers
    const alexCached = yaml.load(
      await readFile(join(hqA, 'workspace', 'world', 'peers', 'alex', 'manifest.yaml'), 'utf-8'),
    ) as Record<string, unknown>;
    const alexWorkers = (alexCached.capabilities as Record<string, unknown>).workers as Array<Record<string, unknown>>;
    expect(alexWorkers.some((w) => w.id === 'backend-dev')).toBe(true);

    // Alex sees Stefan's workers
    const stefanCached = yaml.load(
      await readFile(join(hqB, 'workspace', 'world', 'peers', 'stefan', 'manifest.yaml'), 'utf-8'),
    ) as Record<string, unknown>;
    const stefanWorkers = (stefanCached.capabilities as Record<string, unknown>).workers as Array<Record<string, unknown>>;
    expect(stefanWorkers.some((w) => w.id === 'qa-tester')).toBe(true);
    expect(stefanWorkers.some((w) => w.id === 'architect')).toBe(true);
  });
});

// ============================================================================
// 5. Full Integration Scenario — Peering + Transfer + Discovery
// ============================================================================

describe('E2E: Full Integration Scenario', () => {
  let hqA: string;
  let hqB: string;
  let exportDir: string;

  beforeEach(async () => {
    hqA = await createTempDir('hq-a-full');
    hqB = await createTempDir('hq-b-full');
    exportDir = await createTempDir('export-full');
  });

  afterEach(async () => {
    await rm(hqA, { recursive: true, force: true });
    await rm(hqB, { recursive: true, force: true });
    await rm(exportDir, { recursive: true, force: true });
  });

  it('complete lifecycle: peering ceremony -> capability discovery -> knowledge transfer -> worker pattern sharing', async () => {
    // ===============================================================
    // STAGE 1: Initialize two distinct HQ instances
    // ===============================================================
    await createHQInstance(hqA, 'stefan', 'stefan-hq-primary', "Stefan's HQ");
    await createHQInstance(hqB, 'alex', 'alex-hq-primary', "Alex's HQ");

    // HQ-A has knowledge and workers
    await mkdir(join(hqA, 'knowledge', 'testing'), { recursive: true });
    await writeFile(
      join(hqA, 'knowledge', 'testing', 'best-practices.md'),
      '# Testing Best Practices\n\n1. Test behavior, not implementation\n2. Use factory functions\n3. Always clean up\n',
    );

    const workerDir = join(hqA, 'workers', 'dev-team', 'qa-tester');
    await mkdir(join(workerDir, 'skills'), { recursive: true });
    await writeFile(
      join(workerDir, 'worker.yaml'),
      yaml.dump({
        id: 'qa-tester',
        type: 'CodeWorker',
        description: 'Testing specialist',
        skills: [{ id: 'test-plan', file: 'skills/test-plan.md' }],
        instructions: 'Test behavior, not implementation.',
      }),
    );
    await writeFile(
      join(workerDir, 'skills', 'test-plan.md'),
      '# Test Plan\n\nGenerate test plans from acceptance criteria.\n',
    );

    // ===============================================================
    // STAGE 2: Peering Ceremony
    // ===============================================================

    // Step 1: Stefan proposes
    const proposal = createProposal(
      { owner: 'stefan', instanceId: 'stefan-hq-primary', displayName: "Stefan's HQ" },
      { owner: 'alex' },
      'Let us connect our HQs for hq-cloud collaboration.',
    );

    // Step 2-3: Exchange manifests
    const stefanManifest = createManifest(
      'stefan', 'stefan-hq-primary', "Stefan's HQ",
      [{ id: 'qa-tester', type: 'CodeWorker', description: 'Testing', skills: ['test-plan'] }],
      [{ id: 'testing', name: 'Testing', description: 'Testing patterns' }],
    );

    const alexManifest = createManifest(
      'alex', 'alex-hq-primary', "Alex's HQ",
      [{ id: 'backend-dev', type: 'CodeWorker', description: 'Backend', skills: ['api-route'] }],
      [{ id: 'backend', name: 'Backend', description: 'API patterns' }],
    );

    await cachePeerManifest(hqA, 'alex', alexManifest);
    await cachePeerManifest(hqB, 'stefan', stefanManifest);

    // Step 5-7: Both approve and activate
    await addConnection(hqA, 'alex', 'alex-hq-primary', 'active', 1);
    await addConnection(hqB, 'stefan', 'stefan-hq-primary', 'active', 1);

    // Verify both sides are active
    const configA = yaml.load(await readFile(join(hqA, 'config', 'world.yaml'), 'utf-8')) as Record<string, unknown>;
    const configB = yaml.load(await readFile(join(hqB, 'config', 'world.yaml'), 'utf-8')) as Record<string, unknown>;
    expect((configA.connections as Array<Record<string, unknown>>)[0].status).toBe('active');
    expect((configB.connections as Array<Record<string, unknown>>)[0].status).toBe('active');

    // ===============================================================
    // STAGE 3: Capability Discovery
    // ===============================================================

    // Alex queries Stefan's capabilities
    const stefanCached = yaml.load(
      await readFile(join(hqB, 'workspace', 'world', 'peers', 'stefan', 'manifest.yaml'), 'utf-8'),
    ) as Record<string, unknown>;
    const stefanWorkers = (stefanCached.capabilities as Record<string, unknown>).workers as Array<Record<string, unknown>>;
    const hasQaTester = stefanWorkers.some((w) => w.id === 'qa-tester');
    expect(hasQaTester).toBe(true);

    // Alex sees Stefan has testing knowledge
    const stefanKnowledge = stefanCached['knowledge-domains'] as Array<Record<string, unknown>>;
    expect(stefanKnowledge.some((d) => d.id === 'testing')).toBe(true);

    // ===============================================================
    // STAGE 4: Knowledge Transfer
    // ===============================================================

    const knowledgeExport = await exportKnowledge({
      files: ['knowledge/testing/best-practices.md'],
      domain: 'testing',
      to: 'alex',
      from: 'stefan',
      instanceId: 'stefan-hq-primary',
      hqRoot: hqA,
      outputDir: exportDir,
      description: 'Testing best practices',
    });

    await logExport(hqA, knowledgeExport.envelope);

    const knowledgePreview = await previewImport({
      bundlePath: knowledgeExport.bundlePath,
      hqRoot: hqB,
    });
    expect(knowledgePreview.verification.valid).toBe(true);
    expect(knowledgePreview.conflicts).toHaveLength(0);

    const knowledgeStage = await stageTransfer({
      bundlePath: knowledgeExport.bundlePath,
      hqRoot: hqB,
    });

    await logReceive(hqB, knowledgeExport.envelope, knowledgeStage.stagedTo);
    await logApproval(hqB, knowledgeExport.transferId, 'stefan', 'knowledge', 'alex');

    // Verify content
    const stagedKnowledge = await readFile(
      join(hqB, knowledgeStage.stagedTo, 'payload', 'knowledge', 'best-practices.md'),
      'utf-8',
    );
    const originalKnowledge = await readFile(
      join(hqA, 'knowledge', 'testing', 'best-practices.md'),
      'utf-8',
    );
    expect(stagedKnowledge).toBe(originalKnowledge);

    // ===============================================================
    // STAGE 5: Worker Pattern Transfer
    // ===============================================================

    const workerExport = await exportWorkerPattern({
      workerDir: 'workers/dev-team/qa-tester',
      to: 'alex',
      from: 'stefan',
      instanceId: 'stefan-hq-primary',
      hqRoot: hqA,
      outputDir: exportDir,
      patternVersion: '1.0',
      description: 'QA tester worker pattern',
    });

    await logExport(hqA, workerExport.envelope);

    const workerPreview = await previewImport({
      bundlePath: workerExport.bundlePath,
      hqRoot: hqB,
    });
    expect(workerPreview.verification.valid).toBe(true);
    expect(workerPreview.adaptation).toBeDefined();

    const workerStage = await stageTransfer({
      bundlePath: workerExport.bundlePath,
      hqRoot: hqB,
    });

    await logReceive(hqB, workerExport.envelope, workerStage.stagedTo);
    await logApproval(hqB, workerExport.transferId, 'stefan', 'worker-pattern', 'alex');

    // Verify worker pattern content
    const stagedWorkerYaml = await readFile(
      join(hqB, workerStage.stagedTo, 'payload', 'worker', 'worker.yaml'),
      'utf-8',
    );
    const originalWorkerYaml = await readFile(
      join(hqA, 'workers', 'dev-team', 'qa-tester', 'worker.yaml'),
      'utf-8',
    );
    expect(stagedWorkerYaml).toBe(originalWorkerYaml);

    // ===============================================================
    // STAGE 6: Verify complete audit trail
    // ===============================================================

    // HQ-A export logs
    const aLogs = await readTransferLog(hqA, knowledgeExport.envelope.timestamp.split('T')[0]);
    const aSentEvents = aLogs.filter((e) => e.event === 'sent');
    expect(aSentEvents).toHaveLength(2); // knowledge + worker pattern

    // HQ-B import logs
    const bLogs = await readTransferLog(hqB);
    const bReceivedEvents = bLogs.filter((e) => e.event === 'received');
    const bApprovedEvents = bLogs.filter((e) => e.event === 'approved');
    expect(bReceivedEvents).toHaveLength(2); // knowledge + worker pattern
    expect(bApprovedEvents).toHaveLength(2);

    // Transfer IDs are distinct
    const transferIds = new Set(bLogs.map((e) => e.id));
    expect(transferIds.size).toBe(2);
  });
});

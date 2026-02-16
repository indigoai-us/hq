/**
 * Comprehensive tests for the HQ World Protocol transfer implementation.
 *
 * Tests cover:
 * 1. Integrity/hashing utilities
 * 2. Knowledge export
 * 3. Worker pattern export
 * 4. Import preview with integrity verification
 * 5. Conflict detection
 * 6. Transfer log management
 * 7. Staging (import approval)
 * 8. Round-trip: export from HQ-A, import to HQ-B, verify match
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import yaml from 'js-yaml';

import {
  hashFile,
  hashBuffer,
  computePayloadHash,
  computePayloadSize,
  computeFileHashes,
  generateVerifyFile,
  parseVerifyFile,
  verifyBundle,
  listFilesRecursive,
} from '../integrity.js';

import {
  exportKnowledge,
  exportWorkerPattern,
  type ExportKnowledgeOptions,
  type ExportWorkerPatternOptions,
} from '../export.js';

import {
  previewImport,
  stageTransfer,
  readEnvelope,
  readPayloadManifest,
  detectConflicts,
} from '../import.js';

import {
  logExport,
  logReceive,
  logApproval,
  logIntegration,
  readTransferLog,
} from '../transfer-log.js';

import {
  generateTransferId,
  isValidTransferId,
  isValidOwnerName,
  isValidHash,
} from '../utils.js';

import type { TransferEnvelope, KnowledgeManifest, WorkerPatternManifest } from '../types/index.js';

/** Create a temp directory for tests */
async function createTempDir(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), `hq-world-test-${prefix}-`));
}

// ============================================================================
// 1. Utility Tests
// ============================================================================

describe('Utilities', () => {
  it('generates valid transfer IDs', () => {
    const id = generateTransferId();
    expect(id).toMatch(/^txfr-[a-f0-9]{12}$/);
    expect(isValidTransferId(id)).toBe(true);
  });

  it('generates unique transfer IDs', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateTransferId());
    }
    expect(ids.size).toBe(100);
  });

  it('validates owner names', () => {
    expect(isValidOwnerName('stefan')).toBe(true);
    expect(isValidOwnerName('alex')).toBe(true);
    expect(isValidOwnerName('my-hq')).toBe(true);
    expect(isValidOwnerName('a1')).toBe(true);

    expect(isValidOwnerName('')).toBe(false);
    expect(isValidOwnerName('a')).toBe(false); // too short
    expect(isValidOwnerName('-start')).toBe(false);
    expect(isValidOwnerName('end-')).toBe(false);
    expect(isValidOwnerName('UPPER')).toBe(false);
    expect(isValidOwnerName('has spaces')).toBe(false);
  });

  it('validates hash strings', () => {
    const validHash = 'sha256:' + 'a'.repeat(64);
    expect(isValidHash(validHash)).toBe(true);

    expect(isValidHash('sha256:short')).toBe(false);
    expect(isValidHash('md5:' + 'a'.repeat(64))).toBe(false);
    expect(isValidHash('sha256:' + 'G'.repeat(64))).toBe(false); // uppercase
  });
});

// ============================================================================
// 2. Integrity / Hashing Tests
// ============================================================================

describe('Integrity', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir('integrity');
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('hashes a buffer deterministically', () => {
    const hash1 = hashBuffer('hello world');
    const hash2 = hashBuffer('hello world');
    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('produces different hashes for different content', () => {
    const hash1 = hashBuffer('hello');
    const hash2 = hashBuffer('world');
    expect(hash1).not.toBe(hash2);
  });

  it('hashes a file', async () => {
    const filePath = join(tempDir, 'test.txt');
    await writeFile(filePath, 'test content');
    const hash = await hashFile(filePath);
    expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);

    // Same content = same hash
    const filePath2 = join(tempDir, 'test2.txt');
    await writeFile(filePath2, 'test content');
    const hash2 = await hashFile(filePath2);
    expect(hash).toBe(hash2);
  });

  it('lists files recursively with forward slashes', async () => {
    await mkdir(join(tempDir, 'sub'), { recursive: true });
    await writeFile(join(tempDir, 'a.txt'), 'a');
    await writeFile(join(tempDir, 'sub', 'b.txt'), 'b');

    const files = await listFilesRecursive(tempDir);
    expect(files).toContain('a.txt');
    expect(files).toContain('sub/b.txt');
    expect(files).toHaveLength(2);
  });

  it('computes payload size', async () => {
    await writeFile(join(tempDir, 'file1.txt'), 'hello');
    await writeFile(join(tempDir, 'file2.txt'), 'world');

    const size = await computePayloadSize(tempDir);
    expect(size).toBe(10);
  });

  it('computes file hashes with optional prefix', async () => {
    await writeFile(join(tempDir, 'test.txt'), 'content');

    const hashesNoPrefix = await computeFileHashes(tempDir);
    expect(hashesNoPrefix.has('test.txt')).toBe(true);

    const hashesWithPrefix = await computeFileHashes(tempDir, 'payload');
    expect(hashesWithPrefix.has('payload/test.txt')).toBe(true);
  });

  it('computes aggregate payload hash deterministically', async () => {
    await mkdir(join(tempDir, 'sub'), { recursive: true });
    await writeFile(join(tempDir, 'manifest.yaml'), 'type: knowledge');
    await writeFile(join(tempDir, 'sub', 'data.md'), '# Test');

    const hash1 = await computePayloadHash(tempDir);
    const hash2 = await computePayloadHash(tempDir);
    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('generates and parses VERIFY.sha256', async () => {
    const bundleDir = join(tempDir, 'bundle');
    const payloadDir = join(bundleDir, 'payload');
    await mkdir(payloadDir, { recursive: true });
    await writeFile(join(payloadDir, 'manifest.yaml'), 'type: knowledge');
    await writeFile(join(payloadDir, 'data.md'), '# Data');

    const verifyContent = await generateVerifyFile(bundleDir);
    expect(verifyContent).toContain('payload/data.md');
    expect(verifyContent).toContain('payload/manifest.yaml');

    const parsed = parseVerifyFile(verifyContent);
    expect(parsed.size).toBe(2);
    expect(parsed.has('payload/data.md')).toBe(true);
    expect(parsed.has('payload/manifest.yaml')).toBe(true);
  });
});

// ============================================================================
// 3. Knowledge Export Tests
// ============================================================================

describe('Knowledge Export', () => {
  let hqRoot: string;
  let outputDir: string;

  beforeEach(async () => {
    hqRoot = await createTempDir('hq-a');
    outputDir = await createTempDir('export');

    // Create some knowledge files in the "HQ"
    await mkdir(join(hqRoot, 'knowledge', 'testing'), { recursive: true });
    await writeFile(
      join(hqRoot, 'knowledge', 'testing', 'e2e-learnings.md'),
      '# E2E Testing Patterns\n\nTest behavior, not implementation.\n',
    );
    await writeFile(
      join(hqRoot, 'knowledge', 'testing', 'fixtures.md'),
      '# Test Fixtures\n\nUse factory functions for test data.\n',
    );
  });

  afterEach(async () => {
    await rm(hqRoot, { recursive: true, force: true });
    await rm(outputDir, { recursive: true, force: true });
  });

  it('exports a single knowledge file as a transfer bundle', async () => {
    const result = await exportKnowledge({
      files: ['knowledge/testing/e2e-learnings.md'],
      domain: 'testing',
      to: 'alex',
      from: 'stefan',
      instanceId: 'stefan-hq-primary',
      hqRoot,
      outputDir,
      description: 'E2E testing patterns',
    });

    expect(result.transferId).toMatch(/^txfr-[a-f0-9]{12}$/);
    expect(result.fileCount).toBe(1);
    expect(result.payloadSize).toBeGreaterThan(0);
    expect(result.envelope.type).toBe('knowledge');
    expect(result.envelope.from).toBe('stefan');
    expect(result.envelope.to).toBe('alex');
    expect(result.envelope.version).toBe('v1');
    expect(result.envelope.transport).toBe('file');
    expect(result.envelope.supersedes).toBeNull();
    expect(result.envelope.sequence).toBe(1);

    // Verify bundle structure exists
    const bundlePath = result.bundlePath;
    await expect(stat(join(bundlePath, 'envelope.yaml'))).resolves.toBeDefined();
    await expect(stat(join(bundlePath, 'payload', 'manifest.yaml'))).resolves.toBeDefined();
    await expect(
      stat(join(bundlePath, 'payload', 'knowledge', 'e2e-learnings.md')),
    ).resolves.toBeDefined();
    await expect(stat(join(bundlePath, 'payload', 'metadata', 'provenance.yaml'))).resolves.toBeDefined();
    await expect(stat(join(bundlePath, 'VERIFY.sha256'))).resolves.toBeDefined();
  });

  it('exports a knowledge directory preserving structure', async () => {
    const result = await exportKnowledge({
      files: ['knowledge/testing'],
      domain: 'testing',
      to: 'alex',
      from: 'stefan',
      instanceId: 'stefan-hq-primary',
      hqRoot,
      outputDir,
      description: 'All testing knowledge',
    });

    expect(result.fileCount).toBe(2);

    // Both files should exist in the bundle
    await expect(
      stat(join(result.bundlePath, 'payload', 'knowledge', 'testing', 'e2e-learnings.md')),
    ).resolves.toBeDefined();
    await expect(
      stat(join(result.bundlePath, 'payload', 'knowledge', 'testing', 'fixtures.md')),
    ).resolves.toBeDefined();
  });

  it('produces a valid envelope YAML', async () => {
    const result = await exportKnowledge({
      files: ['knowledge/testing/e2e-learnings.md'],
      domain: 'testing',
      to: 'alex',
      from: 'stefan',
      instanceId: 'stefan-hq-primary',
      hqRoot,
      outputDir,
    });

    const envelopeContent = await readFile(join(result.bundlePath, 'envelope.yaml'), 'utf-8');
    const doc = yaml.load(envelopeContent) as { envelope: TransferEnvelope };

    expect(doc.envelope).toBeDefined();
    expect(doc.envelope.id).toBe(result.transferId);
    expect(doc.envelope.type).toBe('knowledge');
    expect(doc.envelope['payload-hash']).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(doc.envelope['payload-size']).toBeGreaterThan(0);
  });

  it('produces a valid payload manifest', async () => {
    const result = await exportKnowledge({
      files: ['knowledge/testing/e2e-learnings.md'],
      domain: 'testing',
      to: 'alex',
      from: 'stefan',
      instanceId: 'stefan-hq-primary',
      hqRoot,
      outputDir,
    });

    const manifestContent = await readFile(
      join(result.bundlePath, 'payload', 'manifest.yaml'),
      'utf-8',
    );
    const manifest = yaml.load(manifestContent) as KnowledgeManifest;

    expect(manifest.type).toBe('knowledge');
    expect(manifest.domain).toBe('testing');
    expect(manifest.items).toHaveLength(1);
    expect(manifest.items[0].path).toContain('knowledge/');
    expect(manifest.items[0].hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(manifest.items[0].size).toBeGreaterThan(0);
  });

  it('produces valid VERIFY.sha256 that passes verification', async () => {
    const result = await exportKnowledge({
      files: ['knowledge/testing/e2e-learnings.md'],
      domain: 'testing',
      to: 'alex',
      from: 'stefan',
      instanceId: 'stefan-hq-primary',
      hqRoot,
      outputDir,
    });

    const verification = await verifyBundle(
      result.bundlePath,
      result.envelope['payload-hash'],
      result.envelope['payload-size'],
    );

    expect(verification.valid).toBe(true);
    expect(verification.errors).toHaveLength(0);
  });

  it('supports supersedes and sequence for chain transfers', async () => {
    const result = await exportKnowledge({
      files: ['knowledge/testing/e2e-learnings.md'],
      domain: 'testing',
      to: 'alex',
      from: 'stefan',
      instanceId: 'stefan-hq-primary',
      hqRoot,
      outputDir,
      supersedes: 'txfr-aaa111bbb222',
      sequence: 2,
    });

    expect(result.envelope.supersedes).toBe('txfr-aaa111bbb222');
    expect(result.envelope.sequence).toBe(2);
  });
});

// ============================================================================
// 4. Worker Pattern Export Tests
// ============================================================================

describe('Worker Pattern Export', () => {
  let hqRoot: string;
  let outputDir: string;

  beforeEach(async () => {
    hqRoot = await createTempDir('hq-a-worker');
    outputDir = await createTempDir('export-worker');

    // Create a worker in the "HQ"
    const workerPath = join(hqRoot, 'workers', 'dev-team', 'qa-tester');
    await mkdir(join(workerPath, 'skills'), { recursive: true });

    await writeFile(
      join(workerPath, 'worker.yaml'),
      yaml.dump({
        id: 'qa-tester',
        type: 'CodeWorker',
        description: 'Automated testing specialist',
        skills: [
          { id: 'test-plan', description: 'Generate test plans', file: 'skills/test-plan.md' },
          { id: 'write-test', description: 'Write E2E tests', file: 'skills/write-test.md' },
        ],
        instructions: 'You are a QA testing specialist.',
      }),
    );

    await writeFile(
      join(workerPath, 'skills', 'test-plan.md'),
      '# Test Plan Skill\n\nGenerate structured test plans from PRDs.\n',
    );

    await writeFile(
      join(workerPath, 'skills', 'write-test.md'),
      '# Write Test Skill\n\nWrite E2E and integration tests.\n',
    );
  });

  afterEach(async () => {
    await rm(hqRoot, { recursive: true, force: true });
    await rm(outputDir, { recursive: true, force: true });
  });

  it('exports a worker pattern as a transfer bundle', async () => {
    const result = await exportWorkerPattern({
      workerDir: 'workers/dev-team/qa-tester',
      to: 'alex',
      from: 'stefan',
      instanceId: 'stefan-hq-primary',
      hqRoot,
      outputDir,
      description: 'QA tester worker pattern v2.1',
      patternVersion: '2.1',
    });

    expect(result.transferId).toMatch(/^txfr-[a-f0-9]{12}$/);
    expect(result.fileCount).toBe(3); // worker.yaml + 2 skills
    expect(result.envelope.type).toBe('worker-pattern');
    expect(result.envelope.from).toBe('stefan');
    expect(result.envelope.to).toBe('alex');

    // Verify bundle structure
    await expect(stat(join(result.bundlePath, 'envelope.yaml'))).resolves.toBeDefined();
    await expect(
      stat(join(result.bundlePath, 'payload', 'worker', 'worker.yaml')),
    ).resolves.toBeDefined();
    await expect(
      stat(join(result.bundlePath, 'payload', 'worker', 'skills', 'test-plan.md')),
    ).resolves.toBeDefined();
    await expect(
      stat(join(result.bundlePath, 'payload', 'worker', 'skills', 'write-test.md')),
    ).resolves.toBeDefined();
    await expect(
      stat(join(result.bundlePath, 'payload', 'metadata', 'adaptation.yaml')),
    ).resolves.toBeDefined();
    await expect(
      stat(join(result.bundlePath, 'payload', 'metadata', 'provenance.yaml')),
    ).resolves.toBeDefined();
  });

  it('produces a valid worker pattern manifest', async () => {
    const result = await exportWorkerPattern({
      workerDir: 'workers/dev-team/qa-tester',
      to: 'alex',
      from: 'stefan',
      instanceId: 'stefan-hq-primary',
      hqRoot,
      outputDir,
      patternVersion: '2.1',
    });

    const manifestContent = await readFile(
      join(result.bundlePath, 'payload', 'manifest.yaml'),
      'utf-8',
    );
    const manifest = yaml.load(manifestContent) as WorkerPatternManifest;

    expect(manifest.type).toBe('worker-pattern');
    expect(manifest['pattern-name']).toBe('qa-tester');
    expect(manifest['pattern-version']).toBe('2.1');
    expect(manifest.items.length).toBe(3);
  });

  it('passes integrity verification', async () => {
    const result = await exportWorkerPattern({
      workerDir: 'workers/dev-team/qa-tester',
      to: 'alex',
      from: 'stefan',
      instanceId: 'stefan-hq-primary',
      hqRoot,
      outputDir,
    });

    const verification = await verifyBundle(
      result.bundlePath,
      result.envelope['payload-hash'],
      result.envelope['payload-size'],
    );

    expect(verification.valid).toBe(true);
    expect(verification.errors).toHaveLength(0);
  });

  it('includes adaptation notes', async () => {
    const result = await exportWorkerPattern({
      workerDir: 'workers/dev-team/qa-tester',
      to: 'alex',
      from: 'stefan',
      instanceId: 'stefan-hq-primary',
      hqRoot,
      outputDir,
      patternVersion: '2.1',
      adaptation: {
        requires: {
          'knowledge-domains': ['testing', 'e2e'],
          tools: ['playwright', 'vitest'],
        },
        'customization-points': [
          {
            field: 'worker.yaml > instructions',
            guidance: 'Adapt to your testing conventions',
            priority: 'high',
          },
        ],
        'not-included': ['Knowledge files', 'CI/CD configuration'],
        'evolution-notes': 'Evolved through BrandStage and hq-cloud projects',
      },
    });

    const adaptationContent = await readFile(
      join(result.bundlePath, 'payload', 'metadata', 'adaptation.yaml'),
      'utf-8',
    );
    const adaptation = yaml.load(adaptationContent) as Record<string, unknown>;

    expect(adaptation['pattern-name']).toBe('qa-tester');
    expect(adaptation['pattern-version']).toBe('2.1');
    expect(adaptation['pattern-origin']).toBe('stefan');
  });
});

// ============================================================================
// 5. Import Preview Tests
// ============================================================================

describe('Import Preview', () => {
  let hqA: string;
  let hqB: string;
  let outputDir: string;

  beforeEach(async () => {
    hqA = await createTempDir('hq-a-import');
    hqB = await createTempDir('hq-b-import');
    outputDir = await createTempDir('export-import');

    // HQ-A has knowledge
    await mkdir(join(hqA, 'knowledge', 'testing'), { recursive: true });
    await writeFile(
      join(hqA, 'knowledge', 'testing', 'patterns.md'),
      '# Testing Patterns\n\nAlways test behavior.\n',
    );
  });

  afterEach(async () => {
    await rm(hqA, { recursive: true, force: true });
    await rm(hqB, { recursive: true, force: true });
    await rm(outputDir, { recursive: true, force: true });
  });

  it('generates a preview with valid envelope and manifest', async () => {
    const exportResult = await exportKnowledge({
      files: ['knowledge/testing/patterns.md'],
      domain: 'testing',
      to: 'alex',
      from: 'stefan',
      instanceId: 'stefan-hq-primary',
      hqRoot: hqA,
      outputDir,
      description: 'Testing patterns',
    });

    const preview = await previewImport({
      bundlePath: exportResult.bundlePath,
      hqRoot: hqB,
    });

    expect(preview.envelope.id).toBe(exportResult.transferId);
    expect(preview.envelope.type).toBe('knowledge');
    expect(preview.verification.valid).toBe(true);
    expect(preview.conflicts).toHaveLength(0);
    expect(preview.summary).toContain('Knowledge');
    expect(preview.summary).toContain('stefan');
    expect(preview.summary).toContain('verified');
  });

  it('detects tampering when bundle is modified', async () => {
    const exportResult = await exportKnowledge({
      files: ['knowledge/testing/patterns.md'],
      domain: 'testing',
      to: 'alex',
      from: 'stefan',
      instanceId: 'stefan-hq-primary',
      hqRoot: hqA,
      outputDir,
    });

    // Tamper with a payload file
    await writeFile(
      join(exportResult.bundlePath, 'payload', 'knowledge', 'patterns.md'),
      '# TAMPERED CONTENT\n',
    );

    const preview = await previewImport({
      bundlePath: exportResult.bundlePath,
      hqRoot: hqB,
    });

    expect(preview.verification.valid).toBe(false);
    expect(preview.verification.errors.length).toBeGreaterThan(0);
    expect(preview.verification.errors.some((e) => e.includes('HASH_MISMATCH'))).toBe(true);
  });

  it('reads envelope fields correctly', async () => {
    const exportResult = await exportKnowledge({
      files: ['knowledge/testing/patterns.md'],
      domain: 'testing',
      to: 'alex',
      from: 'stefan',
      instanceId: 'stefan-hq-primary',
      hqRoot: hqA,
      outputDir,
      description: 'Test description',
    });

    const envelope = await readEnvelope(exportResult.bundlePath);
    expect(envelope.id).toMatch(/^txfr-/);
    expect(envelope.type).toBe('knowledge');
    expect(envelope.from).toBe('stefan');
    expect(envelope.to).toBe('alex');
    expect(envelope.version).toBe('v1');
    expect(envelope.description).toBe('Test description');
    expect(envelope['payload-hash']).toMatch(/^sha256:/);
    expect(envelope.transport).toBe('file');
  });
});

// ============================================================================
// 6. Conflict Detection Tests
// ============================================================================

describe('Conflict Detection', () => {
  let hqA: string;
  let hqB: string;
  let outputDir: string;

  beforeEach(async () => {
    hqA = await createTempDir('hq-a-conflict');
    hqB = await createTempDir('hq-b-conflict');
    outputDir = await createTempDir('export-conflict');

    // HQ-A has knowledge
    await mkdir(join(hqA, 'knowledge', 'testing'), { recursive: true });
    await writeFile(
      join(hqA, 'knowledge', 'testing', 'patterns.md'),
      '# Testing Patterns v1\n\nOriginal content.\n',
    );
  });

  afterEach(async () => {
    await rm(hqA, { recursive: true, force: true });
    await rm(hqB, { recursive: true, force: true });
    await rm(outputDir, { recursive: true, force: true });
  });

  it('detects conflict when local content differs from source-path', async () => {
    // HQ-B already has a file at the source-path with different content
    await mkdir(join(hqB, 'knowledge', 'testing'), { recursive: true });
    await writeFile(
      join(hqB, 'knowledge', 'testing', 'patterns.md'),
      '# Testing Patterns v1 MODIFIED\n\nLocal modifications.\n',
    );

    const exportResult = await exportKnowledge({
      files: ['knowledge/testing/patterns.md'],
      domain: 'testing',
      to: 'alex',
      from: 'stefan',
      instanceId: 'stefan-hq-primary',
      hqRoot: hqA,
      outputDir,
    });

    const preview = await previewImport({
      bundlePath: exportResult.bundlePath,
      hqRoot: hqB,
    });

    expect(preview.conflicts.length).toBeGreaterThan(0);
    expect(preview.conflicts[0].localPath).toBe('knowledge/testing/patterns.md');
  });

  it('reports no conflicts when no local file exists at source-path', async () => {
    // HQ-B has no conflicting file
    const exportResult = await exportKnowledge({
      files: ['knowledge/testing/patterns.md'],
      domain: 'testing',
      to: 'alex',
      from: 'stefan',
      instanceId: 'stefan-hq-primary',
      hqRoot: hqA,
      outputDir,
    });

    const preview = await previewImport({
      bundlePath: exportResult.bundlePath,
      hqRoot: hqB,
    });

    expect(preview.conflicts).toHaveLength(0);
  });

  it('detects conflict from integration record when content was modified', async () => {
    // Simulate a previous integration
    await mkdir(join(hqB, 'knowledge', 'testing'), { recursive: true });
    const originalContent = '# Original integrated content\n';
    await writeFile(join(hqB, 'knowledge', 'testing', 'patterns.md'), originalContent);
    const originalHash = hashBuffer(originalContent);

    // Now modify it locally
    await writeFile(
      join(hqB, 'knowledge', 'testing', 'patterns.md'),
      '# Modified locally after integration\n',
    );

    const exportResult = await exportKnowledge({
      files: ['knowledge/testing/patterns.md'],
      domain: 'testing',
      to: 'alex',
      from: 'stefan',
      instanceId: 'stefan-hq-primary',
      hqRoot: hqA,
      outputDir,
    });

    const manifest = await readPayloadManifest(exportResult.bundlePath);

    const conflicts = await detectConflicts(
      exportResult.bundlePath,
      manifest,
      hqB,
      [
        {
          transferId: 'txfr-previous-001',
          integratedTo: 'knowledge/testing/patterns.md',
          integrationHash: originalHash,
        },
      ],
    );

    expect(conflicts.length).toBeGreaterThan(0);
    expect(conflicts[0].description).toContain('modified since integration');
  });
});

// ============================================================================
// 7. Transfer Log Tests
// ============================================================================

describe('Transfer Log', () => {
  let hqRoot: string;

  beforeEach(async () => {
    hqRoot = await createTempDir('hq-log');
  });

  afterEach(async () => {
    await rm(hqRoot, { recursive: true, force: true });
  });

  it('logs an export event', async () => {
    const envelope: TransferEnvelope = {
      id: 'txfr-test00000001',
      type: 'knowledge',
      from: 'stefan',
      to: 'alex',
      timestamp: '2026-02-16T14:30:00Z',
      version: 'v1',
      description: 'Test transfer',
      'payload-hash': 'sha256:' + 'a'.repeat(64),
      'payload-size': 1024,
      supersedes: null,
      sequence: 1,
      transport: 'file',
    };

    await logExport(hqRoot, envelope);

    const entries = await readTransferLog(hqRoot, '2026-02-16');
    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe('txfr-test00000001');
    expect(entries[0].event).toBe('sent');
    expect(entries[0].direction).toBe('outbound');
    expect(entries[0].type).toBe('knowledge');
  });

  it('logs receive and approval events', async () => {
    const envelope: TransferEnvelope = {
      id: 'txfr-test00000002',
      type: 'worker-pattern',
      from: 'alex',
      to: 'stefan',
      timestamp: '2026-02-16T15:00:00Z',
      version: 'v1',
      'payload-hash': 'sha256:' + 'b'.repeat(64),
      'payload-size': 2048,
      supersedes: null,
      sequence: 1,
      transport: 'file',
    };

    await logReceive(hqRoot, envelope, 'workspace/world/inbox/alex/worker-pattern/qa-tester/');

    // Approval uses today's date
    await logApproval(hqRoot, 'txfr-test00000002', 'alex', 'worker-pattern', 'stefan');

    // Read today's log
    const entries = await readTransferLog(hqRoot);
    const receiveEntry = entries.find((e) => e.event === 'received');
    const approvalEntry = entries.find((e) => e.event === 'approved');

    expect(receiveEntry).toBeDefined();
    expect(receiveEntry!.id).toBe('txfr-test00000002');
    expect(receiveEntry!['staged-to']).toContain('inbox');

    expect(approvalEntry).toBeDefined();
    expect(approvalEntry!['approved-by']).toBe('stefan');
  });

  it('logs integration events with hash', async () => {
    await logIntegration(
      hqRoot,
      'txfr-test00000003',
      'alex',
      'knowledge',
      'knowledge/testing/patterns.md',
      'sha256:' + 'c'.repeat(64),
    );

    const entries = await readTransferLog(hqRoot);
    const intEntry = entries.find((e) => e.event === 'integrated');
    expect(intEntry).toBeDefined();
    expect(intEntry!['integrated-to']).toBe('knowledge/testing/patterns.md');
    expect(intEntry!['integration-hash']).toBe('sha256:' + 'c'.repeat(64));
  });

  it('appends multiple entries to the same daily log', async () => {
    const envelope1: TransferEnvelope = {
      id: 'txfr-test00000004',
      type: 'knowledge',
      from: 'stefan',
      to: 'alex',
      timestamp: '2026-02-16T10:00:00Z',
      version: 'v1',
      'payload-hash': 'sha256:' + 'd'.repeat(64),
      'payload-size': 100,
      supersedes: null,
      sequence: 1,
      transport: 'file',
    };
    const envelope2: TransferEnvelope = {
      id: 'txfr-test00000005',
      type: 'knowledge',
      from: 'stefan',
      to: 'alex',
      timestamp: '2026-02-16T11:00:00Z',
      version: 'v1',
      'payload-hash': 'sha256:' + 'e'.repeat(64),
      'payload-size': 200,
      supersedes: null,
      sequence: 1,
      transport: 'file',
    };

    await logExport(hqRoot, envelope1);
    await logExport(hqRoot, envelope2);

    const entries = await readTransferLog(hqRoot, '2026-02-16');
    expect(entries).toHaveLength(2);
  });
});

// ============================================================================
// 8. Staging Tests
// ============================================================================

describe('Staging (Import Approval)', () => {
  let hqA: string;
  let hqB: string;
  let outputDir: string;

  beforeEach(async () => {
    hqA = await createTempDir('hq-a-stage');
    hqB = await createTempDir('hq-b-stage');
    outputDir = await createTempDir('export-stage');

    await mkdir(join(hqA, 'knowledge', 'testing'), { recursive: true });
    await writeFile(
      join(hqA, 'knowledge', 'testing', 'patterns.md'),
      '# Testing Patterns\n\nContent for staging test.\n',
    );
  });

  afterEach(async () => {
    await rm(hqA, { recursive: true, force: true });
    await rm(hqB, { recursive: true, force: true });
    await rm(outputDir, { recursive: true, force: true });
  });

  it('stages a knowledge transfer to the inbox', async () => {
    const exportResult = await exportKnowledge({
      files: ['knowledge/testing/patterns.md'],
      domain: 'testing',
      to: 'alex',
      from: 'stefan',
      instanceId: 'stefan-hq-primary',
      hqRoot: hqA,
      outputDir,
    });

    const stageResult = await stageTransfer({
      bundlePath: exportResult.bundlePath,
      hqRoot: hqB,
    });

    expect(stageResult.transferId).toBe(exportResult.transferId);
    expect(stageResult.stagedTo).toContain('inbox');
    expect(stageResult.stagedTo).toContain('stefan');
    expect(stageResult.stagedTo).toContain('knowledge');
    expect(stageResult.fileCount).toBeGreaterThan(0);

    // Verify the staged files exist
    const stagedDir = join(hqB, stageResult.stagedTo);
    await expect(stat(join(stagedDir, 'envelope.yaml'))).resolves.toBeDefined();
    await expect(stat(join(stagedDir, 'payload', 'manifest.yaml'))).resolves.toBeDefined();
  });

  it('stages a worker pattern transfer', async () => {
    // Create worker in HQ-A
    const workerPath = join(hqA, 'workers', 'dev-team', 'test-worker');
    await mkdir(join(workerPath, 'skills'), { recursive: true });
    await writeFile(
      join(workerPath, 'worker.yaml'),
      yaml.dump({ id: 'test-worker', type: 'CodeWorker', description: 'Test' }),
    );
    await writeFile(join(workerPath, 'skills', 'test-skill.md'), '# Test Skill\n');

    const exportResult = await exportWorkerPattern({
      workerDir: 'workers/dev-team/test-worker',
      to: 'alex',
      from: 'stefan',
      instanceId: 'stefan-hq-primary',
      hqRoot: hqA,
      outputDir,
    });

    const stageResult = await stageTransfer({
      bundlePath: exportResult.bundlePath,
      hqRoot: hqB,
    });

    expect(stageResult.stagedTo).toContain('worker-pattern');
    expect(stageResult.stagedTo).toContain('test-worker');
  });
});

// ============================================================================
// 9. Round-Trip Test: Export from HQ-A -> Import to HQ-B -> Verify Match
// ============================================================================

describe('Round-Trip Test', () => {
  let hqA: string;
  let hqB: string;
  let exportDir: string;

  beforeEach(async () => {
    hqA = await createTempDir('hq-a-roundtrip');
    hqB = await createTempDir('hq-b-roundtrip');
    exportDir = await createTempDir('export-roundtrip');
  });

  afterEach(async () => {
    await rm(hqA, { recursive: true, force: true });
    await rm(hqB, { recursive: true, force: true });
    await rm(exportDir, { recursive: true, force: true });
  });

  it('knowledge round-trip: export from HQ-A, import to HQ-B, verify content matches', async () => {
    // Setup HQ-A with knowledge
    await mkdir(join(hqA, 'knowledge', 'testing'), { recursive: true });
    const originalContent = '# E2E Testing Patterns\n\nTest behavior, not implementation.\nUse fixtures for test data.\nClean up in teardown.\n';
    await writeFile(
      join(hqA, 'knowledge', 'testing', 'e2e-learnings.md'),
      originalContent,
    );

    // Step 1: HQ-A exports knowledge
    const exportResult = await exportKnowledge({
      files: ['knowledge/testing/e2e-learnings.md'],
      domain: 'testing',
      to: 'alex',
      from: 'stefan',
      instanceId: 'stefan-hq-primary',
      hqRoot: hqA,
      outputDir: exportDir,
      description: 'E2E testing patterns for Synesis project',
    });

    // Step 2: Log the export on HQ-A
    await logExport(hqA, exportResult.envelope);

    // Verify export log on HQ-A
    const exportLogs = await readTransferLog(hqA, exportResult.envelope.timestamp.split('T')[0]);
    expect(exportLogs.some((e) => e.event === 'sent' && e.id === exportResult.transferId)).toBe(true);

    // Step 3: HQ-B previews the import
    const preview = await previewImport({
      bundlePath: exportResult.bundlePath,
      hqRoot: hqB,
    });

    // Verify preview
    expect(preview.verification.valid).toBe(true);
    expect(preview.envelope.from).toBe('stefan');
    expect(preview.envelope.to).toBe('alex');
    expect(preview.envelope.type).toBe('knowledge');
    expect(preview.conflicts).toHaveLength(0);
    expect(preview.summary).toContain('verified');

    // Step 4: HQ-B approves and stages
    const stageResult = await stageTransfer({
      bundlePath: exportResult.bundlePath,
      hqRoot: hqB,
    });

    // Step 5: Log receive on HQ-B
    await logReceive(hqB, exportResult.envelope, stageResult.stagedTo);

    // Step 6: Log approval on HQ-B
    await logApproval(hqB, exportResult.transferId, 'stefan', 'knowledge', 'alex');

    // Step 7: Verify the staged content matches the original
    const stagedContentPath = join(
      hqB,
      stageResult.stagedTo,
      'payload',
      'knowledge',
      'e2e-learnings.md',
    );
    const stagedContent = await readFile(stagedContentPath, 'utf-8');
    expect(stagedContent).toBe(originalContent);

    // Step 8: Verify hashes match end-to-end
    const originalHash = await hashFile(join(hqA, 'knowledge', 'testing', 'e2e-learnings.md'));
    const stagedHash = await hashFile(stagedContentPath);
    expect(stagedHash).toBe(originalHash);

    // Step 9: Verify transfer log on HQ-B
    const importLogs = await readTransferLog(hqB);
    expect(importLogs.some((e) => e.event === 'received' && e.id === exportResult.transferId)).toBe(true);
    expect(importLogs.some((e) => e.event === 'approved' && e.id === exportResult.transferId)).toBe(true);
  });

  it('worker pattern round-trip: export from HQ-A, import to HQ-B, verify content matches', async () => {
    // Setup HQ-A with a worker
    const workerDir = join(hqA, 'workers', 'dev-team', 'qa-tester');
    await mkdir(join(workerDir, 'skills'), { recursive: true });

    const workerYamlContent = yaml.dump({
      id: 'qa-tester',
      type: 'CodeWorker',
      description: 'Automated testing specialist',
      skills: [
        { id: 'test-plan', description: 'Generate test plans', file: 'skills/test-plan.md' },
      ],
      instructions: 'Test behavior, not implementation.',
    });
    await writeFile(join(workerDir, 'worker.yaml'), workerYamlContent);

    const skillContent = '# Test Plan Skill\n\nGenerate structured test plans from PRDs and acceptance criteria.\n';
    await writeFile(join(workerDir, 'skills', 'test-plan.md'), skillContent);

    // Step 1: Export from HQ-A
    const exportResult = await exportWorkerPattern({
      workerDir: 'workers/dev-team/qa-tester',
      to: 'alex',
      from: 'stefan',
      instanceId: 'stefan-hq-primary',
      hqRoot: hqA,
      outputDir: exportDir,
      patternVersion: '2.1',
      description: 'QA tester worker pattern',
      adaptation: {
        requires: {
          'knowledge-domains': ['testing'],
          tools: ['vitest'],
        },
        'customization-points': [
          { field: 'worker.yaml > instructions', guidance: 'Adapt to your stack', priority: 'high' },
        ],
      },
    });

    // Log export
    await logExport(hqA, exportResult.envelope);

    // Step 2: Preview on HQ-B
    const preview = await previewImport({
      bundlePath: exportResult.bundlePath,
      hqRoot: hqB,
    });

    expect(preview.verification.valid).toBe(true);
    expect(preview.envelope.type).toBe('worker-pattern');
    expect(preview.adaptation).toBeDefined();
    expect(preview.adaptation!['pattern-name']).toBe('qa-tester');
    expect(preview.summary).toContain('Worker Pattern');
    expect(preview.summary).toContain('qa-tester');

    // Step 3: Stage on HQ-B
    const stageResult = await stageTransfer({
      bundlePath: exportResult.bundlePath,
      hqRoot: hqB,
    });

    // Step 4: Verify staged content matches original
    const stagedWorkerYaml = await readFile(
      join(hqB, stageResult.stagedTo, 'payload', 'worker', 'worker.yaml'),
      'utf-8',
    );
    expect(stagedWorkerYaml).toBe(workerYamlContent);

    const stagedSkill = await readFile(
      join(hqB, stageResult.stagedTo, 'payload', 'worker', 'skills', 'test-plan.md'),
      'utf-8',
    );
    expect(stagedSkill).toBe(skillContent);

    // Step 5: Verify hashes match
    const originalWorkerHash = await hashFile(join(workerDir, 'worker.yaml'));
    const stagedWorkerHash = await hashFile(
      join(hqB, stageResult.stagedTo, 'payload', 'worker', 'worker.yaml'),
    );
    expect(stagedWorkerHash).toBe(originalWorkerHash);
  });

  it('full lifecycle with transfer log entries at every step', async () => {
    // Setup
    await mkdir(join(hqA, 'knowledge'), { recursive: true });
    await writeFile(join(hqA, 'knowledge', 'guide.md'), '# Guide\n\nHow to do things.\n');

    // Export
    const exportResult = await exportKnowledge({
      files: ['knowledge/guide.md'],
      domain: 'general',
      to: 'alex',
      from: 'stefan',
      instanceId: 'stefan-hq-primary',
      hqRoot: hqA,
      outputDir: exportDir,
      description: 'General guide',
    });
    await logExport(hqA, exportResult.envelope);

    // Import preview
    const preview = await previewImport({
      bundlePath: exportResult.bundlePath,
      hqRoot: hqB,
    });
    expect(preview.verification.valid).toBe(true);

    // Stage
    const stageResult = await stageTransfer({
      bundlePath: exportResult.bundlePath,
      hqRoot: hqB,
    });

    // Log receive
    await logReceive(hqB, exportResult.envelope, stageResult.stagedTo);

    // Log approval
    await logApproval(hqB, exportResult.transferId, 'stefan', 'knowledge', 'alex');

    // Simulate integration
    const stagedFilePath = join(
      hqB,
      stageResult.stagedTo,
      'payload',
      'knowledge',
      'guide.md',
    );
    const integrationHash = await hashFile(stagedFilePath);
    await logIntegration(
      hqB,
      exportResult.transferId,
      'stefan',
      'knowledge',
      'knowledge/guide.md',
      integrationHash,
    );

    // Verify complete log on HQ-B
    const logs = await readTransferLog(hqB);
    const events = logs.map((e) => e.event);
    expect(events).toContain('received');
    expect(events).toContain('approved');
    expect(events).toContain('integrated');

    // Verify complete log on HQ-A
    const exportLogs = await readTransferLog(hqA, exportResult.envelope.timestamp.split('T')[0]);
    expect(exportLogs.some((e) => e.event === 'sent')).toBe(true);
  });
});

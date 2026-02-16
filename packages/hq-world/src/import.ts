/**
 * Import module — reads transfer bundles, verifies integrity,
 * displays preview, and stages content for human approval.
 *
 * The human approval gate is central to the World Protocol:
 * no transfer is integrated without explicit operator consent.
 */

import { readFile, mkdir, cp, stat, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import yaml from 'js-yaml';

import type {
  TransferEnvelope,
  EnvelopeDocument,
  PayloadManifest,
  KnowledgeManifest,
  WorkerPatternManifest,
  ContextManifest,
  Adaptation,
} from './types/index.js';

import { verifyBundle, hashFile, type VerificationResult } from './integrity.js';

/** Import preview — what the operator sees before approving */
export interface ImportPreview {
  /** Transfer envelope */
  envelope: TransferEnvelope;

  /** Parsed payload manifest */
  manifest: PayloadManifest;

  /** Integrity verification result */
  verification: VerificationResult;

  /** Detected conflicts with existing local content */
  conflicts: ConflictInfo[];

  /** Adaptation notes (worker-pattern only) */
  adaptation?: Adaptation;

  /** Human-readable summary for display */
  summary: string;
}

/** Information about a content conflict */
export interface ConflictInfo {
  /** Path in the payload */
  payloadPath: string;

  /** Path in the local HQ that conflicts */
  localPath: string;

  /** Hash of the incoming content */
  incomingHash: string;

  /** Hash of the local content */
  localHash: string;

  /** Description of the conflict */
  description: string;
}

/** Options for importing a transfer bundle */
export interface ImportOptions {
  /** Path to the transfer bundle directory */
  bundlePath: string;

  /** HQ root directory (for conflict detection) */
  hqRoot: string;

  /** Transfer log entries for conflict detection (previously integrated) */
  transferLog?: IntegrationRecord[];
}

/** Record of a previously integrated transfer (for conflict detection) */
export interface IntegrationRecord {
  /** Transfer ID */
  transferId: string;

  /** Where the content was integrated */
  integratedTo: string;

  /** Hash at integration time */
  integrationHash: string;
}

/** Options for staging an approved import */
export interface StageOptions {
  /** Path to the transfer bundle directory */
  bundlePath: string;

  /** HQ root directory */
  hqRoot: string;
}

/** Result of staging */
export interface StageResult {
  /** Where the transfer was staged */
  stagedTo: string;

  /** Transfer ID */
  transferId: string;

  /** Number of files staged */
  fileCount: number;
}

/**
 * Read and validate a transfer bundle's envelope.
 */
export async function readEnvelope(bundlePath: string): Promise<TransferEnvelope> {
  const envelopePath = join(bundlePath, 'envelope.yaml');
  const content = await readFile(envelopePath, 'utf-8');
  const doc = yaml.load(content) as EnvelopeDocument;

  if (!doc.envelope) {
    throw new Error('ERR_TXFR_MALFORMED: envelope.yaml missing top-level "envelope" key');
  }

  const env = doc.envelope;

  // Validate required fields
  const requiredFields: Array<keyof TransferEnvelope> = [
    'id',
    'type',
    'from',
    'to',
    'timestamp',
    'version',
    'payload-hash',
    'payload-size',
    'transport',
  ];

  for (const field of requiredFields) {
    if (env[field] === undefined || env[field] === null) {
      throw new Error(`ERR_TXFR_MALFORMED: required field "${field}" missing from envelope`);
    }
  }

  // Validate transfer type
  const validTypes = ['knowledge', 'worker-pattern', 'context', 'system'];
  if (!validTypes.includes(env.type)) {
    throw new Error(`ERR_TXFR_UNKNOWN_TYPE: "${env.type}" is not a valid transfer type`);
  }

  // Validate transport
  const validTransports = ['file', 'git', 'http', 'hiamp'];
  if (!validTransports.includes(env.transport)) {
    throw new Error(`ERR_TXFR_MALFORMED: "${env.transport}" is not a valid transport`);
  }

  return env;
}

/**
 * Read the payload manifest from a transfer bundle.
 */
export async function readPayloadManifest(bundlePath: string): Promise<PayloadManifest> {
  const manifestPath = join(bundlePath, 'payload', 'manifest.yaml');
  const content = await readFile(manifestPath, 'utf-8');
  return yaml.load(content) as PayloadManifest;
}

/**
 * Read adaptation notes from a worker-pattern transfer bundle.
 */
export async function readAdaptation(bundlePath: string): Promise<Adaptation | undefined> {
  try {
    const adaptationPath = join(bundlePath, 'payload', 'metadata', 'adaptation.yaml');
    const content = await readFile(adaptationPath, 'utf-8');
    return yaml.load(content) as Adaptation;
  } catch {
    return undefined;
  }
}

/**
 * Detect conflicts between incoming transfer content and existing local content.
 *
 * A conflict occurs when:
 * 1. A previous transfer was integrated locally
 * 2. The local content was modified since integration
 * 3. A new transfer supersedes the previous one
 */
export async function detectConflicts(
  bundlePath: string,
  manifest: PayloadManifest,
  hqRoot: string,
  integrationRecords: IntegrationRecord[],
): Promise<ConflictInfo[]> {
  const conflicts: ConflictInfo[] = [];

  if (manifest.type === 'system') return conflicts;

  for (const item of manifest.items) {
    // Check if any integration record maps to an existing local file
    for (const record of integrationRecords) {
      const localPath = join(hqRoot, record.integratedTo);
      try {
        await stat(localPath);
        // File exists — check if it was modified since integration
        const currentHash = await hashFile(localPath);
        if (currentHash !== record.integrationHash) {
          conflicts.push({
            payloadPath: item.path,
            localPath: record.integratedTo,
            incomingHash: item.hash,
            localHash: currentHash,
            description: `Local file "${record.integratedTo}" was modified since integration of transfer ${record.transferId}. Incoming content differs from both the integrated version and the current local version.`,
          });
        }
      } catch {
        // File does not exist locally — no conflict
      }
    }

    // Also check for simple path-based collisions (knowledge files)
    if (manifest.type === 'knowledge') {
      const knowledgeItem = item as { 'source-path'?: string; path: string; hash: string };
      if (knowledgeItem['source-path']) {
        const localPath = join(hqRoot, knowledgeItem['source-path']);
        try {
          await stat(localPath);
          const currentHash = await hashFile(localPath);
          if (currentHash !== knowledgeItem.hash) {
            // Only report if not already reported via integration records
            const alreadyReported = conflicts.some(
              (c) => c.localPath === knowledgeItem['source-path'],
            );
            if (!alreadyReported) {
              conflicts.push({
                payloadPath: knowledgeItem.path,
                localPath: knowledgeItem['source-path'],
                incomingHash: knowledgeItem.hash,
                localHash: currentHash,
                description: `A file already exists at "${knowledgeItem['source-path']}" with different content. The incoming transfer contains a different version.`,
              });
            }
          }
        } catch {
          // File does not exist — no collision
        }
      }
    }
  }

  return conflicts;
}

/**
 * Generate a human-readable preview of a transfer bundle.
 */
export async function previewImport(options: ImportOptions): Promise<ImportPreview> {
  const { bundlePath, hqRoot, transferLog = [] } = options;

  // Read envelope
  const envelope = await readEnvelope(bundlePath);

  // Verify integrity
  const verification = await verifyBundle(
    bundlePath,
    envelope['payload-hash'],
    envelope['payload-size'],
  );

  // Read manifest
  const manifest = await readPayloadManifest(bundlePath);

  // Read adaptation (worker-pattern only)
  const adaptation =
    envelope.type === 'worker-pattern' ? await readAdaptation(bundlePath) : undefined;

  // Detect conflicts
  const conflicts = await detectConflicts(bundlePath, manifest, hqRoot, transferLog);

  // Generate summary
  const summary = generateSummary(envelope, manifest, verification, conflicts, adaptation);

  return {
    envelope,
    manifest,
    verification,
    conflicts,
    adaptation,
    summary,
  };
}

/**
 * Stage an approved transfer to the inbox.
 */
export async function stageTransfer(options: StageOptions): Promise<StageResult> {
  const { bundlePath, hqRoot } = options;

  const envelope = await readEnvelope(bundlePath);
  const manifest = await readPayloadManifest(bundlePath);

  // Determine staging path based on transfer type
  let stagingSubPath: string;
  switch (envelope.type) {
    case 'knowledge':
      stagingSubPath = join('workspace', 'world', 'inbox', envelope.from, 'knowledge', envelope.id);
      break;
    case 'worker-pattern': {
      const wpManifest = manifest as WorkerPatternManifest;
      stagingSubPath = join(
        'workspace',
        'world',
        'inbox',
        envelope.from,
        'worker-pattern',
        wpManifest['pattern-name'],
      );
      break;
    }
    case 'context': {
      const ctxManifest = manifest as ContextManifest;
      stagingSubPath = join(
        'workspace',
        'world',
        'inbox',
        envelope.from,
        'context',
        ctxManifest.project,
      );
      break;
    }
    default:
      stagingSubPath = join('workspace', 'world', 'inbox', envelope.from, envelope.type, envelope.id);
  }

  const stagingPath = join(hqRoot, stagingSubPath);
  await mkdir(stagingPath, { recursive: true });

  // Copy entire bundle to staging
  await cp(bundlePath, stagingPath, { recursive: true });

  // Count files in payload
  const payloadDir = join(bundlePath, 'payload');
  let fileCount = 0;
  async function countFiles(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile()) fileCount++;
      else if (entry.isDirectory()) await countFiles(join(dir, entry.name));
    }
  }
  await countFiles(payloadDir);

  return {
    stagedTo: stagingSubPath,
    transferId: envelope.id,
    fileCount,
  };
}

/**
 * Generate a human-readable summary string for the import preview.
 */
function generateSummary(
  envelope: TransferEnvelope,
  manifest: PayloadManifest,
  verification: VerificationResult,
  conflicts: ConflictInfo[],
  adaptation?: Adaptation,
): string {
  const lines: string[] = [];
  lines.push('Transfer Preview:');
  lines.push(`  From: ${envelope.from}`);
  lines.push(`  Type: ${formatTransferType(envelope.type)}`);

  if (manifest.type === 'knowledge') {
    const km = manifest as KnowledgeManifest;
    lines.push(`  Domain: ${km.domain}`);
    lines.push(`  Files: ${km.items.length} knowledge file(s)`);
    for (const item of km.items) {
      lines.push(`    - ${item.path} (${item.size} bytes) -- ${item.description}`);
    }
  } else if (manifest.type === 'worker-pattern') {
    const wm = manifest as WorkerPatternManifest;
    lines.push(`  Worker: ${wm['pattern-name']} (v${wm['pattern-version']})`);
    lines.push(`  Files: ${wm.items.length} file(s)`);
    for (const item of wm.items) {
      lines.push(`    - ${item.path} (${item.size} bytes) -- ${item.description}`);
    }
  } else if (manifest.type === 'context') {
    const cm = manifest as ContextManifest;
    lines.push(`  Project: ${cm.project}`);
    lines.push(`  Snapshot: ${cm['snapshot-at']}`);
    lines.push(`  Files: ${cm.items.length} file(s)`);
  }

  lines.push(`  Total size: ${envelope['payload-size']} bytes`);
  lines.push(`  Hash: ${verification.valid ? 'verified' : 'FAILED'}`);

  if (envelope.supersedes) {
    lines.push(`  Chain: sequence ${envelope.sequence}, supersedes ${envelope.supersedes}`);
  } else {
    lines.push('  Chain: new (first transfer)');
  }

  if (!verification.valid) {
    lines.push('');
    lines.push('  INTEGRITY ERRORS:');
    for (const error of verification.errors) {
      lines.push(`    - ${error}`);
    }
  }

  if (conflicts.length > 0) {
    lines.push('');
    lines.push('  CONFLICTS DETECTED:');
    for (const conflict of conflicts) {
      lines.push(`    - ${conflict.description}`);
    }
  }

  if (adaptation) {
    lines.push('');
    lines.push('  Customization Required:');
    for (const cp of adaptation['customization-points']) {
      const priority = (cp.priority ?? 'medium').toUpperCase();
      lines.push(`    [${priority}] ${cp.field} -- ${cp.guidance}`);
    }

    if (adaptation['not-included'] && adaptation['not-included'].length > 0) {
      lines.push('');
      lines.push('  Not Included:');
      for (const note of adaptation['not-included']) {
        lines.push(`    - ${note}`);
      }
    }
  }

  if (envelope.description) {
    lines.push('');
    lines.push(`  Description: ${envelope.description.trim()}`);
  }

  return lines.join('\n');
}

/** Format transfer type for display */
function formatTransferType(type: string): string {
  switch (type) {
    case 'knowledge':
      return 'Knowledge';
    case 'worker-pattern':
      return 'Worker Pattern (pollination)';
    case 'context':
      return 'Context';
    case 'system':
      return 'System';
    default:
      return type;
  }
}

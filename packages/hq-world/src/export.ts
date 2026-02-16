/**
 * Export module — creates transfer bundles from HQ content.
 *
 * Supports:
 * - Knowledge transfers: export knowledge files/directories
 * - Worker pattern transfers: export worker.yaml + skills
 */

import { mkdir, readFile, writeFile, copyFile, stat } from 'node:fs/promises';
import { join, basename, dirname, relative, posix } from 'node:path';
import yaml from 'js-yaml';

import type {
  TransferEnvelope,
  EnvelopeDocument,
  TransferType,
  KnowledgeManifest,
  KnowledgeManifestItem,
  WorkerPatternManifest,
  WorkerPatternManifestItem,
  Provenance,
  ProvenanceEvent,
  Adaptation,
} from './types/index.js';

import {
  hashFile,
  computePayloadHash,
  computePayloadSize,
  generateVerifyFile,
  listFilesRecursive,
} from './integrity.js';

import { generateTransferId, utcNow } from './utils.js';

/** Options for exporting knowledge */
export interface ExportKnowledgeOptions {
  /** Paths to knowledge files/directories to export (relative to HQ root) */
  files: string[];

  /** Primary knowledge domain label */
  domain: string;

  /** Target peer owner name */
  to: string;

  /** Sender owner name */
  from: string;

  /** Sender instance ID */
  instanceId: string;

  /** HQ root directory */
  hqRoot: string;

  /** Output directory for the transfer bundle */
  outputDir: string;

  /** Human-readable description */
  description?: string;

  /** Supersedes a previous transfer */
  supersedes?: string | null;

  /** Sequence number in chain */
  sequence?: number;
}

/** Options for exporting a worker pattern */
export interface ExportWorkerPatternOptions {
  /** Path to the worker directory (relative to HQ root) */
  workerDir: string;

  /** Target peer owner name */
  to: string;

  /** Sender owner name */
  from: string;

  /** Sender instance ID */
  instanceId: string;

  /** HQ root directory */
  hqRoot: string;

  /** Output directory for the transfer bundle */
  outputDir: string;

  /** Human-readable description */
  description?: string;

  /** Pattern version */
  patternVersion?: string;

  /** Adaptation notes */
  adaptation?: Partial<Adaptation>;

  /** Supersedes a previous transfer */
  supersedes?: string | null;

  /** Sequence number in chain */
  sequence?: number;
}

/** Result of an export operation */
export interface ExportResult {
  /** Generated transfer ID */
  transferId: string;

  /** Path to the created bundle directory */
  bundlePath: string;

  /** Transfer envelope */
  envelope: TransferEnvelope;

  /** Payload hash */
  payloadHash: string;

  /** Payload size in bytes */
  payloadSize: number;

  /** Number of files in the payload */
  fileCount: number;
}

/**
 * Export knowledge files into a transfer bundle.
 */
export async function exportKnowledge(options: ExportKnowledgeOptions): Promise<ExportResult> {
  const transferId = generateTransferId();
  const timestamp = utcNow();
  const bundlePath = join(options.outputDir, transferId);

  // Create bundle structure
  const payloadDir = join(bundlePath, 'payload');
  const knowledgeDir = join(payloadDir, 'knowledge');
  const metadataDir = join(payloadDir, 'metadata');
  await mkdir(knowledgeDir, { recursive: true });
  await mkdir(metadataDir, { recursive: true });

  // Copy knowledge files into payload
  const items: KnowledgeManifestItem[] = [];
  let fileCount = 0;

  for (const filePath of options.files) {
    const absolutePath = join(options.hqRoot, filePath);
    const fileStat = await stat(absolutePath);

    if (fileStat.isFile()) {
      // Single file
      const fileName = basename(filePath);
      const destPath = join(knowledgeDir, fileName);
      await copyFile(absolutePath, destPath);

      const hash = await hashFile(destPath);
      const size = fileStat.size;

      items.push({
        path: `knowledge/${fileName}`,
        domain: options.domain,
        description: `Knowledge file: ${fileName}`,
        'source-path': filePath.split('\\').join('/'),
        hash,
        size,
        format: getFileFormat(fileName),
      });
      fileCount++;
    } else if (fileStat.isDirectory()) {
      // Directory — copy recursively
      const dirFiles = await listFilesRecursive(absolutePath);
      for (const relFile of dirFiles) {
        const srcFile = join(absolutePath, relFile);
        const dirName = basename(filePath);
        const destFile = join(knowledgeDir, dirName, relFile);
        await mkdir(dirname(destFile), { recursive: true });
        await copyFile(srcFile, destFile);

        const hash = await hashFile(destFile);
        const s = await stat(destFile);

        items.push({
          path: `knowledge/${dirName}/${relFile}`,
          domain: options.domain,
          description: `Knowledge file: ${relFile}`,
          'source-path': posix.join(filePath.split('\\').join('/'), relFile),
          hash,
          size: s.size,
          format: getFileFormat(relFile),
        });
        fileCount++;
      }
    }
  }

  // Write payload manifest
  const manifest: KnowledgeManifest = {
    type: 'knowledge',
    domain: options.domain,
    items,
  };
  await writeFile(join(payloadDir, 'manifest.yaml'), yaml.dump(manifest, { lineWidth: -1 }));

  // Write provenance
  const provenance: Provenance = {
    origin: {
      owner: options.from,
      'instance-id': options.instanceId,
      'transferred-at': timestamp,
    },
    history: [
      {
        event: 'transferred',
        by: options.from,
        to: options.to,
        at: timestamp,
        note: options.description ?? `Knowledge transfer: ${options.domain}`,
      },
    ],
  };
  await writeFile(join(metadataDir, 'provenance.yaml'), yaml.dump(provenance, { lineWidth: -1 }));

  // Compute integrity
  const payloadHash = await computePayloadHash(payloadDir);
  const payloadSize = await computePayloadSize(payloadDir);

  // Write envelope
  const envelope: TransferEnvelope = {
    id: transferId,
    type: 'knowledge',
    from: options.from,
    to: options.to,
    timestamp,
    version: 'v1',
    description: options.description,
    'payload-hash': payloadHash,
    'payload-size': payloadSize,
    supersedes: options.supersedes ?? null,
    sequence: options.sequence ?? 1,
    transport: 'file',
  };

  const envelopeDoc: EnvelopeDocument = { envelope };
  await writeFile(join(bundlePath, 'envelope.yaml'), yaml.dump(envelopeDoc, { lineWidth: -1 }));

  // Write VERIFY.sha256
  const verifyContent = await generateVerifyFile(bundlePath);
  await writeFile(join(bundlePath, 'VERIFY.sha256'), verifyContent);

  return {
    transferId,
    bundlePath,
    envelope,
    payloadHash,
    payloadSize,
    fileCount,
  };
}

/**
 * Export a worker pattern into a transfer bundle.
 */
export async function exportWorkerPattern(
  options: ExportWorkerPatternOptions,
): Promise<ExportResult> {
  const transferId = generateTransferId();
  const timestamp = utcNow();
  const bundlePath = join(options.outputDir, transferId);

  // Create bundle structure
  const payloadDir = join(bundlePath, 'payload');
  const workerDir = join(payloadDir, 'worker');
  const metadataDir = join(payloadDir, 'metadata');
  await mkdir(workerDir, { recursive: true });
  await mkdir(metadataDir, { recursive: true });

  const absoluteWorkerDir = join(options.hqRoot, options.workerDir);
  const items: WorkerPatternManifestItem[] = [];
  let fileCount = 0;

  // Copy worker.yaml
  const workerYamlSrc = join(absoluteWorkerDir, 'worker.yaml');
  const workerYamlDest = join(workerDir, 'worker.yaml');
  await copyFile(workerYamlSrc, workerYamlDest);

  const workerYamlHash = await hashFile(workerYamlDest);
  const workerYamlStat = await stat(workerYamlDest);
  items.push({
    path: 'worker/worker.yaml',
    description: 'Worker definition',
    hash: workerYamlHash,
    size: workerYamlStat.size,
  });
  fileCount++;

  // Read worker.yaml to get worker metadata
  const workerContent = yaml.load(await readFile(workerYamlSrc, 'utf-8')) as Record<string, unknown>;
  const workerId = (workerContent.id as string) ?? basename(options.workerDir);
  const patternVersion = options.patternVersion ?? '1.0';

  // Copy skills directory if it exists
  const skillsDir = join(absoluteWorkerDir, 'skills');
  try {
    const skillsStat = await stat(skillsDir);
    if (skillsStat.isDirectory()) {
      const skillFiles = await listFilesRecursive(skillsDir);
      const destSkillsDir = join(workerDir, 'skills');
      await mkdir(destSkillsDir, { recursive: true });

      for (const skillFile of skillFiles) {
        const src = join(skillsDir, skillFile);
        const dest = join(destSkillsDir, skillFile);
        await mkdir(dirname(dest), { recursive: true });
        await copyFile(src, dest);

        const hash = await hashFile(dest);
        const s = await stat(dest);
        items.push({
          path: `worker/skills/${skillFile}`,
          description: `Skill: ${basename(skillFile, '.md')}`,
          hash,
          size: s.size,
        });
        fileCount++;
      }
    }
  } catch {
    // No skills directory — that's fine
  }

  // Write payload manifest
  const manifest: WorkerPatternManifest = {
    type: 'worker-pattern',
    'pattern-name': workerId,
    'pattern-version': patternVersion,
    items,
  };
  await writeFile(join(payloadDir, 'manifest.yaml'), yaml.dump(manifest, { lineWidth: -1 }));

  // Write provenance
  const provenance: Provenance = {
    origin: {
      owner: options.from,
      'instance-id': options.instanceId,
      'transferred-at': timestamp,
    },
    history: [
      {
        event: 'transferred',
        by: options.from,
        to: options.to,
        at: timestamp,
        note:
          options.description ?? `Worker pattern transfer: ${workerId} v${patternVersion}`,
      },
    ],
  };
  await writeFile(join(metadataDir, 'provenance.yaml'), yaml.dump(provenance, { lineWidth: -1 }));

  // Write adaptation notes
  const adaptation: Adaptation = {
    'pattern-name': workerId,
    'pattern-version': patternVersion,
    'pattern-origin': options.from,
    requires: options.adaptation?.requires,
    'customization-points': options.adaptation?.['customization-points'] ?? [
      {
        field: 'worker.yaml > instructions',
        guidance: 'Adapt to your project conventions and frameworks',
        priority: 'high',
      },
    ],
    'not-included': options.adaptation?.['not-included'],
    'evolution-notes': options.adaptation?.['evolution-notes'],
  };
  await writeFile(join(metadataDir, 'adaptation.yaml'), yaml.dump(adaptation, { lineWidth: -1 }));

  // Compute integrity
  const payloadHash = await computePayloadHash(payloadDir);
  const payloadSize = await computePayloadSize(payloadDir);

  // Write envelope
  const envelope: TransferEnvelope = {
    id: transferId,
    type: 'worker-pattern',
    from: options.from,
    to: options.to,
    timestamp,
    version: 'v1',
    description:
      options.description ?? `Worker pattern: ${workerId} v${patternVersion}`,
    'payload-hash': payloadHash,
    'payload-size': payloadSize,
    supersedes: options.supersedes ?? null,
    sequence: options.sequence ?? 1,
    transport: 'file',
  };

  const envelopeDoc: EnvelopeDocument = { envelope };
  await writeFile(join(bundlePath, 'envelope.yaml'), yaml.dump(envelopeDoc, { lineWidth: -1 }));

  // Write VERIFY.sha256
  const verifyContent = await generateVerifyFile(bundlePath);
  await writeFile(join(bundlePath, 'VERIFY.sha256'), verifyContent);

  return {
    transferId,
    bundlePath,
    envelope,
    payloadHash,
    payloadSize,
    fileCount,
  };
}

/** Determine file format from extension */
function getFileFormat(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'md':
      return 'markdown';
    case 'yaml':
    case 'yml':
      return 'yaml';
    case 'json':
      return 'json';
    default:
      return 'text';
  }
}

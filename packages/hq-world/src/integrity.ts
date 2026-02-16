/**
 * Integrity & verification utilities for the World Protocol.
 *
 * All hashes use SHA-256 with the format: sha256:{64 lowercase hex chars}
 *
 * Payload hash is computed as SHA-256 of all individual file hashes
 * concatenated in lexicographic order of their paths.
 */

import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, relative, posix } from 'node:path';

/**
 * Compute the SHA-256 hash of a file's contents.
 * Returns in the format: sha256:{64 hex chars}
 */
export async function hashFile(filePath: string): Promise<string> {
  const content = await readFile(filePath);
  return hashBuffer(content);
}

/**
 * Compute the SHA-256 hash of a buffer.
 * Returns in the format: sha256:{64 hex chars}
 */
export function hashBuffer(content: Buffer | string): string {
  const hash = createHash('sha256');
  hash.update(content);
  return `sha256:${hash.digest('hex')}`;
}

/**
 * Recursively list all files in a directory, returning paths
 * relative to the given root, using forward slashes (posix).
 */
export async function listFilesRecursive(dir: string, root?: string): Promise<string[]> {
  const effectiveRoot = root ?? dir;
  const files: string[] = [];

  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      const subFiles = await listFilesRecursive(fullPath, effectiveRoot);
      files.push(...subFiles);
    } else if (entry.isFile()) {
      const relPath = relative(effectiveRoot, fullPath).split('\\').join('/');
      files.push(relPath);
    }
  }

  return files.sort();
}

/**
 * Compute the total size in bytes of all files in a directory.
 */
export async function computePayloadSize(payloadDir: string): Promise<number> {
  const files = await listFilesRecursive(payloadDir);
  let totalSize = 0;
  for (const file of files) {
    const fullPath = join(payloadDir, file);
    const s = await stat(fullPath);
    totalSize += s.size;
  }
  return totalSize;
}

/**
 * Compute per-file hashes for all files in a directory.
 * Returns a map of relative path -> sha256 hash.
 * Paths use forward slashes (posix style).
 */
export async function computeFileHashes(
  dir: string,
  pathPrefix?: string,
): Promise<Map<string, string>> {
  const files = await listFilesRecursive(dir);
  const hashes = new Map<string, string>();

  for (const file of files) {
    const fullPath = join(dir, file);
    const hash = await hashFile(fullPath);
    const key = pathPrefix ? posix.join(pathPrefix, file) : file;
    hashes.set(key, hash);
  }

  return hashes;
}

/**
 * Compute the aggregate payload hash.
 *
 * Algorithm: SHA-256 of all individual file hashes concatenated
 * in lexicographic order of their paths (relative to payload/).
 */
export async function computePayloadHash(payloadDir: string): Promise<string> {
  const fileHashes = await computeFileHashes(payloadDir);

  // Sort by path (lexicographic, ASCII)
  const sortedPaths = Array.from(fileHashes.keys()).sort();

  // Concatenate hex digests (without the sha256: prefix)
  const concatenated = sortedPaths
    .map((path) => {
      const hash = fileHashes.get(path)!;
      return hash.replace('sha256:', '');
    })
    .join('');

  return hashBuffer(concatenated);
}

/**
 * Generate the VERIFY.sha256 content for a bundle.
 * Format: sha256:{64 hex}  {relative path from bundle root}
 *
 * Only includes files under payload/.
 */
export async function generateVerifyFile(
  bundleDir: string,
): Promise<string> {
  const payloadDir = join(bundleDir, 'payload');
  const fileHashes = await computeFileHashes(payloadDir, 'payload');

  const sortedPaths = Array.from(fileHashes.keys()).sort();
  const lines = sortedPaths.map((path) => {
    const hash = fileHashes.get(path)!;
    return `${hash}  ${path}`;
  });

  return lines.join('\n') + '\n';
}

/**
 * Parse a VERIFY.sha256 file into a map of path -> hash.
 */
export function parseVerifyFile(content: string): Map<string, string> {
  const hashes = new Map<string, string>();
  const lines = content.trim().split('\n');

  for (const line of lines) {
    if (!line.trim()) continue;
    // Format: sha256:{64 hex}  path
    const match = line.match(/^(sha256:[a-f0-9]{64})\s{2}(.+)$/);
    if (match) {
      hashes.set(match[2], match[1]);
    }
  }

  return hashes;
}

/** Result of integrity verification */
export interface VerificationResult {
  valid: boolean;
  errors: string[];
  /** Individual file verification results */
  fileResults: Array<{
    path: string;
    expected: string;
    actual: string;
    match: boolean;
  }>;
}

/**
 * Verify the integrity of a transfer bundle.
 *
 * Steps:
 * 1. Check payload size against envelope
 * 2. Verify VERIFY.sha256 file hashes
 * 3. Verify aggregate payload hash against envelope
 */
export async function verifyBundle(
  bundleDir: string,
  expectedPayloadHash: string,
  expectedPayloadSize: number,
): Promise<VerificationResult> {
  const errors: string[] = [];
  const fileResults: VerificationResult['fileResults'] = [];

  const payloadDir = join(bundleDir, 'payload');

  // Step 1: Check payload size
  const actualSize = await computePayloadSize(payloadDir);
  if (actualSize !== expectedPayloadSize) {
    errors.push(
      `ERR_TXFR_SIZE_MISMATCH: expected ${expectedPayloadSize} bytes, got ${actualSize} bytes`,
    );
  }

  // Step 2: Verify VERIFY.sha256
  const verifyFilePath = join(bundleDir, 'VERIFY.sha256');
  let verifyContent: string;
  try {
    verifyContent = await readFile(verifyFilePath, 'utf-8');
  } catch {
    errors.push('ERR_TXFR_MALFORMED: VERIFY.sha256 file not found');
    return { valid: false, errors, fileResults };
  }

  const expectedHashes = parseVerifyFile(verifyContent);
  const actualHashes = await computeFileHashes(payloadDir, 'payload');

  for (const [path, expectedHash] of expectedHashes) {
    const actualHash = actualHashes.get(path);
    if (!actualHash) {
      errors.push(`ERR_TXFR_HASH_MISMATCH: file ${path} listed in VERIFY.sha256 not found`);
      fileResults.push({ path, expected: expectedHash, actual: 'MISSING', match: false });
    } else if (actualHash !== expectedHash) {
      errors.push(
        `ERR_TXFR_HASH_MISMATCH: file ${path} hash mismatch (expected ${expectedHash}, got ${actualHash})`,
      );
      fileResults.push({ path, expected: expectedHash, actual: actualHash, match: false });
    } else {
      fileResults.push({ path, expected: expectedHash, actual: actualHash, match: true });
    }
  }

  // Step 3: Verify aggregate payload hash
  const actualPayloadHash = await computePayloadHash(payloadDir);
  if (actualPayloadHash !== expectedPayloadHash) {
    errors.push(
      `ERR_TXFR_HASH_MISMATCH: aggregate payload hash mismatch (expected ${expectedPayloadHash}, got ${actualPayloadHash})`,
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    fileResults,
  };
}

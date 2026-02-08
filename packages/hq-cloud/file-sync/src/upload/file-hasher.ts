/**
 * File hasher for content-addressable deduplication.
 *
 * Computes SHA-256 or MD5 hashes of files using Node.js crypto streams.
 * Streaming approach keeps memory usage constant regardless of file size.
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import type { HashAlgorithm, FileHashResult } from './types.js';

/**
 * Compute the hash of a file using a streaming approach.
 *
 * @param filePath - Absolute path to the file
 * @param algorithm - Hash algorithm to use (sha256 or md5)
 * @returns Hash result with hex digest and file size
 * @throws If the file cannot be read
 */
export async function hashFile(
  filePath: string,
  algorithm: HashAlgorithm = 'sha256'
): Promise<FileHashResult> {
  return new Promise<FileHashResult>((resolve, reject) => {
    const hash = crypto.createHash(algorithm);
    let sizeBytes = 0;

    const stream = fs.createReadStream(filePath);

    stream.on('data', (chunk: string | Buffer) => {
      sizeBytes += chunk.length;
      hash.update(chunk);
    });

    stream.on('end', () => {
      resolve({
        hash: hash.digest('hex'),
        algorithm,
        sizeBytes,
      });
    });

    stream.on('error', (err: Error) => {
      reject(new Error(`Failed to hash file ${filePath}: ${err.message}`));
    });
  });
}

/**
 * Compute hash of a Buffer (useful for testing or in-memory content).
 *
 * @param content - Buffer to hash
 * @param algorithm - Hash algorithm to use
 * @returns Hash result with hex digest
 */
export function hashBuffer(
  content: Buffer,
  algorithm: HashAlgorithm = 'sha256'
): FileHashResult {
  const hash = crypto.createHash(algorithm);
  hash.update(content);

  return {
    hash: hash.digest('hex'),
    algorithm,
    sizeBytes: content.length,
  };
}

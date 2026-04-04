/**
 * Integrity verification — SHA256 hash and RSA signature checks (US-005)
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { findHqRoot } from './hq-root.js';

/**
 * Verify a file's SHA256 hash matches the expected value.
 */
export async function verifySha256(
  filePath: string,
  expectedHash: string
): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);

    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => {
      const computed = hash.digest('hex');
      resolve(computed === expectedHash.toLowerCase());
    });
    stream.on('error', reject);
  });
}

/**
 * Verify an RSA signature of a SHA256 hash using the registry public key.
 * The public key is expected at packages/.keys/registry-public.pem.
 * Returns false (does not throw) if the key file is missing.
 */
export function verifyRsaSignature(
  sha256Hash: string,
  signature: string,
  publicKeyPath?: string
): boolean {
  const keyPath =
    publicKeyPath ??
    path.resolve(findHqRoot(), 'packages', '.keys', 'registry-public.pem');

  if (!fs.existsSync(keyPath)) {
    return false;
  }

  const publicKey = fs.readFileSync(keyPath, 'utf-8');
  const verifier = crypto.createVerify('SHA256');
  verifier.update(sha256Hash);
  verifier.end();

  return verifier.verify(publicKey, Buffer.from(signature, 'base64'));
}

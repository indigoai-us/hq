import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

const CACHE_DIR = path.join(os.homedir(), ".hq", "secrets-cache");
const KEY_PATH = path.join(CACHE_DIR, ".key");
const TTL_MS = 5 * 60 * 1000;
const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;

function ensureCacheDir(companyUid: string): void {
  const dir = path.join(CACHE_DIR, companyUid);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
}

function validateInputs(companyUid: string, name: string): boolean {
  if (!companyUid || companyUid.includes("/") || companyUid.includes("..")) return false;
  if (!/^[A-Z][A-Z0-9_]*(?:\/[A-Z][A-Z0-9_]+)*$/.test(name)) return false;
  return true;
}

function getOrCreateKey(): Buffer {
  try {
    const key = fs.readFileSync(KEY_PATH);
    if (key.length === 32) {
      const mode = fs.statSync(KEY_PATH).mode & 0o777;
      if (mode !== 0o600) {
        process.stderr.write(`Warning: secrets cache key has permissions ${mode.toString(8)}, expected 600\n`);
      }
      return key;
    }
  } catch {
    // Key doesn't exist or is unreadable — generate a new one
  }
  fs.mkdirSync(CACHE_DIR, { recursive: true, mode: 0o700 });
  const key = crypto.randomBytes(32);
  const tmpPath = `${KEY_PATH}.tmp.${process.pid}`;
  fs.writeFileSync(tmpPath, key, { mode: 0o600 });
  fs.renameSync(tmpPath, KEY_PATH);
  return fs.readFileSync(KEY_PATH);
}

export function readCache(companyUid: string, name: string): string | null {
  if (!validateInputs(companyUid, name)) return null;
  const filePath = path.join(CACHE_DIR, companyUid, name);
  let raw: Buffer;
  try {
    raw = fs.readFileSync(filePath);
  } catch {
    return null;
  }

  // Format: [8 bytes timestamp][12 bytes IV][16 bytes authTag][...ciphertext]
  const headerLen = 8 + IV_BYTES + AUTH_TAG_BYTES;
  if (raw.length < headerLen) return null;

  const timestampMs = Number(raw.readBigInt64BE(0));
  if (Date.now() - timestampMs > TTL_MS) {
    try { fs.unlinkSync(filePath); } catch { /* ok */ }
    return null;
  }

  const iv = raw.subarray(8, 8 + IV_BYTES);
  const authTag = raw.subarray(8 + IV_BYTES, headerLen);
  const ciphertext = raw.subarray(headerLen);

  let key: Buffer;
  try {
    key = getOrCreateKey();
  } catch {
    return null;
  }

  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString("utf8");
  } catch {
    try { fs.unlinkSync(filePath); } catch { /* ok */ }
    return null;
  }
}

export function writeCache(companyUid: string, name: string, value: string): void {
  try {
    if (!validateInputs(companyUid, name)) return;
    ensureCacheDir(companyUid);
    const key = getOrCreateKey();
    const iv = crypto.randomBytes(IV_BYTES);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();

    const timestamp = Buffer.alloc(8);
    timestamp.writeBigInt64BE(BigInt(Date.now()));

    const out = Buffer.concat([timestamp, iv, authTag, encrypted]);
    const filePath = path.join(CACHE_DIR, companyUid, name);
    fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
    const tmpPath = `${filePath}.tmp.${process.pid}`;
    fs.writeFileSync(tmpPath, out, { mode: 0o600 });
    fs.renameSync(tmpPath, filePath);
  } catch {
    // Cache write failure is non-fatal
  }
}

export function removeCacheEntry(companyUid: string, name: string): void {
  if (!validateInputs(companyUid, name)) return;
  const filePath = path.join(CACHE_DIR, companyUid, name);
  try {
    fs.unlinkSync(filePath);
  } catch {
    // Cache entry may not exist
  }
}

export function clearAllCache(): { removed: number } {
  let removed = 0;
  try {
    fs.rmSync(CACHE_DIR, { recursive: true, force: true });
    removed = 1;
  } catch {
    // Cache dir may not exist
  }
  return { removed };
}

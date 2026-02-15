/**
 * Sync utilities for hq-cloud file synchronization.
 *
 * Provides local manifest computation, file hashing, upload/download helpers,
 * and diff computation via the API proxy. No AWS credentials needed — all
 * operations go through the authenticated hq-cloud API.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { apiRequest } from './api-client.js';

// ── Ignore patterns ──────────────────────────────────────────────────────────

/** Directories and patterns to skip during local file scanning. */
const IGNORE_DIRS = new Set([
  '.git',
  'node_modules',
  '.claude',
  'dist',
  'cdk.out',
  '.next',
  '__pycache__',
  '.turbo',
]);

/** File extensions to skip. */
const IGNORE_EXTENSIONS = new Set([
  '.log',
]);

/** Top-level files to skip. */
const IGNORE_FILES = new Set([
  '.DS_Store',
  'Thumbs.db',
  '.env',
  '.env.local',
]);

/**
 * Check whether a relative path should be ignored during sync.
 */
export function shouldIgnore(relativePath: string): boolean {
  const parts = relativePath.split(/[/\\]/);

  // Skip if any path segment matches an ignored directory
  for (const part of parts) {
    if (IGNORE_DIRS.has(part)) {
      return true;
    }
  }

  // Skip ignored file names
  const fileName = parts[parts.length - 1];
  if (IGNORE_FILES.has(fileName)) {
    return true;
  }

  // Skip ignored extensions
  const ext = path.extname(fileName).toLowerCase();
  if (IGNORE_EXTENSIONS.has(ext)) {
    return true;
  }

  return false;
}

// ── File hashing ─────────────────────────────────────────────────────────────

/**
 * Compute the SHA-256 hash of a file's contents.
 */
export function hashFile(filePath: string): string {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Compute the SHA-256 hash of a buffer.
 */
export function hashBuffer(content: Buffer): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

// ── Manifest types ───────────────────────────────────────────────────────────

/** A single entry in the local file manifest. */
export interface ManifestEntry {
  /** Relative path from HQ root (forward slashes) */
  path: string;
  /** SHA-256 hash of file content */
  hash: string;
  /** File size in bytes */
  size: number;
  /** Last modified time (ISO string) */
  lastModified: string;
}

/** Response from POST /api/files/sync */
export interface SyncDiffResult {
  /** Relative paths that the client should upload (local is newer) */
  toUpload: string[];
  /** Relative paths that the client should download (remote is newer) */
  toDownload: string[];
}

/** Response from GET /api/files/quota */
export interface QuotaInfo {
  used: number;
  limit: number;
  percentage: number;
}

/** Sync state persisted to .hq-cloud-sync.json */
export interface CloudSyncState {
  /** Whether a background sync watcher is running */
  running: boolean;
  /** PID of the background watcher process (if running) */
  pid?: number;
  /** ISO timestamp of last successful sync */
  lastSync?: string;
  /** Number of files tracked at last sync */
  fileCount?: number;
  /** Errors from last sync attempt */
  errors: string[];
}

// ── Local manifest computation ───────────────────────────────────────────────

/**
 * Recursively walk a directory and collect all files, respecting ignore rules.
 * Returns paths relative to rootDir, using forward slashes.
 */
export function walkDir(rootDir: string, subDir: string = ''): string[] {
  const results: string[] = [];
  const absDir = subDir ? path.join(rootDir, subDir) : rootDir;

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(absDir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    const relativePath = subDir
      ? `${subDir}/${entry.name}`
      : entry.name;

    if (entry.isDirectory()) {
      if (!IGNORE_DIRS.has(entry.name)) {
        results.push(...walkDir(rootDir, relativePath));
      }
    } else if (entry.isFile()) {
      if (!shouldIgnore(relativePath)) {
        results.push(relativePath);
      }
    }
    // Skip symlinks, sockets, etc.
  }

  return results;
}

/**
 * Compute the local file manifest for an HQ root directory.
 * Walks all non-ignored files, computes hashes, and returns manifest entries.
 */
export function computeLocalManifest(hqRoot: string): ManifestEntry[] {
  const files = walkDir(hqRoot);
  const manifest: ManifestEntry[] = [];

  for (const relativePath of files) {
    const absPath = path.join(hqRoot, relativePath);
    try {
      const stat = fs.statSync(absPath);
      const hash = hashFile(absPath);
      manifest.push({
        path: relativePath,
        hash,
        size: stat.size,
        lastModified: stat.mtime.toISOString(),
      });
    } catch {
      // File may have been deleted between walk and stat — skip
    }
  }

  return manifest;
}

// ── API operations ───────────────────────────────────────────────────────────

/**
 * Compute the diff between local and remote state via the API.
 * Sends the local manifest to POST /api/files/sync and receives
 * lists of files to upload and download.
 */
export async function syncDiff(hqRoot: string): Promise<SyncDiffResult> {
  const manifest = computeLocalManifest(hqRoot);
  const resp = await apiRequest<SyncDiffResult>('POST', '/api/files/sync', { manifest });

  if (!resp.ok || !resp.data) {
    throw new Error(`Sync diff failed: ${resp.error ?? `HTTP ${resp.status}`}`);
  }

  return resp.data;
}

/**
 * Upload a single file to the cloud via POST /api/files/upload.
 * File content is base64-encoded in the request body.
 */
export async function uploadFile(filePath: string, hqRoot: string): Promise<void> {
  const absPath = path.join(hqRoot, filePath);
  const content = fs.readFileSync(absPath);
  const stat = fs.statSync(absPath);

  const resp = await apiRequest('POST', '/api/files/upload', {
    path: filePath,
    content: content.toString('base64'),
    size: stat.size,
  });

  if (!resp.ok) {
    throw new Error(`Upload failed for ${filePath}: ${resp.error ?? `HTTP ${resp.status}`}`);
  }
}

/**
 * Download a single file from the cloud via GET /api/files/download.
 * Writes the file to the local HQ root, creating directories as needed.
 */
export async function downloadFile(remotePath: string, hqRoot: string): Promise<void> {
  const encodedPath = encodeURIComponent(remotePath);
  const resp = await apiRequest<{ content: string; size: number }>(
    'GET',
    `/api/files/download?path=${encodedPath}`,
  );

  if (!resp.ok || !resp.data) {
    throw new Error(`Download failed for ${remotePath}: ${resp.error ?? `HTTP ${resp.status}`}`);
  }

  const absPath = path.join(hqRoot, remotePath);
  const dir = path.dirname(absPath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const buffer = Buffer.from(resp.data.content, 'base64');
  fs.writeFileSync(absPath, buffer);
}

/**
 * Get storage quota information from the API.
 */
export async function getQuota(): Promise<QuotaInfo> {
  const resp = await apiRequest<QuotaInfo>('GET', '/api/files/quota');

  if (!resp.ok || !resp.data) {
    throw new Error(`Quota check failed: ${resp.error ?? `HTTP ${resp.status}`}`);
  }

  return resp.data;
}

// ── Sync state management ────────────────────────────────────────────────────

const SYNC_STATE_FILE = '.hq-cloud-sync.json';

/**
 * Get the path to the sync state file.
 */
export function getSyncStatePath(hqRoot: string): string {
  return path.join(hqRoot, SYNC_STATE_FILE);
}

/**
 * Read the persisted sync state. Returns a default state if no file exists.
 */
export function readSyncState(hqRoot: string): CloudSyncState {
  const statePath = getSyncStatePath(hqRoot);
  try {
    if (fs.existsSync(statePath)) {
      const raw = fs.readFileSync(statePath, 'utf-8');
      return JSON.parse(raw) as CloudSyncState;
    }
  } catch {
    // Corrupted state file — return default
  }
  return { running: false, errors: [] };
}

/**
 * Write the sync state to disk.
 */
export function writeSyncState(hqRoot: string, state: CloudSyncState): void {
  const statePath = getSyncStatePath(hqRoot);
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
}

// ── Full push / pull operations ──────────────────────────────────────────────

/**
 * Push all changed local files to the cloud.
 * Uses the sync diff endpoint to determine what needs uploading, then uploads each file.
 * Returns the number of files uploaded.
 */
export async function pushChanges(hqRoot: string): Promise<{ uploaded: number; errors: string[] }> {
  const diff = await syncDiff(hqRoot);
  const errors: string[] = [];
  let uploaded = 0;

  for (const filePath of diff.toUpload) {
    try {
      await uploadFile(filePath, hqRoot);
      uploaded++;
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  return { uploaded, errors };
}

/**
 * Pull all changed remote files to local.
 * Uses the sync diff endpoint to determine what needs downloading, then downloads each file.
 * Returns the number of files downloaded.
 */
export async function pullChanges(hqRoot: string): Promise<{ downloaded: number; errors: string[] }> {
  const diff = await syncDiff(hqRoot);
  const errors: string[] = [];
  let downloaded = 0;

  for (const filePath of diff.toDownload) {
    try {
      await downloadFile(filePath, hqRoot);
      downloaded++;
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  return { downloaded, errors };
}

/**
 * Run a full bidirectional sync: upload local changes, then download remote changes.
 */
export async function fullSync(hqRoot: string): Promise<{ uploaded: number; downloaded: number; errors: string[] }> {
  const diff = await syncDiff(hqRoot);
  const errors: string[] = [];
  let uploaded = 0;
  let downloaded = 0;

  // Upload first
  for (const filePath of diff.toUpload) {
    try {
      await uploadFile(filePath, hqRoot);
      uploaded++;
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  // Then download
  for (const filePath of diff.toDownload) {
    try {
      await downloadFile(filePath, hqRoot);
      downloaded++;
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  return { uploaded, downloaded, errors };
}

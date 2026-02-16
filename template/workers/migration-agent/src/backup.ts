/**
 * Backup manifest generation and verification utilities.
 *
 * Extracted from skills/execute.md Steps 2c-2d.
 */

export interface BackupManifest {
  version: string;
  timestamp: string;
  hqVersion: string;
  hqPath: string;
  fileCount: number;
  symlinkCount: number;
  totalSizeBytes: number;
  totalSizeHuman: string;
  excludedDirs: string[];
  platform: string;
  backupMethod: string;
  symlinkHandling: string;
}

/**
 * Convert bytes to human-readable size string.
 * Follows the human_size function from execute.md.
 */
export function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${Math.floor(bytes / 1024)} KB`;
  if (bytes < 1073741824)
    return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(1)} GB`;
}

/**
 * Generate a backup manifest from file inventory data.
 */
export function generateManifest(params: {
  timestamp: string;
  hqVersion: string;
  hqPath: string;
  fileCount: number;
  symlinkCount: number;
  totalSizeBytes: number;
  platform: string;
  backupMethod: string;
}): BackupManifest {
  return {
    version: "1.0",
    timestamp: params.timestamp,
    hqVersion: params.hqVersion,
    hqPath: params.hqPath,
    fileCount: params.fileCount,
    symlinkCount: params.symlinkCount,
    totalSizeBytes: params.totalSizeBytes,
    totalSizeHuman: humanSize(params.totalSizeBytes),
    excludedDirs: ["node_modules", ".git", ".hq-backup", "repos"],
    platform: params.platform,
    backupMethod: params.backupMethod,
    symlinkHandling: "preserved-as-symlinks",
  };
}

/**
 * Verify a backup by comparing file counts.
 * Returns verification status.
 *
 * From execute.md section 2d:
 * - Exact match = VERIFIED
 * - Within tolerance of 2 = VERIFIED (within tolerance)
 * - Otherwise = MISMATCH
 */
export function verifyBackup(
  sourceFileCount: number,
  backupFileCount: number
): { status: string; difference: number } {
  const diff = sourceFileCount - backupFileCount;

  if (diff === 0) {
    return { status: "VERIFIED", difference: 0 };
  }
  if (Math.abs(diff) <= 2) {
    return {
      status: `VERIFIED (within tolerance: ${diff} files)`,
      difference: diff,
    };
  }
  return { status: "MISMATCH", difference: diff };
}

/**
 * Verify a restore by comparing file counts.
 * Wider tolerance (5 files) than backup verification.
 *
 * From skills/restore.md section 5a.
 */
export function verifyRestore(
  expectedCount: number,
  actualCount: number
): { status: string; difference: number } {
  const diff = actualCount - expectedCount;

  if (Math.abs(diff) <= 5) {
    return { status: "MATCH", difference: diff };
  }
  return { status: "MISMATCH", difference: diff };
}

/**
 * Parse a backup manifest JSON string.
 * Returns null if parsing fails.
 */
export function parseManifest(json: string): BackupManifest | null {
  try {
    const parsed = JSON.parse(json);
    // Validate required fields
    if (
      typeof parsed.version !== "string" ||
      typeof parsed.fileCount !== "number" ||
      typeof parsed.timestamp !== "string"
    ) {
      return null;
    }
    return parsed as BackupManifest;
  } catch {
    return null;
  }
}

/**
 * Validate that a manifest has all required fields and reasonable values.
 */
export function validateManifest(manifest: BackupManifest): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!manifest.version) errors.push("Missing version field");
  if (!manifest.timestamp) errors.push("Missing timestamp field");
  if (manifest.fileCount < 0) errors.push("Negative file count");
  if (manifest.totalSizeBytes < 0) errors.push("Negative total size");
  if (manifest.fileCount === 0) errors.push("File count is zero (suspicious)");
  if (!manifest.hqPath) errors.push("Missing HQ path");

  const validPlatforms = ["macos", "linux", "windows-bash", "unknown"];
  if (!validPlatforms.includes(manifest.platform)) {
    errors.push(`Unknown platform: ${manifest.platform}`);
  }

  const validMethods = ["rsync", "tar", "robocopy"];
  if (!validMethods.includes(manifest.backupMethod)) {
    errors.push(`Unknown backup method: ${manifest.backupMethod}`);
  }

  return { valid: errors.length === 0, errors };
}

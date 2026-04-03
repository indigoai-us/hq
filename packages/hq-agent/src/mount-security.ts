import path from 'path';
import fs from 'fs';

export class MountSecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MountSecurityError';
  }
}

/**
 * Validates that a host path is within one of the allowed base directories.
 * Resolves symlinks and normalises paths before comparison.
 *
 * @param hostPath - The path on the host to validate.
 * @param allowedBases - Absolute directories that are allowed as mount sources.
 * @throws MountSecurityError if the path escapes all allowed directories.
 */
export function validateMountPath(hostPath: string, allowedBases: string[]): string {
  if (!path.isAbsolute(hostPath)) {
    throw new MountSecurityError(`Mount path must be absolute: ${hostPath}`);
  }

  // Resolve the real path to defeat symlink escapes.
  // If the path doesn't exist yet we normalise without resolving.
  let resolved: string;
  try {
    resolved = fs.realpathSync(hostPath);
  } catch {
    // Path doesn't exist — normalise only (no symlink risk)
    resolved = path.normalize(hostPath);
  }

  const normalised = resolved.endsWith(path.sep)
    ? resolved
    : resolved + path.sep;

  for (const base of allowedBases) {
    if (!path.isAbsolute(base)) {
      throw new MountSecurityError(`Allowed base must be absolute: ${base}`);
    }
    // Resolve symlinks in allowed bases too (macOS: /var → /private/var)
    let resolvedBase: string;
    try {
      resolvedBase = fs.realpathSync(base);
    } catch {
      resolvedBase = path.normalize(base);
    }
    const normBase = resolvedBase.endsWith(path.sep) ? resolvedBase : resolvedBase + path.sep;

    // Exact match or child
    if (normalised === normBase || normalised.startsWith(normBase)) {
      return resolved;
    }
  }

  throw new MountSecurityError(
    `Mount path "${hostPath}" (resolved: "${resolved}") is outside allowed directories: [${allowedBases.join(', ')}]`
  );
}

/**
 * Validates a list of (host) mount paths.
 * Returns the resolved paths in the same order.
 */
export function validateAllMounts(hostPaths: string[], allowedBases: string[]): string[] {
  return hostPaths.map((p) => validateMountPath(p, allowedBases));
}

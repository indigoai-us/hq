import * as path from "path";
import fs from "fs-extra";

/**
 * Detect whether cloud sync has already been configured for this HQ directory.
 *
 * Checks for the presence of `.hq-cloud/` config directory or a
 * `.hq-cloud-config.json` file that would indicate a prior sync setup.
 *
 * This is a local-only stub — the full cloud detection (checking remote S3
 * for existing files) happens via `@indigoai/hq-cloud` during the setup flow.
 */
export async function detectExistingSync(targetDir: string): Promise<boolean> {
  const checks = [
    path.join(targetDir, ".hq-cloud"),
    path.join(targetDir, ".hq-cloud-config.json"),
    path.join(targetDir, "settings", "cloud.json"),
  ];

  for (const p of checks) {
    if (fs.existsSync(p)) {
      return true;
    }
  }

  return false;
}

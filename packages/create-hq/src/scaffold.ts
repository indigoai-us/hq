import * as path from "path";
import * as os from "os";
import fs from "fs-extra";
import { createInterface } from "readline";
import { banner, success, warn, step, nextSteps, info } from "./ui.js";
import { checkDeps } from "./deps.js";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface ScaffoldOptions {
  skipDeps?: boolean;
  skipCli?: boolean;
  skipCloud?: boolean;
}

async function prompt(question: string, defaultVal?: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const suffix = defaultVal ? ` (${defaultVal})` : "";
  return new Promise((resolve) => {
    rl.question(`  ? ${question}${suffix} `, (answer) => {
      rl.close();
      resolve(answer.trim() || defaultVal || "");
    });
  });
}

async function confirm(question: string, defaultYes = true): Promise<boolean> {
  const hint = defaultYes ? "Y/n" : "y/N";
  const answer = await prompt(`${question} (${hint})`);
  if (!answer) return defaultYes;
  return answer.toLowerCase().startsWith("y");
}

const HQ_REPO_URL = "https://github.com/indigoai-us/hq.git";

/**
 * Try to fetch the latest HQ template from GitHub.
 * Returns the path to the template/ dir inside a temp clone, or null on failure.
 */
function fetchRemoteTemplate(): { templateDir: string; cleanupDir: string } | null {
  const tmpDir = path.join(os.tmpdir(), `hq-template-${Date.now()}`);
  try {
    execSync(`git clone --depth 1 "${HQ_REPO_URL}" "${tmpDir}"`, {
      stdio: "pipe",
      timeout: 60000,
    });
    const templatePath = path.join(tmpDir, "template");
    if (fs.existsSync(templatePath) && fs.existsSync(path.join(templatePath, ".claude"))) {
      return { templateDir: templatePath, cleanupDir: tmpDir };
    }
    fs.removeSync(tmpDir);
    return null;
  } catch {
    try { fs.removeSync(tmpDir); } catch { /* best effort */ }
    return null;
  }
}

/**
 * Get the template directory. Tries GitHub first for the latest version,
 * falls back to the bundled template in the npm package.
 */
function getTemplateDir(): { templateDir: string; cleanupDir?: string; source: "github" | "bundled" } {
  const remote = fetchRemoteTemplate();
  if (remote) {
    return { templateDir: remote.templateDir, cleanupDir: remote.cleanupDir, source: "github" };
  }

  // Fall back to bundled template
  const candidates = [
    path.resolve(__dirname, "..", "..", "template"),
    path.resolve(__dirname, "..", "template"),
    path.resolve(__dirname, "..", "..", "..", "template"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.existsSync(path.join(candidate, ".claude"))) {
      return { templateDir: candidate, source: "bundled" };
    }
  }

  throw new Error(
    "Could not find HQ template directory. This is a packaging error — please report at https://github.com/indigoai-us/hq/issues"
  );
}

export async function scaffold(
  directory: string | undefined,
  options: ScaffoldOptions
): Promise<void> {
  banner();

  // 1. Ask where to install
  const defaultDir = os.platform() === "win32" ? "C:\\hq" : path.join(os.homedir(), "hq");
  const chosenDir = directory || await prompt("Where do you want to install HQ?", defaultDir);
  const targetDir = path.resolve(chosenDir);
  const displayDir = targetDir;

  // Check if directory already exists
  if (fs.existsSync(targetDir)) {
    const contents = fs.readdirSync(targetDir);
    if (contents.length > 0) {
      const proceed = await confirm(
        `Directory ${displayDir} already exists and is not empty. Continue anyway?`,
        false
      );
      if (!proceed) {
        console.log("  Aborted.");
        process.exit(0);
      }
    }
  }

  // 2. Copy template
  step("Fetching latest HQ template...");
  const { templateDir, cleanupDir, source } = getTemplateDir();

  if (source === "github") {
    info("Using latest template from GitHub");
  } else {
    info("Using bundled template (offline or no git access)");
  }

  await fs.copy(templateDir, targetDir, {
    filter: (src) => {
      const rel = path.relative(templateDir, src);
      if (rel.includes(".git/") || rel.includes("node_modules/")) return false;
      return true;
    },
  });

  // Clean up temp clone if we fetched from GitHub
  if (cleanupDir) {
    try { fs.removeSync(cleanupDir); } catch { /* best effort */ }
  }

  // Count what we copied
  const commandCount = fs.existsSync(path.join(targetDir, ".claude", "commands"))
    ? fs.readdirSync(path.join(targetDir, ".claude", "commands")).filter((f) => f.endsWith(".md")).length
    : 0;
  const workerCount = fs.existsSync(path.join(targetDir, "workers"))
    ? fs.readdirSync(path.join(targetDir, "workers"), { recursive: true })
        .filter((f) => String(f).endsWith("worker.yaml")).length
    : 0;

  success(`Copied template (${commandCount} commands, ${workerCount} workers)`);

  // 3. Check dependencies and install missing ones
  if (!options.skipDeps) {
    await checkDeps();
  }

  // 5. Install hq-cli
  if (!options.skipCli) {
    console.log();
    const installCli = await confirm(
      "Install @indigoai-us/hq-cli globally for module management?"
    );
    if (installCli) {
      try {
        step("Installing @indigoai-us/hq-cli...");
        execSync("npm install -g @indigoai-us/hq-cli", { stdio: "pipe" });
        success("Installed @indigoai-us/hq-cli");
      } catch {
        warn("Failed to install @indigoai-us/hq-cli — you can install it later with: npm install -g @indigoai-us/hq-cli");
      }
    }
  }

  // 6. Cloud setup — not yet available (API not deployed)
  // When HQ Cloud is live, this will offer: auth → upload → Claude token setup
  // For now, just inform the user it's coming
  if (!options.skipCloud) {
    console.log();
    info("HQ Cloud (file sync, mobile access, remote sessions) — coming soon");
    info("Follow progress at https://github.com/indigoai-us/hq");
  }

  // 7. Index with qmd
  try {
    execSync("qmd index .", { cwd: targetDir, stdio: "pipe" });
    success("Indexed HQ for search");
  } catch {
    // qmd not installed, skip silently — already warned in deps check
  }

  // 8. Next steps
  nextSteps(displayDir);
}

import * as path from "path";
import fs from "fs-extra";
import { createInterface } from "readline";
import { createRequire } from "node:module";
import { banner, success, warn, step, nextSteps, stepStatus } from "./ui.js";
import { checkDeps } from "./deps.js";
import { initGit, hasGit } from "./git.js";
import { execSync } from "child_process";
import { fetchTemplate } from "./fetch-template.js";
import { detectExistingSync } from "./cloud-sync.js";

const require = createRequire(import.meta.url);
const pkg = require("../package.json") as { version: string };

interface ScaffoldOptions {
  skipDeps?: boolean;
  skipCli?: boolean;
  skipSync?: boolean;
  tag?: string;
  localTemplate?: string;
  yes?: boolean;
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

export async function scaffold(
  directory: string,
  options: ScaffoldOptions
): Promise<void> {
  // Show banner with installer version; hqVersion will be added after template fetch
  banner(pkg.version);

  // 1. Resolve target directory
  const targetDir = path.resolve(directory);
  const displayDir = directory.startsWith("/")
    ? directory
    : path.relative(process.cwd(), targetDir) || ".";

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

  // 2. Fetch template (from local path or GitHub)
  let hqVersion = "";
  if (options.localTemplate) {
    const localLabel = "Copying local HQ template...";
    stepStatus(localLabel, "running");
    try {
      const templateSrc = path.resolve(options.localTemplate);
      if (!fs.existsSync(templateSrc)) {
        throw new Error(`Local template not found: ${templateSrc}`);
      }
      fs.ensureDirSync(targetDir);
      fs.copySync(templateSrc, targetDir, { overwrite: true });
      hqVersion = "local";

      const commandCount = fs.existsSync(path.join(targetDir, ".claude", "commands"))
        ? fs.readdirSync(path.join(targetDir, ".claude", "commands")).filter((f) => f.endsWith(".md")).length
        : 0;
      const workerCount = fs.existsSync(path.join(targetDir, "workers"))
        ? fs.readdirSync(path.join(targetDir, "workers"), { recursive: true })
            .filter((f) => String(f).endsWith("worker.yaml")).length
        : 0;

      stepStatus(localLabel, "done");
      success(`HQ template (local) (${commandCount} commands, ${workerCount} workers)`);
    } catch (err) {
      stepStatus(localLabel, "failed");
      throw err;
    }
  } else {
    const fetchLabel = "Fetching HQ template from GitHub...";
    stepStatus(fetchLabel, "running");
    try {
      const { version } = await fetchTemplate(targetDir, options.tag);
      hqVersion = version;

      const commandCount = fs.existsSync(path.join(targetDir, ".claude", "commands"))
        ? fs.readdirSync(path.join(targetDir, ".claude", "commands")).filter((f) => f.endsWith(".md")).length
        : 0;
      const workerCount = fs.existsSync(path.join(targetDir, "workers"))
        ? fs.readdirSync(path.join(targetDir, "workers"), { recursive: true })
            .filter((f) => String(f).endsWith("worker.yaml")).length
        : 0;

      stepStatus(fetchLabel, "done");
      success(`HQ template ${version} (${commandCount} commands, ${workerCount} workers)`);
    } catch (err) {
      stepStatus(fetchLabel, "failed");
      throw err;
    }
  }

  // 3. Git init
  const gitLabel = "Initializing git repository";
  stepStatus(gitLabel, "running");
  if (hasGit()) {
    initGit(targetDir);
    stepStatus(gitLabel, "done");
  } else {
    stepStatus(gitLabel, "failed");
    warn("git not found — skipping git init");
  }

  // 4. Governance bootstrap — compute checksums and verify integrity
  const integrityLabel = "Verifying kernel integrity";
  stepStatus(integrityLabel, "running");
  try {
    const computeScript = path.join(targetDir, "scripts", "compute-checksums.sh");
    const integrityScript = path.join(targetDir, "scripts", "core-integrity.sh");

    if (!fs.existsSync(computeScript) || !fs.existsSync(integrityScript)) {
      // Scripts not present in this template version — skip silently
      stepStatus(integrityLabel, "done");
    } else {
      // Both scripts require yq — skip gracefully if not yet installed
      const hasYq = (() => { try { execSync("yq --version", { stdio: "pipe" }); return true; } catch { return false; } })();

      if (!hasYq) {
        stepStatus(integrityLabel, "done"); // yq will be offered during dependency check
      } else {
        execSync("bash scripts/compute-checksums.sh", { cwd: targetDir, stdio: "pipe" });
        try {
          execSync("bash scripts/core-integrity.sh", { cwd: targetDir, stdio: "pipe" });
          stepStatus(integrityLabel, "done");
        } catch (err) {
          stepStatus(integrityLabel, "failed");
          const stderr = (err as { stderr?: Buffer })?.stderr?.toString().trim() ?? "";
          warn(`Kernel integrity check found issues${stderr ? " — " + stderr : ""}`);
          warn("Run: bash scripts/core-integrity.sh for details");
        }
      }
    }
  } catch (err) {
    stepStatus(integrityLabel, "failed");
    const stderr = (err as { stderr?: Buffer })?.stderr?.toString().trim() ?? "";
    if (stderr) warn(`Governance bootstrap failed: ${stderr}`);
    // governance bootstrap should never abort the scaffold
  }

  // 5. Check dependencies
  const depsLabel = "Checking dependencies";
  if (!options.skipDeps) {
    stepStatus(depsLabel, "running");
    stepStatus(depsLabel, "done"); // stop spinner — checkDeps prints its own output
    await checkDeps(options.yes);
  } else {
    stepStatus(depsLabel, "done");
  }

  // 6. Smart cloud sync detection
  const alreadySynced = await detectExistingSync(targetDir);
  if (alreadySynced) {
    success("Cloud sync already configured — skipping setup");
  }

  // 7. Cloud sync setup
  if (!options.skipSync && !alreadySynced && !options.yes) {
    console.log();
    const setupSync = await confirm(
      "Set up cloud sync? (enables mobile access via hq.indigoai.com)"
    );
    if (setupSync) {
      step("Cloud sync setup will be available after running /setup in Claude Code");
      step("Run: hq sync init");
    }
  }

  // 8. Index with qmd
  try {
    execSync("qmd index .", { cwd: targetDir, stdio: "pipe" });
    success("Indexed HQ for search");
  } catch {
    // qmd not installed, skip silently — already warned in deps check
  }

  // 9. Next steps
  nextSteps(displayDir);
}

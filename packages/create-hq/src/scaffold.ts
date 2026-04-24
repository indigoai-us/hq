import * as path from "path";
import fs from "fs-extra";
import { createInterface } from "readline";
import { createRequire } from "node:module";
import chalk from "chalk";
import {
  banner,
  success,
  warn,
  step,
  info,
  nextSteps,
  stepStatus,
  updateSpinnerText,
} from "./ui.js";
import { checkDeps } from "./deps.js";
import { initGit, hasGit, hasGitUser, configureGitUser, gitCommit } from "./git.js";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);
import { fetchTemplate } from "./fetch-template.js";
import { detectExistingSync } from "./cloud-sync.js";
import {
  readRecommendedPackages,
  readInstalledPackSources,
  installRecommendedPackages,
  summarizeOutcomes,
  type RecommendedPackage,
  type InstallOutcome,
} from "./recommended-packages.js";

const require = createRequire(import.meta.url);
const pkg = require("../package.json") as { version: string };

interface ScaffoldOptions {
  skipDeps?: boolean;
  skipCli?: boolean;
  skipSync?: boolean;
  skipPackages?: boolean;
  /** install hq-core scaffold only, no recommended content packs */
  minimal?: boolean;
  /** install hq-core scaffold + all recommended packs without per-pack prompts */
  full?: boolean;
  tag?: string;
  localTemplate?: string;
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

/**
 * Prompt for one of multiple labelled choices. Returns the matched key.
 * Matching is first-letter, case-insensitive. Empty input returns `defaultKey`.
 */
async function choice<K extends string>(
  question: string,
  keys: readonly K[],
  defaultKey: K,
): Promise<K> {
  const hint = keys.map((k) => (k === defaultKey ? k.toUpperCase() : k)).join("/");
  for (;;) {
    const answer = await prompt(`${question} (${hint})`);
    if (!answer) return defaultKey;
    const first = answer[0].toLowerCase();
    const match = keys.find((k) => k.toLowerCase() === first);
    if (match) return match;
  }
}

export async function scaffold(
  directory: string | undefined,
  options: ScaffoldOptions
): Promise<void> {
  banner(pkg.version);

  // Non-TTY (headless CI, piped /dev/null) skips interactive prompts.
  const isInteractive = process.stdin.isTTY ?? false;

  // 1. Resolve target directory (prompt if not provided)
  let dir = directory;
  if (!dir) {
    console.log();
    dir = await prompt("Where should HQ be installed?", "hq");
  }
  const targetDir = path.resolve(dir);
  const displayDir = dir.startsWith("/")
    ? dir
    : path.relative(process.cwd(), targetDir) || ".";

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

  // 2. Dependency check (no spinner — checkDeps is interactive with prompts)
  if (!options.skipDeps) {
    const { allRequired } = await checkDeps();
    if (!allRequired) {
      console.log();
      warn("Required dependencies are missing — cannot continue.");
      info("Install the missing dependencies above, then run create-hq again.");
      process.exit(1);
    }
  }

  // 3. Fetch core HQ template
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
      const { version } = await fetchTemplate(targetDir, options.tag, (phase) => {
        updateSpinnerText(fetchLabel, phase);
      });
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

  // 4. Git init the root HQ (no remote — root HQ is always local-only)
  const gitLabel = "Initializing git repository";
  stepStatus(gitLabel, "running");
  if (hasGit()) {
    const gitResult = await initGit(targetDir);
    if (gitResult.committed) {
      stepStatus(gitLabel, "done");
    } else if (gitResult.initialized) {
      stepStatus(gitLabel, "done");
      const gitUser = hasGitUser();
      if (!gitUser.name || !gitUser.email) {
        info("Git needs your name and email for commits");
        const userName = await prompt("Your name", gitUser.name || "");
        const userEmail = await prompt("Your email", gitUser.email || "");
        if (userName && userEmail) {
          const configLabel = "Configuring git";
          stepStatus(configLabel, "running");
          await configureGitUser(userName, userEmail);
          stepStatus(configLabel, "done");

          const commitLabel = "Creating initial commit";
          stepStatus(commitLabel, "running");
          const committed = await gitCommit(targetDir, "Initial HQ setup via create-hq");
          if (committed) {
            stepStatus(commitLabel, "done");
          } else {
            stepStatus(commitLabel, "failed");
            info("You can commit later: " + chalk.dim(`cd ${displayDir} && git add -A && git commit -m "Initial HQ setup"`));
          }
        }
      } else {
        warn("Git repo initialized but initial commit failed");
        info("You can commit later: " + chalk.dim(`cd ${displayDir} && git add -A && git commit -m "Initial HQ setup"`));
      }
    } else {
      stepStatus(gitLabel, "failed");
      warn("Git initialization failed — you can set it up later");
    }
  } else {
    stepStatus(gitLabel, "failed");
    warn("git not found — skipping git init");
  }

  // 5. Governance bootstrap — checksums + integrity verification
  const integrityLabel = "Verifying kernel integrity";
  stepStatus(integrityLabel, "running");
  try {
    const computeChecksumsScript = path.join(targetDir, "scripts", "compute-checksums.sh");
    const coreIntegrityScript = path.join(targetDir, "scripts", "core-integrity.sh");
    if (fs.existsSync(computeChecksumsScript) && fs.existsSync(coreIntegrityScript)) {
      await execAsync("bash scripts/compute-checksums.sh", { cwd: targetDir });
      try {
        await execAsync("bash scripts/core-integrity.sh", { cwd: targetDir });
        stepStatus(integrityLabel, "done");
      } catch {
        stepStatus(integrityLabel, "failed");
        warn("Kernel integrity check found issues — run scripts/core-integrity.sh to investigate");
      }
    } else {
      stepStatus(integrityLabel, "done");
    }
  } catch {
    stepStatus(integrityLabel, "failed");
  }

  // 6. Recommended content packs (hq-core v12+). hq-core ships as a minimal
  //     scaffold; the batteries-included experience comes from installing packs
  //     declared in `core.yaml:recommended_packages`. Pack failures are warnings
  //     (scaffolding still succeeds); `/setup --resume` or `/update-hq` retries.
  if (!options.skipPackages && !options.minimal) {
    await installRecommendedPacksPhase(targetDir, options.full ?? false, isInteractive);
  }

  // 7. Cloud sync detection (no-op if already configured)
  const alreadySynced = await detectExistingSync(targetDir);
  if (alreadySynced) {
    success("Cloud sync already configured — skipping setup");
  }

  // (disabled) Optional: install hq-cli globally
  // if (!options.skipCli) {
  //   console.log();
  //   const installCli = await confirm(
  //     "Install @indigoai-us/hq-cli globally for module management?"
  //   );
  //   if (installCli) {
  //     const cliLabel = "Installing @indigoai-us/hq-cli";
  //     stepStatus(cliLabel, "running");
  //     try {
  //       execSync("npm install -g @indigoai-us/hq-cli", { stdio: "pipe" });
  //       stepStatus(cliLabel, "done");
  //     } catch {
  //       stepStatus(cliLabel, "failed");
  //       warn("Failed to install @indigoai-us/hq-cli — install manually with: npm install -g @indigoai-us/hq-cli");
  //     }
  //   }
  // }

  // (disabled) Cloud sync setup
  // if (!options.skipSync && !alreadySynced) {
  //   console.log();
  //   const setupSync = await confirm(
  //     "Set up cloud sync? (enables mobile access via example.com)"
  //   );
  //   if (setupSync) {
  //     step("Cloud sync setup will be available after running /setup in Claude Code");
  //     step("Run: hq sync init");
  //   }
  // }

  // 8. qmd index. Register the scaffolded HQ as a qmd collection and trigger a
  //    first index. qmd has no single-shot "index this dir" command — the
  //    canonical flow is `collection add <name> <path>` + `update`. Silently
  //    skipped when qmd isn't on PATH (optional dep); users can install later
  //    and run `qmd update` themselves.
  const indexLabel = "Indexing HQ for search";
  let qmdAvailable = true;
  try {
    await execAsync("command -v qmd", { shell: "/bin/bash" });
  } catch {
    qmdAvailable = false;
  }

  if (!qmdAvailable) {
    stepStatus(indexLabel, "running");
    stepStatus(indexLabel, "done");
    info(chalk.dim("  (qmd not installed — skipped; install qmd and run `qmd update` later)"));
  } else {
    stepStatus(indexLabel, "running");
    try {
      const collectionName = path.basename(targetDir);
      try {
        await execAsync(
          `qmd collection add ${JSON.stringify(collectionName)} ${JSON.stringify(targetDir)}`,
        );
      } catch {
        // Already registered — fine, just update.
      }
      await execAsync("qmd update", { cwd: targetDir });
      stepStatus(indexLabel, "done");
    } catch {
      stepStatus(indexLabel, "failed");
      info(chalk.dim("  (run `qmd update` later to retry)"));
    }
  }

  // 9. Orientation
  console.log();
  nextSteps(displayDir);
}

// ─── Recommended-packages phase ────────────────────────────────────────────

/**
 * Read `core.yaml:recommended_packages`, diff against already-installed packs,
 * prompt or auto-install per flag mode, and install the selected subset via
 * `hq install`. Called from the main scaffold flow after template + git + core
 * integrity bootstrap, before cloud sync.
 *
 * Failure semantics: this function never throws. A failed pack install is
 * reported to stdout and left for `/setup --resume` / `/update-hq` to retry.
 * The scaffold itself always succeeds if the core template copied.
 */
async function installRecommendedPacksPhase(
  targetDir: string,
  full: boolean,
  isInteractive: boolean,
): Promise<void> {
  const entries = readRecommendedPackages(targetDir);
  if (entries.length === 0) {
    // hq-core with no recommended packs — silent no-op.
    return;
  }

  const alreadyInstalled = readInstalledPackSources(targetDir);
  const remaining = entries.filter((e) => !alreadyInstalled.has(e.source));
  if (remaining.length === 0) {
    info("All recommended packs already installed");
    return;
  }

  console.log();
  step(`Recommended content packs (${remaining.length} available)`);
  for (const entry of remaining) {
    const tag = entry.description ? chalk.dim(` — ${entry.description}`) : "";
    console.log(`    ${chalk.cyan(entry.source)}${tag}`);
  }

  // Decide which packs to actually install.
  let selected: RecommendedPackage[] = [];
  if (full) {
    selected = remaining;
    info("`--full` flag set — installing all recommended packs without prompts");
  } else if (!isInteractive) {
    // Non-TTY + no --full → skip silently. Users in CI who want packs should
    // pass --full explicitly.
    info("Non-interactive environment detected — skipping recommended packs. Pass --full to install unattended.");
    return;
  } else {
    const decision = await choice(
      `Install recommended packs? ${chalk.dim("(a = all / y = prompt per pack / n = skip)")}`,
      ["a", "y", "n"] as const,
      "a",
    );
    if (decision === "n") {
      info("Skipped — install later with /setup --resume or hq install <source>");
      return;
    }
    if (decision === "a") {
      selected = remaining;
    } else {
      // Per-pack prompt loop. Users can accept/reject each individually.
      for (const entry of remaining) {
        const yes = await confirm(`  Install ${chalk.cyan(entry.source)}?`, true);
        if (yes) selected.push(entry);
      }
      if (selected.length === 0) {
        info("No packs selected");
        return;
      }
    }
  }

  console.log();
  step(`Installing ${selected.length} pack${selected.length === 1 ? "" : "s"}...`);
  const outcomes: InstallOutcome[] = installRecommendedPackages(targetDir, selected, {
    allowHooks: full, // non-interactive --full mode pre-accepts hooks
  });

  const { installed, skipped, failed } = summarizeOutcomes(outcomes);
  console.log();
  if (failed > 0) {
    warn(`Recommended packs: ${installed} installed, ${skipped} skipped, ${failed} failed`);
    info("Failed packs can be retried with: hq install <source>");
  } else {
    success(`Recommended packs: ${installed} installed${skipped > 0 ? `, ${skipped} skipped` : ""}`);
  }
}


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
  teamOrientation,
} from "./ui.js";
import { checkDeps } from "./deps.js";
import { initGit, hasGit } from "./git.js";
import { execSync } from "child_process";
import { fetchTemplate } from "./fetch-template.js";
import { detectExistingSync } from "./cloud-sync.js";
import { runTeamsFlow, type TeamsFlowResult } from "./teams-flow.js";

const require = createRequire(import.meta.url);
const pkg = require("../package.json") as { version: string };

interface ScaffoldOptions {
  skipDeps?: boolean;
  skipCli?: boolean;
  skipSync?: boolean;
  skipPackages?: boolean;
  tag?: string;
  localTemplate?: string;
  join?: string;
}

type EntryMode = "personal" | "teams-existing" | "teams-new" | "exit";

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
 * Cascading entry-mode selection:
 *   1. HQ Teams account?      yes → teams-existing
 *   2. Create one?             yes → teams-new
 *   3. Personal HQ instead?    yes → personal
 *                              no  → exit
 */
async function chooseEntryMode(): Promise<EntryMode> {
  console.log();
  const hasTeamsAccount = await confirm(
    `${chalk.bold("Do you have an HQ Teams account?")}`,
    false
  );
  if (hasTeamsAccount) return "teams-existing";

  const wantsTeam = await confirm(
    `${chalk.bold("Would you like to create an HQ Teams account?")}`,
    false
  );
  if (wantsTeam) return "teams-new";

  const wantsPersonal = await confirm(
    `${chalk.bold("Set up a personal HQ instead?")}`,
    true
  );
  if (wantsPersonal) return "personal";

  return "exit";
}

export async function scaffold(
  directory: string,
  options: ScaffoldOptions
): Promise<void> {
  banner(pkg.version);

  // 1. Entry mode
  const mode = await chooseEntryMode();
  if (mode === "exit") {
    console.log();
    info("No problem — come back any time with: npx create-hq");
    process.exit(0);
  }

  // 2. Resolve target directory
  const targetDir = path.resolve(directory);
  const displayDir = directory.startsWith("/")
    ? directory
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

  // 3. Dependency check — runs FIRST so missing git/node aborts before any I/O
  if (!options.skipDeps) {
    const depsLabel = "Checking dependencies";
    stepStatus(depsLabel, "running");
    const { allRequired } = await checkDeps();
    if (!allRequired) {
      stepStatus(depsLabel, "failed");
      console.log();
      warn("Required dependencies are missing — cannot continue.");
      info("Install the missing dependencies above, then run create-hq again.");
      process.exit(1);
    }
    stepStatus(depsLabel, "done");
  }

  // 4. Fetch core HQ template (every user gets this — personal or team)
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

  // 5. Git init the root HQ (no remote — root HQ is always local-only)
  const gitLabel = "Initializing git repository";
  stepStatus(gitLabel, "running");
  if (hasGit()) {
    initGit(targetDir);
    stepStatus(gitLabel, "done");
  } else {
    stepStatus(gitLabel, "failed");
    warn("git not found — skipping git init");
  }

  // 6. Governance bootstrap — checksums + integrity verification
  const integrityLabel = "Verifying kernel integrity";
  stepStatus(integrityLabel, "running");
  try {
    const computeChecksumsScript = path.join(targetDir, "scripts", "compute-checksums.sh");
    const coreIntegrityScript = path.join(targetDir, "scripts", "core-integrity.sh");
    if (fs.existsSync(computeChecksumsScript) && fs.existsSync(coreIntegrityScript)) {
      execSync("bash scripts/compute-checksums.sh", { cwd: targetDir, stdio: "pipe" });
      try {
        execSync("bash scripts/core-integrity.sh", { cwd: targetDir, stdio: "pipe" });
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

  // 7. Cloud sync detection
  const alreadySynced = await detectExistingSync(targetDir);
  if (alreadySynced) {
    success("Cloud sync already configured — skipping setup");
  }

  // 8. Teams flow (only for teams-existing or teams-new modes)
  let teamsResult: TeamsFlowResult | null = null;
  if (mode === "teams-existing" || mode === "teams-new") {
    teamsResult = await runTeamsFlow(
      mode === "teams-existing" ? "existing" : "new",
      targetDir,
      hqVersion
    );
    if (!teamsResult) {
      console.log();
      warn("Team setup did not complete — your personal HQ is still set up correctly.");
    }
  }

  // 9. Optional: install hq-cli globally
  if (!options.skipCli) {
    console.log();
    const installCli = await confirm(
      "Install @indigoai-us/hq-cli globally for module management?"
    );
    if (installCli) {
      const cliLabel = "Installing @indigoai-us/hq-cli";
      stepStatus(cliLabel, "running");
      try {
        execSync("npm install -g @indigoai-us/hq-cli", { stdio: "pipe" });
        stepStatus(cliLabel, "done");
      } catch {
        stepStatus(cliLabel, "failed");
        warn("Failed to install @indigoai-us/hq-cli — install manually with: npm install -g @indigoai-us/hq-cli");
      }
    }
  }

  // 10. Cloud sync setup
  if (!options.skipSync && !alreadySynced) {
    console.log();
    const setupSync = await confirm(
      "Set up cloud sync? (enables mobile access via hq.indigoai.com)"
    );
    if (setupSync) {
      step("Cloud sync setup will be available after running /setup in Claude Code");
      step("Run: hq sync init");
    }
  }

  // 11. qmd index
  try {
    execSync("qmd index .", { cwd: targetDir, stdio: "pipe" });
    success("Indexed HQ for search");
  } catch {
    // qmd not installed, skip silently — already warned in deps check
  }

  // 12. Orientation
  console.log();
  if (teamsResult?.admin) {
    teamOrientation({
      mode: "admin",
      displayDir,
      teamName: teamsResult.admin.team.team_name,
      teamSlug: teamsResult.admin.team.team_slug,
      orgLogin: teamsResult.admin.team.org_login,
      repoUrl: teamsResult.admin.repoHtmlUrl,
    });
  } else if (teamsResult?.member && teamsResult.member.joined.length > 0) {
    teamOrientation({
      mode: "member",
      displayDir,
      teams: teamsResult.member.joined.map((t) => ({
        name: t.name,
        slug: t.slug,
        repoUrl: t.repoHtmlUrl,
      })),
    });
  } else {
    nextSteps(displayDir);
  }
}

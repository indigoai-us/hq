import * as path from "path";
import * as os from "os";
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
  teamOrientation,
} from "./ui.js";
import { checkDeps } from "./deps.js";
import { initGit, hasGit, hasGitUser, configureGitUser, gitCommit } from "./git.js";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);
import { fetchTemplate } from "./fetch-template.js";
import { detectExistingSync } from "./cloud-sync.js";
import { runTeamsFlow, authenticate, type TeamsFlowResult } from "./teams-flow.js";
import type { GitHubAuth } from "./auth.js";

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
  invite?: string;
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

// ─── Existing HQ detection ─────────────────────────────────────────────────

/**
 * Check whether a directory is an existing HQ installation.
 * Requires CLAUDE.md + .claude/ + companies/ — three markers to avoid false positives.
 */
function isExistingHQ(dir: string): boolean {
  return (
    fs.existsSync(path.join(dir, "CLAUDE.md")) &&
    fs.existsSync(path.join(dir, ".claude")) &&
    fs.existsSync(path.join(dir, "companies"))
  );
}

/** Display path with ~ for home directory. */
function friendlyPath(absPath: string): string {
  const home = os.homedir();
  if (absPath === home) return "~";
  if (absPath.startsWith(home + path.sep)) {
    return "~/" + path.relative(home, absPath);
  }
  return absPath;
}

/** Resolve ~/... to an absolute path. */
function resolveTildePath(p: string): string {
  if (p.startsWith("~/") || p === "~") {
    return path.join(os.homedir(), p.slice(2));
  }
  return path.resolve(p);
}

/**
 * Search common locations for an existing HQ installation.
 * Priority: explicit CLI arg > $HQ_HOME > ~/hq
 */
function detectExistingHQ(cliDir?: string): string | null {
  const candidates = [
    cliDir ? path.resolve(cliDir) : null,
    process.env.HQ_HOME ? path.resolve(process.env.HQ_HOME) : null,
    path.join(os.homedir(), "hq"),
  ].filter((c): c is string => c !== null);

  for (const dir of candidates) {
    if (fs.existsSync(dir) && isExistingHQ(dir)) {
      return dir;
    }
  }
  return null;
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
    true
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
  directory: string | undefined,
  options: ScaffoldOptions
): Promise<void> {
  banner(pkg.version);

  // 1. Entry mode — if --invite or --join is provided, force teams-existing.
  //    If stdin is not a TTY (headless CI, piped /dev/null), skip prompts → personal.
  const inviteToken = options.invite || options.join;
  const isInteractive = process.stdin.isTTY ?? false;
  const mode = inviteToken
    ? "teams-existing" as EntryMode
    : isInteractive
      ? await chooseEntryMode()
      : "personal" as EntryMode;
  if (mode === "exit") {
    console.log();
    info("No problem — come back any time with: npx create-hq");
    process.exit(0);
  }

  // 2. Authenticate immediately for "existing" teams path (need App token for discovery).
  //    For "new" teams path, defer auth — admin onboarding uses `gh` CLI for org
  //    discovery first, then triggers App auth after org selection.
  let teamsAuth: GitHubAuth | null = null;
  if (mode === "teams-existing") {
    teamsAuth = await authenticate();
    if (!teamsAuth) {
      console.log();
      warn("GitHub sign-in is required for HQ Teams.");
      const fallback = await confirm("Set up a personal HQ instead?", true);
      if (!fallback) {
        info("No problem — come back any time with: npx create-hq");
        process.exit(0);
      }
      // Fall through to personal mode
    }
  }

  // 2b. Graft detection — if we have an invite token, check for an existing HQ
  //     before asking about directory. Grafting adds the team to the existing
  //     HQ without re-scaffolding template, git init, etc.
  if (inviteToken && teamsAuth) {
    const autoDetected = detectExistingHQ(directory);

    if (autoDetected) {
      // Found an existing HQ automatically — offer to graft into it
      const displayExisting = friendlyPath(autoDetected);

      console.log();
      info(`Detected existing HQ at ${chalk.cyan(displayExisting)}`);

      const graftChoice = await prompt(
        `Join team in existing HQ? ${chalk.dim("(Y = use existing / n = create new)")}`,
        "Y"
      );

      if (graftChoice.toLowerCase() !== "n") {
        return graftTeamIntoExistingHQ(autoDetected, displayExisting, teamsAuth, inviteToken);
      }
      // "n" — fall through to normal fresh scaffold
    } else {
      // No auto-detected HQ — ask the user if they already have one
      console.log();
      const hasExisting = await confirm(
        chalk.bold("Do you already have an existing HQ installed?"),
        false
      );

      if (hasExisting) {
        const existingPath = await prompt(
          "Where is your existing HQ?",
          path.join(os.homedir(), "hq")
        );
        const resolvedPath = resolveTildePath(existingPath);

        if (fs.existsSync(resolvedPath) && isExistingHQ(resolvedPath)) {
          return graftTeamIntoExistingHQ(resolvedPath, friendlyPath(resolvedPath), teamsAuth, inviteToken);
        }

        // Directory exists but isn't an HQ, or doesn't exist
        if (!fs.existsSync(resolvedPath)) {
          warn(`Directory not found: ${existingPath}`);
        } else {
          warn(`That directory doesn't look like an HQ installation (missing CLAUDE.md or .claude/).`);
        }
        info("Setting up a fresh HQ instead...");
        // Fall through to normal scaffold, pre-fill directory to their path
        directory = existingPath;
      }
      // No existing HQ — fall through to normal fresh scaffold
    }
  }

  // 3. Resolve target directory (prompt if not provided)
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

  // 4. Dependency check (no spinner — checkDeps is interactive with prompts)
  if (!options.skipDeps) {
    const { allRequired } = await checkDeps();
    if (!allRequired) {
      console.log();
      warn("Required dependencies are missing — cannot continue.");
      info("Install the missing dependencies above, then run create-hq again.");
      process.exit(1);
    }
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

  // 5. Git init the root HQ (no remote — root HQ is always local-only)
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

  // 6. Governance bootstrap — checksums + integrity verification
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

  // 7. Cloud sync detection
  const alreadySynced = await detectExistingSync(targetDir);
  if (alreadySynced) {
    success("Cloud sync already configured — skipping setup");
  }

  // 8. Teams flow (existing: only if auth succeeded; new: auth happens inside)
  let teamsResult: TeamsFlowResult | null = null;
  if ((mode === "teams-existing" && teamsAuth) || mode === "teams-new") {
    teamsResult = await runTeamsFlow(
      mode === "teams-existing" ? "existing" : "new",
      targetDir,
      hqVersion,
      teamsAuth ?? undefined,
      inviteToken
    );
    if (!teamsResult) {
      console.log();
      warn("Team setup did not complete — your personal HQ is still set up correctly.");
    }
  }

  // 9. Optional: install hq-cli globally (disabled for now)
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

  // 10. Cloud sync setup (disabled for now)
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

  // 11. qmd index
  const indexLabel = "Indexing HQ for search";
  stepStatus(indexLabel, "running");
  try {
    await execAsync("qmd index .", { cwd: targetDir });
    stepStatus(indexLabel, "done");
  } catch {
    stepStatus(indexLabel, "failed");
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
  } else if (teamsResult?.joinedByInvite) {
    teamOrientation({
      mode: "member",
      displayDir,
      teams: [{
        name: teamsResult.joinedByInvite.teamName,
        slug: teamsResult.joinedByInvite.slug,
        repoUrl: teamsResult.joinedByInvite.repoUrl,
      }],
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

// ─── Graft path ────────────────────────────────────────────────────────────

/**
 * Add a team to an existing HQ installation without re-scaffolding.
 *
 * Skips: template fetch, git init, governance bootstrap, cloud sync, qmd full-index.
 * Runs:  teams flow (join-by-invite) → manifest registration → orientation.
 *
 * This is the fast path for users who already have a working HQ and just need
 * to accept a team invite. Takes ~5 seconds instead of ~30.
 */
async function graftTeamIntoExistingHQ(
  hqRoot: string,
  displayDir: string,
  auth: GitHubAuth,
  inviteToken: string
): Promise<void> {
  console.log();
  step("Adding team to existing HQ (skipping scaffold)...");

  const teamsResult = await runTeamsFlow(
    "existing",
    hqRoot,
    "", // hqVersion not needed for graft — we're not seeding a new template
    auth,
    inviteToken
  );

  if (!teamsResult) {
    console.log();
    warn("Team setup did not complete — your existing HQ is unchanged.");
    return;
  }

  // Index only the new company directory, not the entire HQ
  if (teamsResult.joinedByInvite) {
    const companyDir = teamsResult.joinedByInvite.companyDir;
    const indexLabel = `Indexing companies/${teamsResult.joinedByInvite.slug}`;
    stepStatus(indexLabel, "running");
    try {
      await execAsync(`qmd index "${companyDir}"`, { cwd: hqRoot });
      stepStatus(indexLabel, "done");
    } catch {
      stepStatus(indexLabel, "failed");
    }
  }

  // Orientation
  console.log();
  if (teamsResult.joinedByInvite) {
    teamOrientation({
      mode: "member",
      displayDir,
      teams: [{
        name: teamsResult.joinedByInvite.teamName,
        slug: teamsResult.joinedByInvite.slug,
        repoUrl: teamsResult.joinedByInvite.repoUrl,
      }],
    });
  } else if (teamsResult.member && teamsResult.member.joined.length > 0) {
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
    info("No teams were joined. Your existing HQ is unchanged.");
  }
}

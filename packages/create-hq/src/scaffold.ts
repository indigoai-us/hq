import * as path from "path";
import fs from "fs-extra";
import { createRequire } from "node:module";
import chalk from "chalk";
import {
  text,
  confirm,
  group,
  spinner,
  isCancel,
  cancel,
  log,
  note,
} from "@clack/prompts";
import { banner, success, warn, info, step, nextSteps, createSpinner } from "./ui.js";
import { checkDeps } from "./deps.js";
import { initGit, hasGit } from "./git.js";
import { execSync } from "child_process";
import { fetchTemplate } from "./fetch-template.js";
import { detectExistingSync } from "./cloud-sync.js";
import { startAuthFlow, saveToken, loadToken, isTokenExpired } from "./auth.js";
import type { AuthToken } from "./auth.js";
import {
  getRegistryUrl,
  fetchPublicPackages,
  fetchEntitlements,
  buildPackageChoices,
  formatPackageChoice,
  installSelectedPackages,
} from "./packages.js";
import type { PackageChoice } from "./packages.js";

const require = createRequire(import.meta.url);
const pkg = require("../package.json") as { version: string };

interface ScaffoldOptions {
  skipDeps?: boolean;
  skipCli?: boolean;
  skipSync?: boolean;
  skipPackages?: boolean;
  skipSetup?: boolean;
  tag?: string;
  localTemplate?: string;
  join?: string;
}

export async function scaffold(
  directory: string,
  options: ScaffoldOptions
): Promise<void> {
  // Show banner with installer version
  banner(pkg.version);

  // ── 1. Resolve target directory ───────────────────────────────────────────
  const targetDir = path.resolve(directory);
  const displayDir = directory.startsWith("/")
    ? directory
    : path.relative(process.cwd(), targetDir) || ".";

  // Check if directory already exists
  if (fs.existsSync(targetDir)) {
    const contents = fs.readdirSync(targetDir);
    if (contents.length > 0) {
      const proceed = await confirm({
        message: `Directory ${displayDir} already exists and is not empty. Continue anyway?`,
        initialValue: false,
      });
      if (isCancel(proceed) || !proceed) {
        cancel("Aborted.");
        process.exit(0);
      }
    }
  }

  // ── 2. Fetch template ────────────────────────────────────────────────────
  let hqVersion = "";
  const s = createSpinner();

  if (options.localTemplate) {
    s.start("Copying local HQ template...");
    try {
      const templateSrc = path.resolve(options.localTemplate);
      if (!fs.existsSync(templateSrc)) {
        throw new Error(`Local template not found: ${templateSrc}`);
      }
      fs.ensureDirSync(targetDir);
      fs.copySync(templateSrc, targetDir, { overwrite: true });
      hqVersion = "local";

      const commandCount = countFiles(targetDir, ".claude/commands", ".md");
      const workerCount = countWorkers(targetDir);

      s.stop(`HQ template (local) — ${commandCount} commands, ${workerCount} workers`);
    } catch (err) {
      s.stop("Failed to copy local template");
      throw err;
    }
  } else {
    s.start("Fetching HQ template from GitHub...");
    try {
      const { version } = await fetchTemplate(targetDir, options.tag);
      hqVersion = version;

      const commandCount = countFiles(targetDir, ".claude/commands", ".md");
      const workerCount = countWorkers(targetDir);

      s.stop(`HQ template ${version} — ${commandCount} commands, ${workerCount} workers`);
    } catch (err) {
      s.stop("Failed to fetch template");
      throw err;
    }
  }

  // ── 3. Git init ──────────────────────────────────────────────────────────
  const gs = createSpinner();
  gs.start("Initializing git repository");
  if (hasGit()) {
    initGit(targetDir);
    gs.stop("Git repository initialized");
  } else {
    gs.stop("git not found — skipped");
    warn("Install git to enable version control");
  }

  // ── 4. Governance bootstrap ──────────────────────────────────────────────
  const is = createSpinner();
  is.start("Verifying kernel integrity");
  try {
    const computeChecksumsScript = path.join(targetDir, "scripts", "compute-checksums.sh");
    const coreIntegrityScript = path.join(targetDir, "scripts", "core-integrity.sh");
    if (fs.existsSync(computeChecksumsScript) && fs.existsSync(coreIntegrityScript)) {
      execSync("bash scripts/compute-checksums.sh", { cwd: targetDir, stdio: "pipe" });
      try {
        execSync("bash scripts/core-integrity.sh", { cwd: targetDir, stdio: "pipe" });
        is.stop("Kernel integrity verified");
      } catch {
        is.stop("Kernel integrity issues found");
        warn("Run scripts/core-integrity.sh to investigate");
      }
    } else {
      is.stop("Kernel integrity verified");
    }
  } catch {
    is.stop("Kernel integrity check skipped");
  }

  // ── 5. Check dependencies ────────────────────────────────────────────────
  if (!options.skipDeps) {
    await checkDeps();
  }

  // ── 6. Setup wizard (personalization) ────────────────────────────────────
  if (!options.skipSetup) {
    await runSetupWizard(targetDir);
  }

  // ── 7. Cloud sync detection ──────────────────────────────────────────────
  const alreadySynced = await detectExistingSync(targetDir);
  if (alreadySynced) {
    success("Cloud sync already configured — skipping setup");
  }

  // ── 8. Package discovery & installation ──────────────────────────────────
  const installedPackageSlugs: string[] = [];
  if (!options.skipPackages) {
    const registryUrl = getRegistryUrl(targetDir);
    let authToken: AuthToken | null = null;

    // Check for existing auth token
    const existingToken = loadToken();
    if (existingToken && !isTokenExpired(existingToken)) {
      authToken = existingToken;
      info(`Already signed in as ${chalk.cyan(authToken.email)}`);
    } else {
      const hasAccount = await confirm({
        message: "Do you have an HQ account?",
        initialValue: false,
      });

      if (isCancel(hasAccount)) {
        cancel("Setup cancelled");
        process.exit(0);
      }

      if (hasAccount) {
        const as = createSpinner();
        as.start("Authenticating with HQ registry");
        try {
          authToken = await startAuthFlow(registryUrl);
          as.stop(`Signed in as ${chalk.cyan(authToken.email)}`);
        } catch {
          as.stop("Authentication failed");
          warn("Continuing without login — sign in later with: hq login");
        }
      } else {
        info("Visit " + chalk.cyan("hq.sh") + " to create an account and browse packages");
      }
    }

    // Fetch packages
    const ps = createSpinner();
    ps.start("Discovering packages");

    let choices: PackageChoice[] = [];
    try {
      const allPackages = await fetchPublicPackages(registryUrl);

      if (allPackages.length > 0) {
        let entitlements: { slug: string; tier: string; granted_at: string; expires_at?: string }[] = [];
        if (authToken) {
          entitlements = await fetchEntitlements(
            registryUrl,
            authToken.clerk_session_token
          );
        }

        choices = buildPackageChoices(allPackages, entitlements);
        ps.stop("Packages discovered");

        // Display package list
        const entitled = choices.filter((c) => c.entitled);
        const available = choices.filter((c) => !c.entitled);

        if (entitled.length > 0) {
          log.message(chalk.bold("Your packages:"));
          for (const choice of entitled) {
            console.log(chalk.green("  [✓] ") + formatPackageChoice(choice));
          }
        }

        if (available.length > 0) {
          log.message(chalk.bold("Available packages:"));
          for (const choice of available) {
            console.log(chalk.dim("  [ ] ") + formatPackageChoice(choice));
          }
        }

        // If user has entitled packages or free packages are available
        const installable = authToken
          ? entitled
          : choices.filter((c) => c.pkg.tier === "free");

        if (installable.length > 0) {
          const installAll = await confirm({
            message: `Install ${installable.length} package${installable.length === 1 ? "" : "s"}?`,
            initialValue: true,
          });

          if (isCancel(installAll)) {
            cancel("Setup cancelled");
            process.exit(0);
          }

          if (installAll) {
            const slugsToInstall = installable.map((c) => c.pkg.slug);
            const pis = createSpinner();
            pis.start(`Installing ${slugsToInstall.length} package${slugsToInstall.length === 1 ? "" : "s"}`);

            const installed = await installSelectedPackages(
              registryUrl,
              slugsToInstall,
              targetDir,
              authToken?.clerk_session_token
            );

            if (installed.length === slugsToInstall.length) {
              pis.stop(`${installed.length} package${installed.length === 1 ? "" : "s"} installed`);
            } else if (installed.length > 0) {
              pis.stop(`${installed.length}/${slugsToInstall.length} packages installed`);
              warn(
                `${slugsToInstall.length - installed.length} package${slugsToInstall.length - installed.length === 1 ? "" : "s"} failed to install`
              );
            } else {
              pis.stop("Package installation failed");
              warn("Install packages later with: hq install <name>");
            }

            installedPackageSlugs.push(...installed);
          }
        }
      } else {
        ps.stop("No packages available");
      }
    } catch {
      ps.stop("Package registry unavailable");
      info("Install packages later with: hq install <name>");
    }
  }

  // ── 9. Install hq-cli ───────────────────────────────────────────────────
  if (!options.skipCli) {
    const installCli = await confirm({
      message: "Install @indigoai-us/hq-cli globally for module management?",
      initialValue: true,
    });

    if (isCancel(installCli)) {
      cancel("Setup cancelled");
      process.exit(0);
    }

    if (installCli) {
      const cs = createSpinner();
      cs.start("Installing @indigoai-us/hq-cli");
      try {
        execSync("npm install -g @indigoai-us/hq-cli", { stdio: "pipe" });
        cs.stop("@indigoai-us/hq-cli installed");
      } catch {
        cs.stop("@indigoai-us/hq-cli installation failed");
        warn("Install later with: npm install -g @indigoai-us/hq-cli");
      }
    }
  }

  // ── 10. Cloud sync setup ─────────────────────────────────────────────────
  if (!options.skipSync && !alreadySynced) {
    const setupSync = await confirm({
      message: "Set up cloud sync? (enables mobile access via hq.indigoai.com)",
      initialValue: false,
    });

    if (isCancel(setupSync)) {
      cancel("Setup cancelled");
      process.exit(0);
    }

    if (setupSync) {
      step("Cloud sync setup will be available after running /setup in Claude Code");
      step("Run: hq sync init");
    }
  }

  // ── 11. Team join flow ───────────────────────────────────────────────────
  if (options.join) {
    const js = createSpinner();
    js.start("Joining team...");
    try {
      const response = await fetch("https://hq.indigoai.com/api/teams/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: options.join }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error((data as any).error || `Join failed: ${response.statusText}`);
      }

      const result = (await response.json()) as { teamId: string; teamName: string };
      js.stop(`Joined team: ${result.teamName}`);
    } catch (err) {
      js.stop("Team join failed");
      warn(`${err instanceof Error ? err.message : "Unknown error"}`);
      warn("HQ was still scaffolded — join a team later with 'hq team join'");
    }
  }

  // ── 12. Index with qmd ──────────────────────────────────────────────────
  try {
    execSync("qmd index .", { cwd: targetDir, stdio: "pipe" });
    success("Indexed HQ for search");
  } catch {
    // qmd not installed, skip silently — already warned in deps check
  }

  // ── 13. Setup summary ───────────────────────────────────────────────────
  if (installedPackageSlugs.length > 0) {
    log.message(chalk.bold("Installed packages:"));
    for (const slug of installedPackageSlugs) {
      console.log(chalk.green("  ✓ ") + slug);
    }
  }

  // ── 14. Next steps ──────────────────────────────────────────────────────
  nextSteps(displayDir);
}

// ── Setup Wizard ──────────────────────────────────────────────────────────────

async function runSetupWizard(targetDir: string): Promise<void> {
  log.step("Personalize your HQ");

  const agentsPath = path.join(targetDir, "agents.md");

  // Skip if agents.md already exists (idempotency)
  if (fs.existsSync(agentsPath)) {
    info("Profile already exists (agents.md) — skipping setup wizard");
    info("Run /personal-interview inside Claude Code to update your profile");
    return;
  }

  const setup = await group(
    {
      name: () =>
        text({
          message: "What's your name?",
          placeholder: "e.g. Jane Smith",
          validate: (value) => {
            if (!value || !value.trim()) return "Name is required";
          },
        }),
      role: () =>
        text({
          message: "What do you do? (role, industry)",
          placeholder: "e.g. Full-stack developer at Acme",
        }),
      goals: () =>
        text({
          message: "What are your main goals for HQ?",
          placeholder: "e.g. Automate code reviews, manage multiple projects",
        }),
    },
    {
      onCancel: () => {
        cancel("Setup cancelled");
        process.exit(0);
      },
    }
  );

  // Write agents.md profile
  const name = setup.name || "HQ User";
  const role = setup.role || "";
  const goals = setup.goals || "";
  const today = new Date().toISOString().split("T")[0];

  const agentsContent = [
    `# ${name}'s Profile`,
    "",
    "## About",
    role ? `${name} — ${role}` : name,
    "",
    "## Goals",
    goals || "_(run /personal-interview to fill in)_",
    "",
    "## Setup",
    `- Created: ${today}`,
    "- Run `/personal-interview` for a deeper profile with voice and communication style.",
    "",
  ].join("\n");

  fs.writeFileSync(agentsPath, agentsContent);
  success("Profile created (agents.md)");

  // Scaffold personal knowledge repo
  await scaffoldKnowledgeRepo(targetDir);
}

// ── Knowledge Repo Scaffold ───────────────────────────────────────────────────

async function scaffoldKnowledgeRepo(targetDir: string): Promise<void> {
  const knowledgeDir = path.join(targetDir, "repos", "public", "knowledge-personal");
  const symlinkPath = path.join(targetDir, "knowledge", "personal");

  // Skip if already exists
  if (fs.existsSync(knowledgeDir)) {
    info("Personal knowledge repo already exists — skipping");
    return;
  }

  const ks = createSpinner();
  ks.start("Scaffolding personal knowledge repo...");

  try {
    fs.ensureDirSync(knowledgeDir);
    fs.writeFileSync(
      path.join(knowledgeDir, "README.md"),
      "# Personal Knowledge\n\nYour personal knowledge base.\n"
    );

    // Init git repo if git is available
    if (hasGit()) {
      execSync("git init && git add -A && git commit -m 'init: personal knowledge repo'", {
        cwd: knowledgeDir,
        stdio: "pipe",
      });
    }

    // Create symlink
    if (!fs.existsSync(symlinkPath)) {
      fs.ensureDirSync(path.dirname(symlinkPath));
      fs.symlinkSync("../../repos/public/knowledge-personal", symlinkPath);
    }

    ks.stop("Personal knowledge repo created");
  } catch (err) {
    ks.stop("Knowledge repo setup failed");
    warn("You can create it later: mkdir -p repos/public/knowledge-personal");
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function countFiles(targetDir: string, subdir: string, ext: string): number {
  const dir = path.join(targetDir, subdir);
  if (!fs.existsSync(dir)) return 0;
  return fs.readdirSync(dir).filter((f) => f.endsWith(ext)).length;
}

function countWorkers(targetDir: string): number {
  const dir = path.join(targetDir, "workers");
  if (!fs.existsSync(dir)) return 0;
  return fs
    .readdirSync(dir, { recursive: true })
    .filter((f) => String(f).endsWith("worker.yaml")).length;
}

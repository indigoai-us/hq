import * as path from "path";
import fs from "fs-extra";
import { createInterface } from "readline";
import { createRequire } from "node:module";
import chalk from "chalk";
import { banner, success, warn, step, info, nextSteps, stepStatus } from "./ui.js";
import { checkDeps } from "./deps.js";
import { initGit, hasGit } from "./git.js";
import { execSync } from "child_process";
import { fetchTemplate } from "./fetch-template.js";
import { detectExistingSync } from "./cloud-sync.js";
import { startAuthFlow, startDeviceCodeFlow, saveToken, loadToken, isTokenExpired } from "./auth.js";
import type { AuthToken } from "./auth.js";
import { setupTeams } from "./team-setup.js";
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
  tag?: string;
  localTemplate?: string;
  join?: string;
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

  // 0. Setup mode choice: personal HQ or team sign-in
  let setupMode: "personal" | "team" = "personal";
  let teamAuthToken: AuthToken | null = null;

  if (!options.join) {
    const modeAnswer = await prompt(
      `${chalk.bold("How would you like to get started?")}\n` +
        `    ${chalk.cyan("[1]")} Set up personal HQ\n` +
        `    ${chalk.cyan("[2]")} Sign in to join a team\n` +
        `\n  Choose (1/2)`,
      "1"
    );

    if (modeAnswer === "2") {
      setupMode = "team";

      // Check for existing valid token first
      const existing = loadToken();
      if (existing && !isTokenExpired(existing)) {
        teamAuthToken = existing;
        info(`Already signed in as ${chalk.cyan(teamAuthToken.email)}`);
      } else {
        // Start device code auth flow
        const authLabel = "Signing in to HQ";
        stepStatus(authLabel, "running");
        try {
          teamAuthToken = await startDeviceCodeFlow("https://hq.indigoai.com/api");
          stepStatus(authLabel, "done");
          success(`Signed in as ${chalk.cyan(teamAuthToken.email)}`);
        } catch (err) {
          stepStatus(authLabel, "failed");
          warn(
            `Sign-in failed: ${err instanceof Error ? err.message : "Unknown error"}`
          );
          info("Continuing with personal HQ setup — you can sign in later with: hq team join");
          setupMode = "personal";
        }
      }
    }
  }

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
    const computeChecksumsScript = path.join(targetDir, "scripts", "compute-checksums.sh");
    const coreIntegrityScript = path.join(targetDir, "scripts", "core-integrity.sh");
    const hasComputeChecksums = fs.existsSync(computeChecksumsScript);
    const hasCoreIntegrity = fs.existsSync(coreIntegrityScript);
    if (hasComputeChecksums && hasCoreIntegrity) {
      execSync("bash scripts/compute-checksums.sh", { cwd: targetDir, stdio: "pipe" });
      try {
        execSync("bash scripts/core-integrity.sh", { cwd: targetDir, stdio: "pipe" });
        stepStatus(integrityLabel, "done");
      } catch {
        stepStatus(integrityLabel, "failed");
        warn("Kernel integrity check found issues — run scripts/core-integrity.sh to investigate");
      }
    } else {
      // Scripts not present in this template version — skip silently
      stepStatus(integrityLabel, "done");
    }
  } catch {
    stepStatus(integrityLabel, "failed");
    // governance bootstrap should never abort the scaffold
  }

  // 5. Check dependencies
  const depsLabel = "Checking dependencies";
  stepStatus(depsLabel, "running");
  if (!options.skipDeps) {
    await checkDeps();
  }
  stepStatus(depsLabel, "done");

  // 6. Smart cloud sync detection
  const alreadySynced = await detectExistingSync(targetDir);
  if (alreadySynced) {
    success("Cloud sync already configured — skipping setup");
  }

  // 6a. Team setup (if user chose team sign-in)
  let teamSetupResult: { teams: { name: string; slug: string }[]; companySlugs: string[] } | null = null;
  if (setupMode === "team" && teamAuthToken) {
    console.log();
    teamSetupResult = await setupTeams(teamAuthToken, targetDir);

    if (teamSetupResult.teams.length > 0) {
      console.log();
      success(
        `${teamSetupResult.teams.length} team${teamSetupResult.teams.length === 1 ? "" : "s"} configured`
      );
    }
  }

  // 6b. Package discovery & installation
  const installedPackageSlugs: string[] = [];
  if (!options.skipPackages) {
    console.log();
    const registryUrl = getRegistryUrl(targetDir);
    let authToken: AuthToken | null = null;

    // Check for existing auth token
    const existingToken = loadToken();
    if (existingToken && !isTokenExpired(existingToken)) {
      authToken = existingToken;
      info(`Already signed in as ${chalk.cyan(authToken.email)}`);
    } else {
      const hasAccount = await confirm("Do you have an HQ account?");
      if (hasAccount) {
        const authLabel = "Authenticating with HQ registry";
        stepStatus(authLabel, "running");
        try {
          authToken = await startAuthFlow(registryUrl);
          stepStatus(authLabel, "done");
          success(`Signed in as ${chalk.cyan(authToken.email)}`);
        } catch {
          stepStatus(authLabel, "failed");
          warn("Authentication failed — continuing without login");
          info("You can sign in later with: hq login");
        }
      } else {
        info("Visit " + chalk.cyan("hq.sh") + " to create an account and browse packages");
      }
    }

    // Fetch packages
    const packagesLabel = "Discovering packages";
    stepStatus(packagesLabel, "running");

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
        stepStatus(packagesLabel, "done");

        // Display package list
        const entitled = choices.filter((c) => c.entitled);
        const available = choices.filter((c) => !c.entitled);

        if (entitled.length > 0) {
          console.log();
          console.log(chalk.bold("  Your packages:"));
          for (const choice of entitled) {
            console.log(chalk.green("  [✓] ") + formatPackageChoice(choice));
          }
        }

        if (available.length > 0) {
          console.log();
          console.log(chalk.bold("  Available packages:"));
          for (const choice of available) {
            console.log(chalk.dim("  [ ] ") + formatPackageChoice(choice));
          }
        }

        // If user has entitled packages or free packages are available
        const installable = authToken
          ? entitled
          : choices.filter((c) => c.pkg.tier === "free");

        if (installable.length > 0) {
          console.log();
          const installAll = await confirm(
            `Install ${installable.length} package${installable.length === 1 ? "" : "s"}?`
          );

          if (installAll) {
            const slugsToInstall = installable.map((c) => c.pkg.slug);
            const installLabel = `Installing ${slugsToInstall.length} package${slugsToInstall.length === 1 ? "" : "s"}`;
            stepStatus(installLabel, "running");

            const installed = await installSelectedPackages(
              registryUrl,
              slugsToInstall,
              targetDir,
              authToken?.clerk_session_token
            );

            if (installed.length === slugsToInstall.length) {
              stepStatus(installLabel, "done");
            } else if (installed.length > 0) {
              stepStatus(installLabel, "done");
              warn(
                `${slugsToInstall.length - installed.length} package${slugsToInstall.length - installed.length === 1 ? "" : "s"} failed to install`
              );
            } else {
              stepStatus(installLabel, "failed");
              warn("Package installation failed — you can install packages later with: hq install <name>");
            }

            installedPackageSlugs.push(...installed);
          }
        }
      } else {
        stepStatus(packagesLabel, "done");
        info("No packages available");
      }
    } catch {
      stepStatus(packagesLabel, "failed");
      info("Package registry unavailable — you can install packages later with: hq install <name>");
    }
  }

  // 7. Install hq-cli
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
        warn("Failed to install @indigoai-us/hq-cli — you can install it later with: npm install -g @indigoai-us/hq-cli");
      }
    }
  }

  // 8. Cloud sync setup
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

  // 7b. Team join flow
  if (options.join) {
    const joinLabel = "Joining team...";
    stepStatus(joinLabel, "running");
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
      stepStatus(joinLabel, "done");
      success(`Joined team: ${result.teamName}`);
    } catch (err) {
      stepStatus(joinLabel, "failed");
      warn(`Team join failed: ${err instanceof Error ? err.message : "Unknown error"}`);
      warn("HQ was still scaffolded — you can join a team later with 'hq team join'");
    }
  }

  // 8. Index with qmd
  try {
    execSync("qmd index .", { cwd: targetDir, stdio: "pipe" });
    success("Indexed HQ for search");
  } catch {
    // qmd not installed, skip silently — already warned in deps check
  }

  // 10. Setup summary
  if (installedPackageSlugs.length > 0) {
    console.log();
    console.log(chalk.bold("  Installed packages:"));
    for (const slug of installedPackageSlugs) {
      console.log(chalk.green("  ✓ ") + slug);
    }
  }

  if (teamSetupResult && teamSetupResult.teams.length > 0) {
    console.log();
    console.log(chalk.bold("  Team content:"));
    for (const team of teamSetupResult.teams) {
      console.log(chalk.green("  ✓ ") + `${team.name} → companies/${team.slug}/`);
    }
  }

  // 11. Next steps
  nextSteps(displayDir);
}

import { execSync } from "child_process";
import { createInterface } from "readline";
import chalk from "chalk";
import { success, warn, info } from "./ui.js";
import { detectPlatform } from "./platform.js";
import type { PlatformInfo } from "./platform.js";

export type DepStatus = "installed" | "just-installed" | "missing" | "skipped";

export interface DepResult {
  name: string;
  required: boolean;
  status: DepStatus;
  version?: string;
  installHint: string;
}

export interface InstallCommands {
  brew?: string;
  apt?: string;
  dnf?: string;
  pacman?: string;
  npm?: string;
  winget?: string;
  choco?: string;
}

export interface Dep {
  name: string;
  command: string;
  required: boolean;
  installHint: string;
  autoInstallable: boolean;
  installCommands: InstallCommands;
}

const deps: Dep[] = [
  // ── Core (required — installer blocks if missing) ──────────────────────
  {
    name: "Node.js",
    command: "node --version",
    required: true,
    installHint: "https://nodejs.org",
    autoInstallable: false,
    installCommands: {},
  },
  {
    name: "git",
    command: "git --version",
    required: true,
    installHint: "https://git-scm.com/downloads",
    autoInstallable: false,
    installCommands: {},
  },
  {
    name: "gh CLI",
    command: "gh --version",
    required: true,
    installHint: "https://cli.github.com",
    autoInstallable: true,
    installCommands: {
      brew: "brew install gh",
      apt: "sudo apt install gh",
      dnf: "sudo dnf install gh",
      pacman: "sudo pacman -S github-cli",
      winget: "winget install --id GitHub.cli -e",
      choco: "choco install gh -y",
    },
  },
  {
    name: "Claude Code CLI",
    command: "claude --version",
    required: true,
    installHint: "npm install -g @anthropic-ai/claude-code",
    autoInstallable: true,
    installCommands: {
      npm: "npm install -g @anthropic-ai/claude-code",
    },
  },

  // ── Optional (installer continues if missing) ──────────────────────────
  {
    name: "qmd (search)",
    command: "qmd --version",
    required: false,
    installHint: "npm install -g @tobilu/qmd",
    autoInstallable: true,
    installCommands: {
      npm: "npm install -g @tobilu/qmd",
    },
  },
  {
    name: "yq",
    command: "yq --version",
    required: false,
    installHint: "https://github.com/mikefarah/yq#install",
    autoInstallable: true,
    installCommands: {
      brew: "brew install yq",
      apt: "sudo snap install yq",
      dnf: "sudo dnf install yq",
      pacman: "sudo pacman -S yq",
      winget: "winget install --id MikeFarah.yq -e",
      choco: "choco install yq -y",
    },
  },
  {
    name: "Vercel CLI",
    command: "vercel --version",
    required: false,
    installHint: "npm install -g vercel",
    autoInstallable: true,
    installCommands: {
      npm: "npm install -g vercel",
    },
  },
  {
    name: "hq-cli",
    command: "hq --version",
    required: false,
    installHint: "npm install -g @indigoai-us/hq-cli",
    autoInstallable: true,
    installCommands: {
      npm: "npm install -g @indigoai-us/hq-cli",
    },
  },
];

/**
 * Pick the best install command for a dep given the detected platform.
 * Prefers the system package manager, falls back to npm if available.
 * Returns null when no suitable command exists (e.g. Node.js — manual install).
 */
export function getInstallCommand(
  dep: Dep,
  platform: PlatformInfo,
): string | null {
  const cmds = dep.installCommands;

  // Try system package manager first (yum falls back to dnf commands)
  const pm = platform.packageManager === "yum" ? "dnf" : platform.packageManager;
  if (pm && cmds[pm as keyof InstallCommands]) {
    return cmds[pm as keyof InstallCommands]!;
  }

  // Fall back to npm
  if (platform.npmAvailable && cmds.npm) {
    return cmds.npm;
  }

  return null;
}

function checkCommand(command: string): string | null {
  try {
    const output = execSync(command, { stdio: "pipe", encoding: "utf-8" });
    const version = output.trim().split("\n")[0];
    return version;
  } catch {
    return null;
  }
}

/**
 * Standalone confirm helper using readline directly.
 * Avoids importing from scaffold.ts to prevent circular dependencies.
 */
async function confirm(question: string, defaultYes: boolean): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const hint = defaultYes ? "Y/n" : "y/N";
  return new Promise((resolve) => {
    rl.question(`  ? ${question} (${hint}) `, (answer) => {
      rl.close();
      const trimmed = answer.trim();
      if (!trimmed) {
        resolve(defaultYes);
      } else {
        resolve(trimmed.toLowerCase().startsWith("y"));
      }
    });
  });
}

export async function checkDeps(): Promise<{ allRequired: boolean }> {
  console.log();
  console.log("  Checking dependencies...");

  const platform = detectPlatform();
  let allRequired = true;
  const results: DepResult[] = [];

  for (const dep of deps) {
    const version = checkCommand(dep.command);

    if (version) {
      success(`${dep.name} ${version}`);
      results.push({ name: dep.name, required: dep.required, status: "installed", version, installHint: dep.installHint });
      continue;
    }

    // Dep is missing — decide how to handle
    const installCmd = dep.autoInstallable ? getInstallCommand(dep, platform) : null;

    if (installCmd) {
      // Can offer auto-install
      const defaultYes = dep.required;
      const optionalTag = dep.required ? "" : " (optional)";
      const accepted = await confirm(
        `${dep.name} not found.${optionalTag} Install now? [${installCmd}]`,
        defaultYes,
      );

      if (accepted) {
        info(`Running: ${installCmd}`);
        try {
          execSync(installCmd, { stdio: "inherit" });
        } catch {
          // install command failed — will be caught by re-check below
        }

        // Re-check after install attempt
        const recheck = checkCommand(dep.command);
        if (recheck) {
          success(`${dep.name} ${recheck}`);
          results.push({ name: dep.name, required: dep.required, status: "just-installed", version: recheck, installHint: dep.installHint });
          continue;
        } else if (dep.required) {
          warn(`${dep.name} install failed — this is required to continue`);
          results.push({ name: dep.name, required: dep.required, status: "missing", installHint: dep.installHint });
          allRequired = false;
        } else {
          info(`${dep.name} install didn't stick — you can install it later: ${dep.installHint}`);
          results.push({ name: dep.name, required: dep.required, status: "skipped", installHint: dep.installHint });
        }
      } else {
        // User declined
        if (dep.required) {
          warn(`${dep.name} is required — can't continue without it`);
          results.push({ name: dep.name, required: dep.required, status: "missing", installHint: dep.installHint });
          allRequired = false;
        } else {
          info(`${dep.name} skipped — you can install it later: ${dep.installHint}`);
          results.push({ name: dep.name, required: dep.required, status: "skipped", installHint: dep.installHint });
        }
      }
    } else {
      // No auto-install available — show manual hint
      if (dep.required) {
        warn(`${dep.name} not found`);
        info(`Install manually: ${dep.installHint}`);
        results.push({ name: dep.name, required: dep.required, status: "missing", installHint: dep.installHint });
        allRequired = false;
      } else {
        info(`${dep.name} (optional) — install later: ${dep.installHint}`);
        results.push({ name: dep.name, required: dep.required, status: "skipped", installHint: dep.installHint });
      }
    }
  }

  // ─── Summary Banner ──────────────────────────────────────────────────────
  printDepSummary(results, allRequired);

  return { allRequired };
}

function printDepSummary(results: DepResult[], allRequired: boolean): void {
  const statusIcon = (r: DepResult): string => {
    switch (r.status) {
      case "installed":
        return chalk.green("✓");
      case "just-installed":
        return chalk.green("✓") + chalk.cyan(" new");
      case "missing":
        return chalk.red("✗");
      case "skipped":
        return chalk.dim("~");
    }
  };

  console.log();
  console.log(chalk.dim("  ─── Dependency Summary ───────────────────────"));
  console.log();

  for (const r of results) {
    const icon = statusIcon(r);
    const ver = r.version ? chalk.dim(` ${r.version}`) : "";
    const tag = r.required ? "" : chalk.dim(" (optional)");
    console.log(`  ${icon}  ${r.name}${ver}${tag}`);
  }

  console.log();

  const missing = results.filter((r) => r.required && r.status === "missing");

  if (missing.length > 0) {
    warn("Some required dependencies are missing:");
    console.log();
    for (const m of missing) {
      console.log(chalk.yellow("    →") + ` ${m.name}: ${chalk.dim(m.installHint)}`);
    }
    console.log();
  } else {
    success("All required dependencies installed");
  }
}

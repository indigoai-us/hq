import * as os from "os";
import { execSync } from "child_process";
import { createInterface } from "readline";
import { success, warn, info, step } from "./ui.js";

type Platform = "macos" | "windows" | "linux";

function getPlatform(): Platform {
  const p = os.platform();
  if (p === "darwin") return "macos";
  if (p === "win32") return "windows";
  return "linux";
}

function hasBrew(): boolean {
  try {
    execSync("brew --version", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function hasWinget(): boolean {
  try {
    execSync("winget --version", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function hasChoco(): boolean {
  try {
    execSync("choco --version", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

interface InstallOption {
  cmd: string;
  label: string;
}

interface Dep {
  name: string;
  check: string;
  required: boolean;
  getInstallOptions: (platform: Platform) => InstallOption[];
  manualHint: (platform: Platform) => string;
}

const deps: Dep[] = [
  {
    name: "Claude Code CLI",
    check: "claude --version",
    required: true,
    getInstallOptions: () => [
      { cmd: "npm install -g @anthropic-ai/claude-code", label: "npm" },
    ],
    manualHint: () => "npm install -g @anthropic-ai/claude-code",
  },
  {
    name: "qmd (search)",
    check: os.platform() === "win32" ? "where qmd" : "which qmd",
    required: true,
    getInstallOptions: () => [
      { cmd: "npm install -g @tobilu/qmd", label: "npm" },
    ],
    manualHint: () => "npm install -g @tobilu/qmd",
  },
  {
    name: "gh CLI",
    check: "gh --version",
    required: false,
    getInstallOptions: (platform) => {
      const options: InstallOption[] = [];
      if (platform === "macos" && hasBrew()) {
        options.push({ cmd: "brew install gh", label: "Homebrew" });
      }
      if (platform === "windows") {
        if (hasWinget()) {
          options.push({ cmd: "winget install --id GitHub.cli", label: "winget" });
        }
        if (hasChoco()) {
          options.push({ cmd: "choco install gh", label: "Chocolatey" });
        }
      }
      if (platform === "linux" && hasBrew()) {
        options.push({ cmd: "brew install gh", label: "Linuxbrew" });
      }
      return options;
    },
    manualHint: () => "See https://cli.github.com for install instructions",
  },
];

function checkCommand(command: string): string | null {
  try {
    const output = execSync(command, { stdio: "pipe", encoding: "utf-8" });
    return output.trim().split("\n")[0];
  } catch {
    return null;
  }
}

async function confirm(question: string, defaultYes = true): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const hint = defaultYes ? "Y/n" : "y/N";
  return new Promise((resolve) => {
    rl.question(`  ? ${question} (${hint}) `, (answer) => {
      rl.close();
      if (!answer.trim()) return resolve(defaultYes);
      resolve(answer.trim().toLowerCase().startsWith("y"));
    });
  });
}

function tryInstall(cmd: string, name: string): boolean {
  try {
    step(`Installing ${name}...`);
    execSync(cmd, { stdio: "inherit", timeout: 120000 });
    success(`Installed ${name}`);
    return true;
  } catch {
    warn(`Failed to install ${name}`);
    return false;
  }
}

export async function checkDeps(): Promise<{ allRequired: boolean }> {
  const platform = getPlatform();
  console.log();
  console.log("  Checking dependencies...");

  let allRequired = true;

  for (const dep of deps) {
    const version = checkCommand(dep.check);
    if (version) {
      // If the check was which/where, just show "installed" instead of the path
      const display = dep.check.startsWith("which ") || dep.check.startsWith("where ")
        ? "installed"
        : version;
      success(`${dep.name} ${display}`);
      continue;
    }

    const installOptions = dep.getInstallOptions(platform);

    if (installOptions.length > 0) {
      // We have at least one auto-install option
      const option = installOptions[0]; // use the first (preferred) option
      const install = await confirm(
        `${dep.name} not found. Install via ${option.label}?`
      );
      if (install) {
        const ok = tryInstall(option.cmd, dep.name);
        if (!ok) {
          info(`Manual install: ${dep.manualHint(platform)}`);
          if (dep.required) allRequired = false;
        }
      } else {
        if (dep.required) {
          warn(`${dep.name} is required`);
          info(`Install later: ${dep.manualHint(platform)}`);
          allRequired = false;
        } else {
          info(`Skipped ${dep.name} (optional)`);
        }
      }
    } else {
      // No auto-install available for this platform
      if (dep.required) {
        warn(`${dep.name} not found`);
        info(`Install: ${dep.manualHint(platform)}`);
        allRequired = false;
      } else {
        info(`${dep.name} (optional) — ${dep.manualHint(platform)}`);
      }
    }
  }

  return { allRequired };
}

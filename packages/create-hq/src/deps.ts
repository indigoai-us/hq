import { execSync } from "child_process";
import { success, warn, info } from "./ui.js";
import type { PlatformInfo } from "./platform.js";

export interface InstallCommands {
  brew?: string;
  apt?: string;
  dnf?: string;
  pacman?: string;
  npm?: string;
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
  {
    name: "Node.js",
    command: "node --version",
    required: true,
    installHint: "https://nodejs.org",
    autoInstallable: false,
    installCommands: {},
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
  {
    name: "qmd (search)",
    command: "qmd --version",
    required: true,
    installHint: "npm install -g @tobilu/qmd",
    autoInstallable: true,
    installCommands: {
      npm: "npm install -g @tobilu/qmd",
    },
  },
  {
    name: "yq",
    command: "yq --version",
    required: true,
    installHint: "brew install yq",
    autoInstallable: true,
    installCommands: {
      brew: "brew install yq",
      apt: "sudo snap install yq",
      dnf: "sudo dnf install yq",
      pacman: "sudo pacman -S yq",
    },
  },
  {
    name: "gh CLI",
    command: "gh --version",
    required: false,
    installHint: "brew install gh",
    autoInstallable: true,
    installCommands: {
      brew: "brew install gh",
      apt: "sudo apt install gh",
      dnf: "sudo dnf install gh",
      pacman: "sudo pacman -S github-cli",
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
  if (pm && cmds[pm]) {
    return cmds[pm]!;
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

export function checkDeps(): { allRequired: boolean } {
  console.log();
  console.log("  Checking dependencies...");

  let allRequired = true;

  for (const dep of deps) {
    const version = checkCommand(dep.command);
    if (version) {
      success(`${dep.name} ${version}`);
    } else if (dep.required) {
      warn(`${dep.name} not found`);
      info(`Install: ${dep.installHint}`);
      allRequired = false;
    } else {
      info(`${dep.name} (optional) — ${dep.installHint}`);
    }
  }

  return { allRequired };
}

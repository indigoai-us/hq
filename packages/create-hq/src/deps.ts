import { execSync } from "child_process";
import { success, warn, info } from "./ui.js";

interface Dep {
  name: string;
  command: string;
  required: boolean;
  installHint: string;
}

const deps: Dep[] = [
  {
    name: "Node.js",
    command: "node --version",
    required: true,
    installHint: "https://nodejs.org",
  },
  {
    name: "Claude Code CLI",
    command: "claude --version",
    required: true,
    installHint: "npm install -g @anthropic-ai/claude-code",
  },
  {
    name: "qmd (search)",
    command: "qmd --version",
    required: true,
    installHint: "brew install tobi/tap/qmd",
  },
  {
    name: "gh CLI",
    command: "gh --version",
    required: false,
    installHint: "brew install gh",
  },
  {
    name: "Vercel CLI",
    command: "vercel --version",
    required: false,
    installHint: "npm install -g vercel",
  },
];

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

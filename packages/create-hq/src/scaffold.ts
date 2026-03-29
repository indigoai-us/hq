import * as path from "path";
import * as fs from "fs-extra";
import { createInterface } from "readline";
import { createRequire } from "node:module";
import { banner, success, warn, step, nextSteps } from "./ui.js";
import { checkDeps } from "./deps.js";
import { initGit, hasGit } from "./git.js";
import { execSync } from "child_process";
import { fetchTemplate } from "./fetch-template.js";

const require = createRequire(import.meta.url);
const pkg = require("../package.json") as { version: string };

interface ScaffoldOptions {
  skipDeps?: boolean;
  skipCli?: boolean;
  skipSync?: boolean;
  tag?: string;
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

  // 2. Fetch template from GitHub
  step("Fetching HQ template from GitHub...");
  const { version } = await fetchTemplate(targetDir, options.tag);

  // Count what we fetched
  const commandCount = fs.existsSync(path.join(targetDir, ".claude", "commands"))
    ? fs.readdirSync(path.join(targetDir, ".claude", "commands")).filter((f) => f.endsWith(".md")).length
    : 0;
  const workerCount = fs.existsSync(path.join(targetDir, "workers"))
    ? fs.readdirSync(path.join(targetDir, "workers"), { recursive: true })
        .filter((f) => String(f).endsWith("worker.yaml")).length
    : 0;

  success(`Fetched HQ template ${version} (${commandCount} commands, ${workerCount} workers)`);

  // 3. Git init
  if (hasGit()) {
    initGit(targetDir);
    success("Initialized git repository");
  } else {
    warn("git not found — skipping git init");
  }

  // 4. Check dependencies
  if (!options.skipDeps) {
    checkDeps();
  }

  // 5. Install hq-cli
  if (!options.skipCli) {
    console.log();
    const installCli = await confirm(
      "Install @indigoai-us/hq-cli globally for module management?"
    );
    if (installCli) {
      try {
        step("Installing @indigoai-us/hq-cli...");
        execSync("npm install -g @indigoai-us/hq-cli", { stdio: "pipe" });
        success("Installed @indigoai-us/hq-cli");
      } catch {
        warn("Failed to install @indigoai-us/hq-cli — you can install it later with: npm install -g @indigoai-us/hq-cli");
      }
    }
  }

  // 6. Cloud sync setup
  if (!options.skipSync) {
    console.log();
    const setupSync = await confirm(
      "Set up cloud sync? (enables mobile access via hq.indigoai.com)"
    );
    if (setupSync) {
      step("Cloud sync setup will be available after running /setup in Claude Code");
      step("Run: hq sync init");
    }
  }

  // 7. Index with qmd
  try {
    execSync("qmd index .", { cwd: targetDir, stdio: "pipe" });
    success("Indexed HQ for search");
  } catch {
    // qmd not installed, skip silently — already warned in deps check
  }

  // 8. Next steps
  nextSteps(displayDir);
}

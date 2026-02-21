import * as path from "path";
import * as fs from "fs-extra";
import { createInterface } from "readline";
import { banner, success, warn, step, nextSteps } from "./ui.js";
import { checkDeps } from "./deps.js";
import { initGit, hasGit } from "./git.js";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface ScaffoldOptions {
  skipDeps?: boolean;
  skipCli?: boolean;
  skipSync?: boolean;
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

function getTemplateDir(): string {
  // In the npm package, template is at ../../template relative to dist/
  // In dev, it's at ../../../template relative to src/
  const candidates = [
    path.resolve(__dirname, "..", "..", "template"),
    path.resolve(__dirname, "..", "template"),
    path.resolve(__dirname, "..", "..", "..", "template"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.existsSync(path.join(candidate, ".claude"))) {
      return candidate;
    }
  }

  throw new Error(
    "Could not find HQ template directory. This is a packaging error — please report at https://github.com/indigoai-us/hq/issues"
  );
}

export async function scaffold(
  directory: string,
  options: ScaffoldOptions
): Promise<void> {
  banner();

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

  // 2. Copy template
  step("Creating HQ...");
  const templateDir = getTemplateDir();

  await fs.copy(templateDir, targetDir, {
    filter: (src) => {
      const rel = path.relative(templateDir, src);
      // Skip git internals and node_modules
      if (rel.includes(".git/") || rel.includes("node_modules/")) return false;
      return true;
    },
  });

  // Count what we copied
  const commandCount = fs.existsSync(path.join(targetDir, ".claude", "commands"))
    ? fs.readdirSync(path.join(targetDir, ".claude", "commands")).filter((f) => f.endsWith(".md")).length
    : 0;
  const workerCount = fs.existsSync(path.join(targetDir, "workers"))
    ? fs.readdirSync(path.join(targetDir, "workers"), { recursive: true })
        .filter((f) => String(f).endsWith("worker.yaml")).length
    : 0;

  success(`Copied template (${commandCount} commands, ${workerCount} workers)`);

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
      "Install @indigoai/hq-cli globally for module management?"
    );
    if (installCli) {
      try {
        step("Installing @indigoai/hq-cli...");
        execSync("npm install -g @indigoai/hq-cli", { stdio: "pipe" });
        success("Installed @indigoai/hq-cli");
      } catch {
        warn("Failed to install @indigoai/hq-cli — you can install it later with: npm install -g @indigoai/hq-cli");
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

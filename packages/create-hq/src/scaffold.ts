import * as path from "path";
import fs from "fs-extra";
import { createInterface } from "readline";
import { banner, success, warn, step, nextSteps } from "./ui.js";
import { checkDeps } from "./deps.js";
import { fileURLToPath } from "url";
import { execSync, spawnSync } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface ScaffoldOptions {
  skipDeps?: boolean;
  skipCli?: boolean;
  skipCloud?: boolean;
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

  // 3. Check dependencies
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

  // 5. Cloud sync + session setup
  if (!options.skipCloud) {
    console.log();
    const setupCloud = await confirm(
      "Set up HQ Cloud? (syncs your HQ files and enables remote AI sessions)"
    );
    if (setupCloud) {
      // Step 5a: Authenticate with Clerk
      let authOk = false;
      try {
        step("Authenticating with HQ Cloud...");
        const authResult = spawnSync("hq", ["auth", "login"], {
          stdio: "inherit",
          shell: true,
        });
        if (authResult.status === 0) {
          success("Authenticated with HQ Cloud");
          authOk = true;
        } else {
          warn("Authentication did not complete — you can retry later with: hq auth login");
        }
      } catch {
        warn("Could not run hq auth login — you can retry later with: hq auth login");
      }

      // Step 5b: Upload HQ files to cloud
      if (authOk) {
        let uploadOk = false;
        try {
          step("Uploading HQ files to cloud...");
          const uploadResult = spawnSync(
            "hq",
            ["cloud", "upload", "--hq-root", targetDir, "--on-conflict", "merge"],
            { stdio: "inherit", shell: true },
          );
          if (uploadResult.status === 0) {
            success("HQ files uploaded to cloud");
            uploadOk = true;
          } else {
            warn("Upload did not complete — you can run later with: hq cloud upload");
          }
        } catch {
          warn("Could not upload files — you can run later with: hq cloud upload");
        }

        // Step 5c: Verify sync is working
        if (uploadOk) {
          try {
            const statusResult = spawnSync(
              "hq",
              ["sync", "status"],
              { stdio: "inherit", shell: true, cwd: targetDir },
            );
            if (statusResult.status === 0) {
              success("Cloud sync is configured and working");
            }
          } catch {
            // Non-fatal — sync status is informational
          }
        }
      }

      // Step 5d: Set up Claude token for cloud sessions
      if (authOk) {
        console.log();
        try {
          step("Setting up Claude token for cloud sessions...");
          const tokenResult = spawnSync("hq", ["cloud", "setup-token"], {
            stdio: "inherit",
            shell: true,
          });
          if (tokenResult.status === 0) {
            success("Claude token configured for cloud sessions");
          } else {
            warn("Token setup did not complete — you can retry later with: hq cloud setup-token");
          }
        } catch {
          warn("Could not run hq cloud setup-token — you can retry later with: hq cloud setup-token");
        }
      }
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

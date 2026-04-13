import chalk from "chalk";
import ora, { type Ora } from "ora";

// Strip ANSI escape codes so we can measure visible string width
const ANSI_RE = /\x1B\[[0-9;]*m/g;
const visibleLength = (s: string) => s.replace(ANSI_RE, "").length;

// ─── ASCII Art Banner ────────────────────────────────────────────────────────

export function banner(installerVersion?: string, hqVersion?: string): void {
  const d = chalk.dim;
  const w = chalk.bold.white;
  const c = chalk.white; // city

  console.log();
  console.log(c("                          ^"));
  console.log(c("             _______     ^^^"));
  console.log(c("            |xxxxxxx|  _^^^^^_"));
  console.log(c("            |xxxxxxx| | [][]  |"));
  console.log(c("         ______xxxxx| |[][][] |"));
  console.log(c("        |++++++|xxxx| | [][][]|") + w("      ██╗  ██╗ ██████╗"));
  console.log(c("        |++++++|xxxx| |[][][] |") + w("      ██║  ██║██╔═══██╗"));
  console.log(c("        |++++++|_________ [][]|") + w("      ███████║██║   ██║"));
  console.log(c("        |++++++|=|=|=|=|=| [] |") + w("      ██╔══██║██║▄▄ ██║"));
  console.log(c("        |++++++|=|=|=|=|=|[][]|") + w("      ██║  ██║╚██████╔╝"));
  console.log(c("________|++HH++|  _HHHH__|    |______") + d("╚═╝  ╚═╝ ╚══▀▀═╝"));
  console.log(c("      _______________   ______________      ______________"));
  console.log(c("_____________  ___________    __________________    ____________"));
  console.log();
  console.log(d("  HQ by Indigo — Personal OS for AI Workers"));
  console.log();

  const parts: string[] = [];
  if (installerVersion) {
    parts.push(d(`create-hq v${installerVersion}`));
  }
  if (hqVersion) {
    parts.push(chalk.cyan(`HQ template ${hqVersion}`));
  }

  if (parts.length > 0) {
    console.log("  " + parts.join(d("  ·  ")));
    console.log();
  }
}

// ─── Rotating Status Messages ────────────────────────────────────────────────

const FUN_MESSAGES: string[] = [
  "Brewing coffee for the AI...",
  "Teaching workers their morning routines...",
  "Polishing the command line...",
  "Calibrating the thinking engines...",
  "Warming up the inference cores...",
  "Consulting the oracle...",
  "Stacking the transformers...",
  "Charging the flux capacitors...",
  "Reticulating splines...",
  "Herding the electrons...",
  "Summoning the context window...",
  "Tuning the attention heads...",
  "Spinning up the workers...",
  "Assembling the knowledge graph...",
  "Aligning the neural pathways...",
];

let rotationIndex = 0;

function nextFunMessage(): string {
  const msg = FUN_MESSAGES[rotationIndex % FUN_MESSAGES.length];
  rotationIndex++;
  return msg;
}

// ─── Step Status Tracking ────────────────────────────────────────────────────

const spinners = new Map<string, Ora>();
const rotationTimers = new Map<string, ReturnType<typeof setInterval>>();

function clearRotation(label: string): void {
  const timer = rotationTimers.get(label);
  if (timer) {
    clearInterval(timer);
    rotationTimers.delete(label);
  }
}

export function stepStatus(
  label: string,
  status: "pending" | "running" | "done" | "failed"
): void {
  switch (status) {
    case "pending":
      console.log(chalk.dim("  [ ] ") + chalk.dim(label));
      break;

    case "running": {
      // Stop any existing spinner for this label
      const existing = spinners.get(label);
      if (existing) existing.stop();
      clearRotation(label);

      const spinner = ora({
        text: chalk.white(label),
        prefixText: "  ",
        spinner: "dots",
        color: "cyan",
      }).start();
      spinners.set(label, spinner);

      // Start rotating fun messages (TTY only to avoid noisy CI output)
      if (process.stderr.isTTY) {
        spinner.text = chalk.white(nextFunMessage());
        const timer = setInterval(() => {
          spinner.text = chalk.white(nextFunMessage());
        }, 2500);
        rotationTimers.set(label, timer);
      }
      break;
    }

    case "done": {
      clearRotation(label);
      const s = spinners.get(label);
      if (s) {
        s.succeed(chalk.white(label));
        spinners.delete(label);
      } else {
        console.log(chalk.green("  [✓] ") + chalk.white(label));
      }
      break;
    }

    case "failed": {
      clearRotation(label);
      const sf = spinners.get(label);
      if (sf) {
        sf.fail(chalk.white(label));
        spinners.delete(label);
      } else {
        console.log(chalk.red("  [✗] ") + chalk.white(label));
      }
      break;
    }
  }
}

export function updateSpinnerText(label: string, text: string): void {
  const spinner = spinners.get(label);
  if (spinner) {
    // Temporarily override the fun message rotation with a specific status
    clearRotation(label);
    spinner.text = chalk.white(text);
  }
}

// ─── Progress Bar ───────────────────────────────────────────────────────────

const BAR_WIDTH = 20;

export function progressBar(current: number, total: number, label: string): void {
  const filled = Math.round((current / total) * BAR_WIDTH);
  const empty = BAR_WIDTH - filled;
  const bar = chalk.cyan("█".repeat(filled)) + chalk.dim("░".repeat(empty));
  const count = chalk.dim(`${current}/${total}`);

  // Use process.stderr to write on same line (carriage return)
  if (process.stderr.isTTY) {
    process.stderr.write(`\r  ${bar} ${count} ${chalk.white(label)}   `);
  }
}

export function progressBarDone(total: number, label: string): void {
  const bar = chalk.cyan("█".repeat(BAR_WIDTH));
  const count = chalk.dim(`${total}/${total}`);
  if (process.stderr.isTTY) {
    process.stderr.write(`\r  ${bar} ${count} ${chalk.green("✓")} ${chalk.white(label)}   \n`);
  } else {
    console.log(`  ${bar} ${count} ${chalk.green("✓")} ${chalk.white(label)}`);
  }
}

// ─── Basic Output Helpers ────────────────────────────────────────────────────

export function success(msg: string): void {
  console.log(chalk.green("  ✓") + " " + msg);
}

export function warn(msg: string): void {
  console.log(chalk.yellow("  ✗") + " " + msg);
}

export function info(msg: string): void {
  console.log(chalk.dim("  ~") + " " + msg);
}

export function step(msg: string): void {
  console.log(chalk.cyan("  →") + " " + msg);
}

// ─── Team Orientation ────────────────────────────────────────────────────────

export type TeamOrientationOptions =
  | {
      mode: "admin";
      displayDir: string;
      teamName: string;
      teamSlug: string;
      orgLogin: string;
      repoUrl: string;
    }
  | {
      mode: "member";
      displayDir: string;
      teams: { name: string; slug: string; repoUrl: string }[];
    };

export function teamOrientation(opts: TeamOrientationOptions): void {
  const W = 48;
  const line = "─".repeat(W);
  const pad = (text: string, len: number) => text + " ".repeat(Math.max(0, len - visibleLength(text)));
  const row = (text: string) =>
    chalk.dim("  │") + pad(text, W) + chalk.dim("│");

  console.log();

  if (opts.mode === "admin") {
    console.log(chalk.dim("  ┌" + line + "┐"));
    console.log(row(chalk.bold.white("  All done! Your HQ is ready.")));
    console.log(chalk.dim("  ├" + line + "┤"));
    console.log(row(""));
    console.log(row(`  ${chalk.dim("Team:")}  ${chalk.cyan(opts.teamName)}`));
    console.log(row(`  ${chalk.dim("Repo:")}  ${opts.repoUrl}`));
    console.log(row(`  ${chalk.dim("Local:")} companies/${opts.teamSlug}/`));
    console.log(row(""));
    console.log(row(chalk.bold.white("  Invite members:")));
    console.log(row(`    claude`));
    console.log(row(`    /invite  ${chalk.dim("← send team invitations")}`));
    console.log(row(""));
    console.log(row(chalk.bold.white("  Get started:")));
    console.log(row(`    cd ${opts.displayDir}`));
    console.log(row("    claude"));
    console.log(row(""));
    console.log(chalk.dim("  └" + line + "┘"));
  } else {
    const count = opts.teams.length;

    console.log(chalk.dim("  ┌" + line + "┐"));
    console.log(row(chalk.bold.white("  All done! Your HQ is ready.")));
    console.log(chalk.dim("  ├" + line + "┤"));
    console.log(row(""));
    console.log(row(chalk.bold.white(`  ${count} team${count === 1 ? "" : "s"} joined:`)));
    for (const t of opts.teams) {
      console.log(row(`  ${chalk.green("✓")} ${chalk.cyan(t.name)} ${chalk.dim("→")} companies/${t.slug}/`));
    }
    console.log(row(""));
    console.log(row(chalk.bold.white("  Get started:")));
    console.log(row(`    cd ${opts.displayDir}`));
    console.log(row("    claude"));
    console.log(row("    /setup  " + chalk.dim("← personalize your HQ")));
    console.log(row(""));
    console.log(chalk.dim("  └" + line + "┘"));
  }

  console.log();
}

export function nextSteps(dir: string): void {
  const W = 48;
  const line = "─".repeat(W);
  const pad = (text: string, len: number) => text + " ".repeat(Math.max(0, len - visibleLength(text)));
  const row = (text: string) =>
    chalk.dim("  │") + pad(text, W) + chalk.dim("│");

  console.log();
  console.log(chalk.dim("  ┌" + line + "┐"));
  console.log(row(chalk.bold.white("  All done! Your HQ is ready.")));
  console.log(chalk.dim("  ├" + line + "┤"));
  console.log(row(""));
  console.log(row(chalk.white(`    cd ${dir} && claude`)));
  console.log(row(chalk.dim("    then run: ") + chalk.white("/setup")));
  console.log(row(""));
  console.log(chalk.dim("  ├" + line + "┤"));
  console.log(row(chalk.dim("  Or open ") + chalk.white(dir) + chalk.dim(" in Claude")));
  console.log(row(chalk.dim("  Code Desktop or Codex and run ") + chalk.white("/setup")));
  console.log(row(""));
  console.log(chalk.dim("  └" + line + "┘"));
  console.log();
}

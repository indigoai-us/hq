import chalk from "chalk";
import ora, { type Ora } from "ora";

// ─── ASCII Art Banner ────────────────────────────────────────────────────────

const WIDE_ART = `
  ╔══════════════════════════════════════════════════════════════════════════╗
  ║                                                                          ║
  ║   ██   ██  ██████      Personal OS for AI Workers                       ║
  ║   ██   ██ ██    ██                                                       ║
  ║   ███████ ██    ██     ┌─────────────────────────────────────────────┐  ║
  ║   ██   ██ ██ ▄▄ ██     │  █▀█ █▀▀ █▀█ █▀ █▀█ █▄ █ ▄▀█ █     █▀█ █▀  │  ║
  ║   ██   ██  ██████      │  █▀▀ ██▄ █▀▄ ▄█ █▄█ █ ▀█ █▀█ █▄▄   █▄█ ▄█  │  ║
  ║              ▀▀        └─────────────────────────────────────────────┘  ║
  ║                                                                          ║
  ╚══════════════════════════════════════════════════════════════════════════╝`;

const COMPACT_ART = `
  ┌─────────────────────────────┐
  │  ██   ██  ██████            │
  │  ███████ ██    ██  HQ       │
  │  ██   ██  ██████            │
  └─────────────────────────────┘`;

export function banner(installerVersion?: string, hqVersion?: string): void {
  const cols = process.stdout.columns ?? 80;
  const isWide = cols >= 80;

  if (isWide) {
    console.log(chalk.bold.cyan(WIDE_ART));
  } else {
    console.log(chalk.bold.cyan(COMPACT_ART));
  }

  console.log();

  const parts: string[] = [];
  if (installerVersion) {
    parts.push(chalk.dim(`create-hq v${installerVersion}`));
  }
  if (hqVersion) {
    parts.push(chalk.cyan(`HQ template ${hqVersion}`));
  }

  if (parts.length > 0) {
    console.log("  " + parts.join(chalk.dim("  ·  ")));
  }
  console.log();
}

// ─── Step Status Tracking ────────────────────────────────────────────────────

const spinners = new Map<string, Ora>();

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

      const spinner = ora({
        text: chalk.white(label),
        prefixText: "  ",
        spinner: "dots",
        color: "cyan",
      }).start();
      spinners.set(label, spinner);
      break;
    }

    case "done": {
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

export function nextSteps(dir: string): void {
  const W = 48;
  const line = "─".repeat(W);
  const pad = (text: string, len: number) => text + " ".repeat(Math.max(0, len - text.length));
  const row = (text: string) =>
    chalk.dim("  │") + pad(text, W) + chalk.dim("│");

  console.log();
  console.log(chalk.dim("  ┌" + line + "┐"));
  console.log(row(chalk.bold.white("  All done! Your HQ is ready.")));
  console.log(chalk.dim("  ├" + line + "┤"));
  console.log(row(""));
  console.log(row(`    cd ${dir}`));
  console.log(row("    claude"));
  console.log(row("    /setup  " + chalk.dim("← personalize your HQ")));
  console.log(row(""));
  console.log(chalk.dim("  └" + line + "┘"));
  console.log();
}

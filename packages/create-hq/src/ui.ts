import chalk from "chalk";
import ora, { type Ora } from "ora";

// ─── ASCII Art Banner ────────────────────────────────────────────────────────

export function banner(installerVersion?: string, hqVersion?: string): void {
  // Pre-compose each line as a plain string, then colorize segments
  // Building right-edge at column 68, building grows from spire down
  const lines = [
    "                                                              ▄      ",
    "                                                             ▐█▌     ",
    "                                                            ▐███▌    ",
    "  ██   ██  ██████                                          ▐█████▌   ",
    "  ██   ██ ██    ██   Personal OS                          ▐███████▌  ",
    "  ███████ ██    ██   for AI Workers                      ▐█████████▌ ",
    "  ██   ██ ██ ▀▀ ██                                      ▐█░█░█░█░█▌ ",
    "  ██   ██  ██████    Build. Orchestrate. Ship.         ▐█░█░█░█░███▌",
    "                                                      ▐██░█░█░█░████▌",
    "  ────────────────────────────────────────────────────▐████████████████▌",
  ];

  console.log();

  for (const line of lines) {
    // Find where the building starts (first ▐ or ▄)
    const bldStart = line.search(/[▐▄]/);
    // Find where the HQ letters end (the block chars)
    const hqEnd = line.search(/██\s/) !== -1 ? line.indexOf("  ", line.lastIndexOf("██")) : -1;

    if (bldStart === -1) {
      // No building on this line — shouldn't happen with our data
      console.log(chalk.dim(line));
    } else {
      const left = line.slice(0, bldStart);
      const right = line.slice(bldStart);

      // Within the left portion, colorize HQ logo (██ blocks) vs tagline text
      // HQ logo chars: lines 3-7, columns 2-19
      const hasLogo = /██/.test(left);
      if (hasLogo) {
        // Split at first run of spaces after the logo block
        const logoMatch = left.match(/^(.*██[▀▄█ ]*██\s*)(.*)/);
        if (logoMatch) {
          const [, logo, tagline] = logoMatch;
          console.log(chalk.bold.white(logo) + chalk.dim(tagline) + chalk.cyan(right));
        } else {
          console.log(chalk.bold.white(left) + chalk.cyan(right));
        }
      } else if (left.includes("──")) {
        console.log(chalk.dim(left) + chalk.cyan(right));
      } else {
        console.log(chalk.dim(left) + chalk.cyan(right));
      }
    }
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
    console.log();
  }
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

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
  console.log(row(`    cd ${dir}`));
  console.log(row("    claude"));
  console.log(row("    /setup  " + chalk.dim("← personalize your HQ")));
  console.log(row(""));
  console.log(chalk.dim("  └" + line + "┘"));
  console.log();
}

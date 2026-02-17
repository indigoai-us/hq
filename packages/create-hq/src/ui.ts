import chalk from "chalk";

export function banner(): void {
  console.log();
  console.log(chalk.bold.white("  ██   ██  ██████  "));
  console.log(chalk.bold.white("  ██   ██ ██    ██ "));
  console.log(chalk.bold.white("  ███████ ██    ██ "));
  console.log(chalk.bold.white("  ██   ██ ██ ▄▄ ██ "));
  console.log(chalk.bold.white("  ██   ██  ██████  "));
  console.log(chalk.dim("              ▀▀   "));
  console.log();
  console.log(
    chalk.dim("  Personal OS for AI Workers") + chalk.dim("  v6.0.0")
  );
  console.log();
}

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
  console.log();
  console.log(chalk.bold("  All done! Next steps:"));
  console.log();
  console.log(chalk.white(`    cd ${dir}`));
  console.log(chalk.white("    claude"));
  console.log(
    chalk.white("    /setup") +
      chalk.dim("          ← interactive wizard to personalize your HQ")
  );
  console.log();
}

export function upgradeSummary(added: string[], skipped: string[]): void {
  console.log();
  console.log(chalk.bold("  Upgrade Summary"));
  console.log(chalk.dim("  ─────────────────────────────────────"));
  console.log(
    chalk.green(`  Added:   ${added.length} new file${added.length !== 1 ? "s" : ""}`)
  );
  console.log(
    chalk.dim(`  Skipped: ${skipped.length} existing file${skipped.length !== 1 ? "s" : ""} (not overwritten)`)
  );

  if (added.length > 0) {
    console.log();
    console.log(chalk.dim("  New files added:"));
    for (const file of added.slice(0, 20)) {
      console.log(chalk.green(`    + ${file}`));
    }
    if (added.length > 20) {
      console.log(chalk.dim(`    ... and ${added.length - 20} more`));
    }
  }
  console.log();
}

export function upgradeNextSteps(dir: string): void {
  console.log();
  console.log(chalk.bold("  Upgrade complete! Next steps:"));
  console.log();
  if (dir !== ".") {
    console.log(chalk.white(`    cd ${dir}`));
  }
  console.log(chalk.white("    claude"));
  console.log(
    chalk.dim("    Your existing files (CLAUDE.md, workers/, projects/) are untouched.")
  );
  console.log(
    chalk.dim("    New template files have been added alongside your existing setup.")
  );
  console.log();
}

import chalk from "chalk";

export function banner(installerVersion?: string): void {
  console.log();
  console.log(chalk.bold.white("  ██   ██  ██████  "));
  console.log(chalk.bold.white("  ██   ██ ██    ██ "));
  console.log(chalk.bold.white("  ███████ ██    ██ "));
  console.log(chalk.bold.white("  ██   ██ ██ ▄▄ ██ "));
  console.log(chalk.bold.white("  ██   ██  ██████  "));
  console.log(chalk.dim("              ▀▀   "));
  console.log();
  const versionSuffix = installerVersion ? chalk.dim(`  v${installerVersion}`) : "";
  console.log(chalk.dim("  Personal OS for AI Workers") + versionSuffix);
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

import chalk from "chalk";
import { spinner as clackSpinner, log, note, outro, isCancel, cancel } from "@clack/prompts";

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

// ─── Spinner Helper ─────────────────────────────────────────────────────────

export function createSpinner() {
  return clackSpinner();
}

// ─── Logging Helpers (delegates to @clack/prompts log) ──────────────────────

export function success(msg: string): void {
  log.success(msg);
}

export function warn(msg: string): void {
  log.warn(msg);
}

export function info(msg: string): void {
  log.info(msg);
}

export function step(msg: string): void {
  log.step(msg);
}

// ─── Next Steps ─────────────────────────────────────────────────────────────

export function nextSteps(dir: string): void {
  note(
    `cd ${dir}\nclaude\n/setup  ${chalk.dim("← re-run setup anytime")}`,
    "All done! Your HQ is ready."
  );
}

// ─── Re-exports for convenience ─────────────────────────────────────────────

export { isCancel, cancel, note };

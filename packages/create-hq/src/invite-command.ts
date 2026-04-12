/**
 * Standalone invite command for admins.
 *
 * Usage: create-hq invite
 *
 * Finds team metadata from the current HQ directory, authenticates
 * the admin, and generates an invite code plus optional org invite.
 */

import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import { createInterface } from "readline";
import chalk from "chalk";
import { authenticate } from "./teams-flow.js";
import { inviteLoop } from "./admin-onboarding.js";
import type { TeamMetadata } from "./company-template.js";
import { warn, info } from "./ui.js";

function prompt(question: string, defaultVal?: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const suffix = defaultVal ? ` (${defaultVal})` : "";
  return new Promise((resolve) => {
    rl.question(`  ? ${question}${suffix} `, (answer) => {
      rl.close();
      resolve(answer.trim() || defaultVal || "");
    });
  });
}

interface FoundTeam {
  meta: TeamMetadata;
  cloneUrl: string;
  companyDir: string;
}

/**
 * Find team.json files in companies/ walking up from cwd.
 */
function findTeams(): FoundTeam[] {
  let dir = process.cwd();
  const root = path.parse(dir).root;
  const teams: FoundTeam[] = [];

  while (dir !== root) {
    const companiesDir = path.join(dir, "companies");
    if (fs.existsSync(companiesDir) && fs.statSync(companiesDir).isDirectory()) {
      for (const entry of fs.readdirSync(companiesDir)) {
        const teamJsonPath = path.join(companiesDir, entry, "team.json");
        if (fs.existsSync(teamJsonPath)) {
          try {
            const meta = JSON.parse(
              fs.readFileSync(teamJsonPath, "utf-8")
            ) as TeamMetadata;
            let cloneUrl = `https://github.com/${meta.org_login}/hq-${meta.team_slug}.git`;
            try {
              const remote = execSync("git remote get-url origin", {
                cwd: path.join(companiesDir, entry),
                stdio: "pipe",
              })
                .toString()
                .trim();
              if (remote) cloneUrl = remote;
            } catch {
              // Use constructed URL
            }
            teams.push({
              meta,
              cloneUrl,
              companyDir: path.join(companiesDir, entry),
            });
          } catch {
            // Skip malformed team.json
          }
        }
      }
      break;
    }
    dir = path.dirname(dir);
  }

  return teams;
}

export async function runInviteCommand(): Promise<void> {
  console.log();
  console.log(chalk.bold("  Generate a team invite"));
  console.log();

  const teams = findTeams();

  if (teams.length === 0) {
    warn(
      "No teams found. Run this from your HQ directory (must have companies/*/team.json)."
    );
    info("If you haven't created a team yet, run: npx create-hq");
    return;
  }

  let selected: FoundTeam;
  if (teams.length === 1) {
    selected = teams[0];
    info(
      `Team: ${chalk.cyan(selected.meta.team_name)} (${selected.meta.org_login})`
    );
  } else {
    console.log("  Which team?");
    for (let i = 0; i < teams.length; i++) {
      console.log(
        chalk.cyan(`  [${i + 1}] `) +
          chalk.white(teams[i].meta.team_name) +
          chalk.dim(` (${teams[i].meta.org_login})`)
      );
    }
    const choice = await prompt(`Select (1-${teams.length})`, "1");
    const idx = parseInt(choice, 10) - 1;
    if (idx < 0 || idx >= teams.length) {
      warn("Invalid selection.");
      return;
    }
    selected = teams[idx];
  }

  const auth = await authenticate();
  if (!auth) {
    warn("Authentication required to generate invites.");
    return;
  }

  await inviteLoop(auth, selected.meta, selected.cloneUrl);
}

/**
 * `hq onboard` — bootstrap an HQ vault: sign in to Cognito + provision
 * the company entity, S3 bucket, KMS key, owner membership, and STS-vended
 * credentials in one flow.
 *
 * This is the "the entire flow" entry point that VLT-9 was building toward:
 * a real user can install hq-cli and run `hq onboard create-company` once
 * to land in a fully provisioned vault, then use `hq sync push|pull` to
 * round-trip files against S3.
 *
 * Subcommands:
 *   hq onboard create-company  — provision a brand new company
 *   hq onboard join            — accept an invite from another user
 *   hq onboard resume          — resume a partially-completed flow from checkpoint
 *   hq onboard dry-run         — show what create-company would do, without doing it
 *
 * Auth: we cache the Cognito access + refresh tokens at ~/.hq/cognito-tokens.json.
 * If the cached token is missing or expired beyond the refresh window, the
 * browser-OAuth flow opens automatically.
 */

import { Command } from "commander";
import chalk from "chalk";

import { runOnboardCli } from "@indigoai-us/hq-onboarding";
import {
  DEFAULT_HQ_ROOT,
  ensureCognitoToken,
  buildVaultConfig,
} from "../utils/cognito-session.js";

// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

export function registerOnboardCommand(program: Command): void {
  const onboard = program
    .command("onboard")
    .description("Provision an HQ vault: sign in, create company, S3 bucket, STS, sync");

  onboard
    .command("create-company")
    .description("Sign in and provision a brand new HQ vault for a company")
    .requiredOption("--slug <slug>", "Company slug (used as bucket name suffix)")
    .requiredOption("--name <name>", "Company display name")
    .requiredOption("--email <email>", "Your email (must match Cognito sign-in)")
    .requiredOption("--person-name <name>", "Your display name")
    .option(
      "--hq-root <path>",
      `Local HQ tree root (default: ${DEFAULT_HQ_ROOT})`,
      DEFAULT_HQ_ROOT,
    )
    .action(async (options: {
      slug: string;
      name: string;
      email: string;
      personName: string;
      hqRoot: string;
    }) => {
      try {
        console.log(chalk.bold(`\nHQ Onboard — Create Company`));
        console.log(`  Company:  ${options.name} (${options.slug})`);
        console.log(`  Person:   ${options.personName} <${options.email}>`);
        console.log(`  HQ root:  ${options.hqRoot}\n`);

        const accessToken = await ensureCognitoToken();
        const result = await runOnboardCli({
          mode: "create-company",
          personName: options.personName,
          personEmail: options.email,
          companyName: options.name,
          companySlug: options.slug,
          vaultConfig: buildVaultConfig(accessToken),
          hqRoot: options.hqRoot,
        });

        if (!result.success) {
          console.error(chalk.red(`\n✗ Onboarding failed: ${result.error}`));
          process.exit(1);
        }
      } catch (err) {
        console.error(
          chalk.red("\n✗ Error:"),
          err instanceof Error ? err.message : String(err),
        );
        process.exit(1);
      }
    });

  onboard
    .command("join")
    .description("Accept an invite and join an existing company")
    .requiredOption("--invite-token <token>", "Magic link token from your invite email")
    .requiredOption("--email <email>", "Your email (must match Cognito sign-in)")
    .requiredOption("--person-name <name>", "Your display name")
    .option(
      "--hq-root <path>",
      `Local HQ tree root (default: ${DEFAULT_HQ_ROOT})`,
      DEFAULT_HQ_ROOT,
    )
    .action(async (options: {
      inviteToken: string;
      email: string;
      personName: string;
      hqRoot: string;
    }) => {
      try {
        console.log(chalk.bold(`\nHQ Onboard — Join Company`));
        console.log(`  Person:   ${options.personName} <${options.email}>`);
        console.log(`  HQ root:  ${options.hqRoot}\n`);

        const accessToken = await ensureCognitoToken();
        const result = await runOnboardCli({
          mode: "join-company",
          personName: options.personName,
          personEmail: options.email,
          inviteToken: options.inviteToken,
          vaultConfig: buildVaultConfig(accessToken),
          hqRoot: options.hqRoot,
        });

        if (!result.success) {
          console.error(chalk.red(`\n✗ Join failed: ${result.error}`));
          process.exit(1);
        }
      } catch (err) {
        console.error(
          chalk.red("\n✗ Error:"),
          err instanceof Error ? err.message : String(err),
        );
        process.exit(1);
      }
    });

  onboard
    .command("resume")
    .description("Resume a partially-completed onboarding flow from local checkpoint")
    .option(
      "--hq-root <path>",
      `Local HQ tree root (default: ${DEFAULT_HQ_ROOT})`,
      DEFAULT_HQ_ROOT,
    )
    .action(async (options: { hqRoot: string }) => {
      try {
        const accessToken = await ensureCognitoToken();
        const result = await runOnboardCli({
          mode: "resume",
          vaultConfig: buildVaultConfig(accessToken),
          hqRoot: options.hqRoot,
        });
        if (!result.success) {
          console.error(chalk.red(`\n✗ Resume failed: ${result.error}`));
          process.exit(1);
        }
      } catch (err) {
        console.error(
          chalk.red("\n✗ Error:"),
          err instanceof Error ? err.message : String(err),
        );
        process.exit(1);
      }
    });

  onboard
    .command("dry-run")
    .description("Show what create-company would do, without provisioning anything")
    .option(
      "--hq-root <path>",
      `Local HQ tree root (default: ${DEFAULT_HQ_ROOT})`,
      DEFAULT_HQ_ROOT,
    )
    .action(async (options: { hqRoot: string }) => {
      try {
        // No auth needed for dry-run — runOnboardCli handles this branch
        // without touching the vault-service.
        const result = await runOnboardCli({
          mode: "dry-run",
          vaultConfig: buildVaultConfig("dry-run-no-token"),
          hqRoot: options.hqRoot,
        });
        if (!result.success) {
          console.error(chalk.red(`\n✗ Dry-run failed: ${result.error}`));
          process.exit(1);
        }
      } catch (err) {
        console.error(
          chalk.red("\n✗ Error:"),
          err instanceof Error ? err.message : String(err),
        );
        process.exit(1);
      }
    });
}

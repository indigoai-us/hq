/**
 * CLI onboard entry point (VLT-9 US-002).
 *
 * Programmatic API for the /onboard command. The slash command calls
 * these functions; they can also be consumed by integration tests.
 */

import type { VaultServiceConfig } from "@indigoai-us/hq-cloud";
import { VaultClient, VaultNotFoundError } from "@indigoai-us/hq-cloud";
import {
  createCompanyFlow,
  joinCompanyFlow,
  resumeOnboarding,
} from "../orchestrator.js";
import { readCheckpoint, getCheckpointPath } from "../checkpoint.js";
import type {
  CreateCompanyInput,
  JoinCompanyInput,
  OnboardingConfig,
  OnboardingResult,
  OnboardingProgress,
  ProgressCallback,
} from "../types.js";
import { formatProgress, formatSummary, formatError } from "./prompts.js";

const CREATE_STEPS = 6;
const JOIN_STEPS = 6;

export interface OnboardCliOptions {
  mode: "create-company" | "join-company" | "resume" | "dry-run";
  personName?: string;
  personEmail?: string;
  companyName?: string;
  companySlug?: string;
  inviteToken?: string;
  vaultConfig: VaultServiceConfig;
  hqRoot: string;
  log?: (msg: string) => void;
}

export interface OnboardCliResult {
  success: boolean;
  result?: OnboardingResult;
  error?: string;
}

/**
 * Run the /onboard CLI flow.
 */
export async function runOnboardCli(options: OnboardCliOptions): Promise<OnboardCliResult> {
  const { mode, vaultConfig, hqRoot, log = console.log } = options;
  let stepCounter = 0;

  const onProgress: ProgressCallback = (event: OnboardingProgress) => {
    if (event.status === "running") stepCounter++;
    const total = mode === "create-company" ? CREATE_STEPS : JOIN_STEPS;
    log(formatProgress(event, stepCounter, total));
  };

  const config: OnboardingConfig = { vaultConfig, hqRoot };

  try {
    if (mode === "resume") {
      const checkpoint = await readCheckpoint(hqRoot);
      if (!checkpoint) {
        return { success: false, error: "No checkpoint found. Run /onboard to start." };
      }
      log(`Resuming ${checkpoint.mode} flow from step ${checkpoint.completedSteps.length + 1}...`);
      const result = await resumeOnboarding(config, onProgress);
      log("");
      log(formatSummary(result));
      return { success: true, result };
    }

    if (mode === "dry-run") {
      log("DRY RUN — simulating create-company flow:");
      log("  1. Create person entity");
      log("  2. Create company entity");
      log("  3. Provision S3 bucket + KMS key");
      log("  4. Bootstrap owner membership");
      log("  5. Verify STS credential vending");
      log("  6. Write .hq/config.json");
      log("");
      log("No resources will be created. Run /onboard to execute.");
      return { success: true };
    }

    if (mode === "create-company") {
      // Validate slug availability
      if (options.companySlug) {
        const client = new VaultClient(vaultConfig);
        try {
          await client.entity.findBySlug("company", options.companySlug);
          return {
            success: false,
            error: `Company slug "${options.companySlug}" is already taken. Choose another.`,
          };
        } catch (err) {
          // VaultNotFoundError = slug available, continue
          const isNotFound =
            err instanceof VaultNotFoundError ||
            (err instanceof Error && err.name === "VaultNotFoundError");
          if (!isNotFound) throw err;
        }
      }

      const input: CreateCompanyInput = {
        mode: "create-company",
        personName: options.personName!,
        personEmail: options.personEmail!,
        companyName: options.companyName!,
        companySlug: options.companySlug!,
      };

      log(`Creating company "${input.companyName}" (${input.companySlug})...`);
      log("");
      const result = await createCompanyFlow(input, config, onProgress);
      log("");
      log(formatSummary(result));
      return { success: true, result };
    }

    if (mode === "join-company") {
      const input: JoinCompanyInput = {
        mode: "join-company",
        personName: options.personName!,
        personEmail: options.personEmail!,
        inviteToken: options.inviteToken!,
      };

      log("Joining company via invite...");
      log("");
      const result = await joinCompanyFlow(input, config, onProgress);
      log("");
      log(formatSummary(result));
      return { success: true, result };
    }

    return { success: false, error: `Unknown mode: ${mode}` };
  } catch (err) {
    const checkpointPath = getCheckpointPath(hqRoot);
    const errorMsg = err instanceof Error ? err.message : String(err);
    log("");
    log(formatError(err instanceof Error ? err : new Error(errorMsg), checkpointPath));
    return { success: false, error: errorMsg };
  }
}

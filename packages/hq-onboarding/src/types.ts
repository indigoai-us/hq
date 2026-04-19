/**
 * Onboarding types (VLT-9 US-001).
 *
 * Discriminated union for the two onboarding paths (create vs join)
 * plus progress events for the installer UI callback.
 */

import type { VaultServiceConfig } from "@indigoai-us/hq-cloud";

// ---------------------------------------------------------------------------
// Input — discriminated union
// ---------------------------------------------------------------------------

export interface CreateCompanyInput {
  mode: "create-company";
  personName: string;
  personEmail: string;
  companyName: string;
  companySlug: string;
}

export interface JoinCompanyInput {
  mode: "join-company";
  personName: string;
  personEmail: string;
  inviteToken: string;
}

export type OnboardingInput = CreateCompanyInput | JoinCompanyInput;

// ---------------------------------------------------------------------------
// Config — passed alongside input
// ---------------------------------------------------------------------------

export interface OnboardingConfig {
  vaultConfig: VaultServiceConfig;
  /** Local HQ root directory for writing .hq/config.json */
  hqRoot: string;
  /** Stage name for resource tagging (e.g. "dev", "prod") */
  stage?: string;
}

// ---------------------------------------------------------------------------
// Progress — callback events for the installer UI
// ---------------------------------------------------------------------------

export type OnboardingStep =
  | "create-person"
  | "create-company"
  | "provision-bucket"
  | "bootstrap-membership"
  | "verify-sts"
  | "write-config"
  | "parse-token"
  | "accept-invite"
  | "first-sync";

export type StepStatus = "pending" | "running" | "done" | "skipped" | "failed";

export interface OnboardingProgress {
  step: OnboardingStep;
  status: StepStatus;
  detail?: string;
}

export type ProgressCallback = (progress: OnboardingProgress) => void;

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

export interface OnboardingResult {
  personUid: string;
  companyUid: string;
  companySlug: string;
  role: string;
  bucketName?: string;
  configPath: string;
}

// ---------------------------------------------------------------------------
// Checkpoint — persisted to .hq/onboarding-state.json for idempotent resume
// ---------------------------------------------------------------------------

export interface OnboardingCheckpoint {
  mode: "create-company" | "join-company";
  startedAt: string;
  updatedAt: string;
  personUid?: string;
  companyUid?: string;
  companySlug?: string;
  bucketName?: string;
  membershipKey?: string;
  inviteToken?: string;
  completedSteps: OnboardingStep[];
  failedStep?: OnboardingStep;
  error?: string;
}

// ---------------------------------------------------------------------------
// Desktop Installer Contract
// ---------------------------------------------------------------------------

/**
 * DesktopInstallerContract — stable API boundary the desktop app's onboarding
 * screen MUST conform to. The installer calls `runOnboarding()` with input +
 * config + progress callback and gets back a typed result or error.
 *
 * Breaking changes to this interface require desktop team coordination.
 */
export interface DesktopInstallerContract {
  runOnboarding(
    input: OnboardingInput,
    config: OnboardingConfig,
    onProgress?: ProgressCallback,
  ): Promise<OnboardingResult>;

  resumeOnboarding(
    config: OnboardingConfig,
    onProgress?: ProgressCallback,
  ): Promise<OnboardingResult>;
}

// ---------------------------------------------------------------------------
// HQ local config written at end of onboarding
// ---------------------------------------------------------------------------

export interface HqConfig {
  companyUid: string;
  companySlug: string;
  personUid: string;
  role: string;
  bucketName?: string;
  vaultApiUrl: string;
  configuredAt: string;
}

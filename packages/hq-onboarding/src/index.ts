/**
 * @indigoai-us/hq-onboarding — public API (VLT-9)
 *
 * Onboarding orchestrator that composes VLT-1 through VLT-8 into
 * create-company and join-company flows with checkpoint/resume.
 */

export {
  createCompanyFlow,
  joinCompanyFlow,
  resumeOnboarding,
  onboardingContract,
} from "./orchestrator.js";

export {
  readCheckpoint,
  writeCheckpoint,
  deleteCheckpoint,
  getCheckpointPath,
  isStepComplete,
} from "./checkpoint.js";

export {
  OnboardingError,
  PersonCreationError,
  CompanyCreationError,
  ProvisioningError,
  MembershipBootstrapError,
  FirstSyncError,
  InviteAcceptError,
  StsVerifyError,
} from "./errors.js";

export type {
  OnboardingInput,
  CreateCompanyInput,
  JoinCompanyInput,
  OnboardingConfig,
  OnboardingResult,
  OnboardingProgress,
  OnboardingStep,
  StepStatus,
  ProgressCallback,
  OnboardingCheckpoint,
  DesktopInstallerContract,
  HqConfig,
} from "./types.js";

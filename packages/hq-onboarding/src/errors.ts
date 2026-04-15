/**
 * Onboarding error classes (VLT-9 US-001).
 *
 * Each failure class maps to a distinct step in the onboarding flow,
 * making it easy for the installer to show targeted recovery hints.
 */

export class OnboardingError extends Error {
  constructor(
    message: string,
    public readonly step: string,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = "OnboardingError";
  }
}

export class PersonCreationError extends OnboardingError {
  constructor(message: string, cause?: Error) {
    super(message, "create-person", cause);
    this.name = "PersonCreationError";
  }
}

export class CompanyCreationError extends OnboardingError {
  constructor(message: string, cause?: Error) {
    super(message, "create-company", cause);
    this.name = "CompanyCreationError";
  }
}

export class ProvisioningError extends OnboardingError {
  constructor(message: string, cause?: Error) {
    super(message, "provision-bucket", cause);
    this.name = "ProvisioningError";
  }
}

export class MembershipBootstrapError extends OnboardingError {
  constructor(message: string, cause?: Error) {
    super(message, "bootstrap-membership", cause);
    this.name = "MembershipBootstrapError";
  }
}

export class FirstSyncError extends OnboardingError {
  constructor(message: string, cause?: Error) {
    super(message, "first-sync", cause);
    this.name = "FirstSyncError";
  }
}

export class InviteAcceptError extends OnboardingError {
  constructor(message: string, cause?: Error) {
    super(message, "accept-invite", cause);
    this.name = "InviteAcceptError";
  }
}

export class StsVerifyError extends OnboardingError {
  constructor(message: string, cause?: Error) {
    super(message, "verify-sts", cause);
    this.name = "StsVerifyError";
  }
}

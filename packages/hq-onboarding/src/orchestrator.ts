/**
 * Onboarding orchestrator (VLT-9 US-001).
 *
 * Composes VLT-1 (entities), VLT-2 (bucket provisioning), VLT-3 (STS),
 * VLT-5 (sync), VLT-6 (membership), and VLT-7 (invite/accept) into two
 * end-to-end flows:
 *
 *   createCompanyFlow — founder creates a new company + vault
 *   joinCompanyFlow   — invitee accepts an invite and syncs
 *
 * Each step is idempotent via checkpoint/resume. Progress events are
 * emitted via callback for the installer UI.
 */

import { writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import {
  VaultClient,
  VaultConflictError,
  VaultNotFoundError,
  resolveEntityContext,
  sync,
  parseToken,
} from "@indigoai-us/hq-cloud";

import type {
  CreateCompanyInput,
  JoinCompanyInput,
  OnboardingConfig,
  OnboardingResult,
  OnboardingCheckpoint,
  OnboardingStep,
  ProgressCallback,
  HqConfig,
  DesktopInstallerContract,
} from "./types.js";

import {
  PersonCreationError,
  CompanyCreationError,
  ProvisioningError,
  MembershipBootstrapError,
  StsVerifyError,
  InviteAcceptError,
  FirstSyncError,
} from "./errors.js";

import {
  readCheckpoint,
  writeCheckpoint,
  isStepComplete,
  deleteCheckpoint,
} from "./checkpoint.js";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create-company flow for founders.
 *
 * Steps:
 *   1. Create person entity
 *   2. Create company entity with ownerUid
 *   3. Provision bucket + KMS via vault-service
 *   4. Bootstrap owner membership (library-direct, bypasses handler auth)
 *   5. Verify STS vend works end-to-end
 *   6. Write .hq/config.json
 */
export async function createCompanyFlow(
  input: CreateCompanyInput,
  config: OnboardingConfig,
  onProgress?: ProgressCallback,
): Promise<OnboardingResult> {
  const client = new VaultClient(config.vaultConfig);
  const checkpoint = await readCheckpoint(config.hqRoot) ?? makeCheckpoint("create-company");

  // Step 1: Create person
  if (!isStepComplete(checkpoint, "create-person")) {
    emit(onProgress, "create-person", "running");
    try {
      const existing = checkpoint.personUid
        ? await safeGetEntity(client, checkpoint.personUid)
        : null;
      if (!existing) {
        const person = await client.entity.create({
          type: "person",
          slug: slugFromEmail(input.personEmail),
          name: input.personName,
          email: input.personEmail,
        });
        checkpoint.personUid = person.uid;
      }
      checkpoint.completedSteps.push("create-person");
      await writeCheckpoint(config.hqRoot, checkpoint);
      emit(onProgress, "create-person", "done", `personUid: ${checkpoint.personUid}`);
    } catch (err) {
      if (err instanceof VaultConflictError) {
        // Person already exists — try to look up by email slug
        try {
          const person = await client.entity.findBySlug("person", slugFromEmail(input.personEmail));
          checkpoint.personUid = person.uid;
          checkpoint.completedSteps.push("create-person");
          await writeCheckpoint(config.hqRoot, checkpoint);
          emit(onProgress, "create-person", "skipped", "Person already registered");
        } catch {
          throw new PersonCreationError(
            `Person with email ${input.personEmail} conflicts but cannot be resolved`,
            err instanceof Error ? err : undefined,
          );
        }
      } else {
        checkpoint.failedStep = "create-person";
        checkpoint.error = String(err);
        await writeCheckpoint(config.hqRoot, checkpoint);
        emit(onProgress, "create-person", "failed");
        throw new PersonCreationError(
          `Failed to create person entity: ${err}`,
          err instanceof Error ? err : undefined,
        );
      }
    }
  } else {
    emit(onProgress, "create-person", "skipped", "Already complete");
  }

  // Step 2: Create company
  if (!isStepComplete(checkpoint, "create-company")) {
    emit(onProgress, "create-company", "running");
    try {
      const existing = checkpoint.companyUid
        ? await safeGetEntity(client, checkpoint.companyUid)
        : null;
      if (!existing) {
        const company = await client.entity.create({
          type: "company",
          slug: input.companySlug,
          name: input.companyName,
          ownerUid: checkpoint.personUid,
        });
        checkpoint.companyUid = company.uid;
        checkpoint.companySlug = company.slug;
      }
      checkpoint.completedSteps.push("create-company");
      await writeCheckpoint(config.hqRoot, checkpoint);
      emit(onProgress, "create-company", "done", `companyUid: ${checkpoint.companyUid}`);
    } catch (err) {
      if (err instanceof VaultConflictError) {
        try {
          const company = await client.entity.findBySlug("company", input.companySlug);
          checkpoint.companyUid = company.uid;
          checkpoint.companySlug = company.slug;
          checkpoint.completedSteps.push("create-company");
          await writeCheckpoint(config.hqRoot, checkpoint);
          emit(onProgress, "create-company", "skipped", "Company already exists");
        } catch {
          throw new CompanyCreationError(
            `Company slug "${input.companySlug}" conflicts but cannot be resolved`,
            err instanceof Error ? err : undefined,
          );
        }
      } else {
        checkpoint.failedStep = "create-company";
        checkpoint.error = String(err);
        await writeCheckpoint(config.hqRoot, checkpoint);
        emit(onProgress, "create-company", "failed");
        throw new CompanyCreationError(
          `Failed to create company entity: ${err}`,
          err instanceof Error ? err : undefined,
        );
      }
    }
  } else {
    emit(onProgress, "create-company", "skipped", "Already complete");
  }

  // Step 3: Provision bucket + KMS
  if (!isStepComplete(checkpoint, "provision-bucket")) {
    emit(onProgress, "provision-bucket", "running");
    try {
      // Trigger provisioning via vault-service (server-side Lambda invocation)
      const provisionResult = await client.provisionBucket(checkpoint.companyUid!);
      checkpoint.bucketName = provisionResult.bucketName;
      checkpoint.completedSteps.push("provision-bucket");
      await writeCheckpoint(config.hqRoot, checkpoint);
      emit(onProgress, "provision-bucket", "done", `bucket: ${checkpoint.bucketName}`);
    } catch (err) {
      // If bucket already provisioned, that's fine — fetch entity to get bucketName
      const entity = await safeGetEntity(client, checkpoint.companyUid!);
      if (entity?.bucketName) {
        checkpoint.bucketName = entity.bucketName;
        checkpoint.completedSteps.push("provision-bucket");
        await writeCheckpoint(config.hqRoot, checkpoint);
        emit(onProgress, "provision-bucket", "skipped", "Already provisioned");
      } else {
        checkpoint.failedStep = "provision-bucket";
        checkpoint.error = String(err);
        await writeCheckpoint(config.hqRoot, checkpoint);
        emit(onProgress, "provision-bucket", "failed");
        throw new ProvisioningError(
          `Bucket provisioning failed: ${err}`,
          err instanceof Error ? err : undefined,
        );
      }
    }
  } else {
    emit(onProgress, "provision-bucket", "skipped", "Already complete");
  }

  // Step 4: Bootstrap owner membership (library-direct, bypasses handler auth)
  if (!isStepComplete(checkpoint, "bootstrap-membership")) {
    emit(onProgress, "bootstrap-membership", "running");
    try {
      // Verify no existing memberships (optimistic concurrency guard)
      const existing = await client.listMembersOfCompany(checkpoint.companyUid!);
      if (existing.length > 0) {
        // Already has members — find our membership
        const ours = existing.find(m => m.personUid === checkpoint.personUid);
        if (ours) {
          checkpoint.membershipKey = ours.membershipKey;
          checkpoint.completedSteps.push("bootstrap-membership");
          await writeCheckpoint(config.hqRoot, checkpoint);
          emit(onProgress, "bootstrap-membership", "skipped", "Owner membership already exists");
        } else {
          throw new MembershipBootstrapError(
            "Company already has members but none match the founder — possible race condition",
          );
        }
      } else {
        // Create invite + immediately accept under founder's identity
        const invite = await client.createInvite({
          companyUid: checkpoint.companyUid!,
          personUid: checkpoint.personUid,
          role: "owner",
          invitedBy: checkpoint.personUid!,
        });
        const accept = await client.acceptInvite(invite.inviteToken, checkpoint.personUid!);
        checkpoint.membershipKey = accept.membership.membershipKey;
        checkpoint.completedSteps.push("bootstrap-membership");
        await writeCheckpoint(config.hqRoot, checkpoint);
        emit(onProgress, "bootstrap-membership", "done", `role: owner`);
      }
    } catch (err) {
      if (err instanceof MembershipBootstrapError) throw err;
      checkpoint.failedStep = "bootstrap-membership";
      checkpoint.error = String(err);
      await writeCheckpoint(config.hqRoot, checkpoint);
      emit(onProgress, "bootstrap-membership", "failed");
      throw new MembershipBootstrapError(
        `Owner membership bootstrap failed: ${err}`,
        err instanceof Error ? err : undefined,
      );
    }
  } else {
    emit(onProgress, "bootstrap-membership", "skipped", "Already complete");
  }

  // Step 5: Verify STS vend works end-to-end
  if (!isStepComplete(checkpoint, "verify-sts")) {
    emit(onProgress, "verify-sts", "running");
    try {
      const ctx = await resolveEntityContext(checkpoint.companyUid!, config.vaultConfig);
      if (!ctx.credentials.accessKeyId) {
        throw new Error("STS vend returned empty credentials");
      }
      checkpoint.completedSteps.push("verify-sts");
      await writeCheckpoint(config.hqRoot, checkpoint);
      emit(onProgress, "verify-sts", "done", `Credentials valid until ${ctx.expiresAt}`);
    } catch (err) {
      checkpoint.failedStep = "verify-sts";
      checkpoint.error = String(err);
      await writeCheckpoint(config.hqRoot, checkpoint);
      emit(onProgress, "verify-sts", "failed");
      throw new StsVerifyError(
        `STS verification failed: ${err}`,
        err instanceof Error ? err : undefined,
      );
    }
  } else {
    emit(onProgress, "verify-sts", "skipped", "Already complete");
  }

  // Step 6: Write .hq/config.json
  emit(onProgress, "write-config", "running");
  const configPath = await writeHqConfig(config.hqRoot, {
    companyUid: checkpoint.companyUid!,
    companySlug: checkpoint.companySlug ?? input.companySlug,
    personUid: checkpoint.personUid!,
    role: "owner",
    bucketName: checkpoint.bucketName,
    vaultApiUrl: config.vaultConfig.apiUrl,
    configuredAt: new Date().toISOString(),
  });
  checkpoint.completedSteps.push("write-config");
  await writeCheckpoint(config.hqRoot, checkpoint);
  emit(onProgress, "write-config", "done", configPath);

  // Clean up checkpoint on success
  await deleteCheckpoint(config.hqRoot);

  return {
    personUid: checkpoint.personUid!,
    companyUid: checkpoint.companyUid!,
    companySlug: checkpoint.companySlug ?? input.companySlug,
    role: "owner",
    bucketName: checkpoint.bucketName,
    configPath,
  };
}

/**
 * Join-company flow for invitees.
 *
 * Steps:
 *   1. Parse invite token
 *   2. Create person entity (if not already registered)
 *   3. Accept invite
 *   4. Verify STS vend
 *   5. First sync to pull initial vault contents
 *   6. Write .hq/config.json
 */
export async function joinCompanyFlow(
  input: JoinCompanyInput,
  config: OnboardingConfig,
  onProgress?: ProgressCallback,
): Promise<OnboardingResult> {
  const client = new VaultClient(config.vaultConfig);
  const checkpoint = await readCheckpoint(config.hqRoot) ?? makeCheckpoint("join-company");

  // Step 1: Parse token
  emit(onProgress, "parse-token", "running");
  const token = parseToken(input.inviteToken);
  checkpoint.inviteToken = token;
  await writeCheckpoint(config.hqRoot, checkpoint);
  emit(onProgress, "parse-token", "done");

  // Step 2: Create person (idempotent — skip if exists)
  if (!isStepComplete(checkpoint, "create-person")) {
    emit(onProgress, "create-person", "running");
    try {
      const person = await client.entity.create({
        type: "person",
        slug: slugFromEmail(input.personEmail),
        name: input.personName,
        email: input.personEmail,
      });
      checkpoint.personUid = person.uid;
      checkpoint.completedSteps.push("create-person");
      await writeCheckpoint(config.hqRoot, checkpoint);
      emit(onProgress, "create-person", "done", `personUid: ${checkpoint.personUid}`);
    } catch (err) {
      if (err instanceof VaultConflictError) {
        try {
          const person = await client.entity.findBySlug("person", slugFromEmail(input.personEmail));
          checkpoint.personUid = person.uid;
          checkpoint.completedSteps.push("create-person");
          await writeCheckpoint(config.hqRoot, checkpoint);
          emit(onProgress, "create-person", "skipped", "Person already registered");
        } catch {
          throw new PersonCreationError(
            `Person with email ${input.personEmail} conflicts but cannot be resolved`,
            err instanceof Error ? err : undefined,
          );
        }
      } else {
        checkpoint.failedStep = "create-person";
        checkpoint.error = String(err);
        await writeCheckpoint(config.hqRoot, checkpoint);
        emit(onProgress, "create-person", "failed");
        throw new PersonCreationError(
          `Failed to create person entity: ${err}`,
          err instanceof Error ? err : undefined,
        );
      }
    }
  } else {
    emit(onProgress, "create-person", "skipped", "Already complete");
  }

  // Step 3: Accept invite
  if (!isStepComplete(checkpoint, "accept-invite")) {
    emit(onProgress, "accept-invite", "running");
    try {
      const result = await client.acceptInvite(token, checkpoint.personUid!);
      checkpoint.companyUid = result.membership.companyUid;
      checkpoint.membershipKey = result.membership.membershipKey;
      // Resolve company slug
      try {
        const company = await client.entity.get(result.membership.companyUid);
        checkpoint.companySlug = company.slug;
        checkpoint.bucketName = company.bucketName;
      } catch {
        // Non-critical — we have the UID
      }
      checkpoint.completedSteps.push("accept-invite");
      await writeCheckpoint(config.hqRoot, checkpoint);
      emit(onProgress, "accept-invite", "done", `role: ${result.membership.role}`);
    } catch (err) {
      if (err instanceof VaultConflictError) {
        // Already accepted — that's fine for resume
        emit(onProgress, "accept-invite", "skipped", "Already accepted");
        checkpoint.completedSteps.push("accept-invite");
        await writeCheckpoint(config.hqRoot, checkpoint);
      } else {
        checkpoint.failedStep = "accept-invite";
        checkpoint.error = String(err);
        await writeCheckpoint(config.hqRoot, checkpoint);
        emit(onProgress, "accept-invite", "failed");
        throw new InviteAcceptError(
          `Failed to accept invite: ${err}`,
          err instanceof Error ? err : undefined,
        );
      }
    }
  } else {
    emit(onProgress, "accept-invite", "skipped", "Already complete");
  }

  // Step 4: Verify STS vend
  if (!isStepComplete(checkpoint, "verify-sts")) {
    emit(onProgress, "verify-sts", "running");
    try {
      const ctx = await resolveEntityContext(checkpoint.companyUid!, config.vaultConfig);
      if (!ctx.credentials.accessKeyId) {
        throw new Error("STS vend returned empty credentials");
      }
      checkpoint.bucketName = ctx.bucketName;
      checkpoint.completedSteps.push("verify-sts");
      await writeCheckpoint(config.hqRoot, checkpoint);
      emit(onProgress, "verify-sts", "done");
    } catch (err) {
      checkpoint.failedStep = "verify-sts";
      checkpoint.error = String(err);
      await writeCheckpoint(config.hqRoot, checkpoint);
      emit(onProgress, "verify-sts", "failed");
      throw new StsVerifyError(
        `STS verification failed: ${err}`,
        err instanceof Error ? err : undefined,
      );
    }
  } else {
    emit(onProgress, "verify-sts", "skipped", "Already complete");
  }

  // Step 5: First sync
  if (!isStepComplete(checkpoint, "first-sync")) {
    emit(onProgress, "first-sync", "running");
    try {
      await sync({
        company: checkpoint.companyUid!,
        hqRoot: config.hqRoot,
        vaultConfig: config.vaultConfig,
      });
      checkpoint.completedSteps.push("first-sync");
      await writeCheckpoint(config.hqRoot, checkpoint);
      emit(onProgress, "first-sync", "done");
    } catch (err) {
      checkpoint.failedStep = "first-sync";
      checkpoint.error = String(err);
      await writeCheckpoint(config.hqRoot, checkpoint);
      emit(onProgress, "first-sync", "failed");
      throw new FirstSyncError(
        `First sync failed: ${err}`,
        err instanceof Error ? err : undefined,
      );
    }
  } else {
    emit(onProgress, "first-sync", "skipped", "Already complete");
  }

  // Step 6: Write config
  emit(onProgress, "write-config", "running");
  // Get membership role from the accepted invite
  const members = await client.listMembersOfCompany(checkpoint.companyUid!);
  const ours = members.find(m => m.personUid === checkpoint.personUid);
  const role = ours?.role ?? "member";

  const configPath = await writeHqConfig(config.hqRoot, {
    companyUid: checkpoint.companyUid!,
    companySlug: checkpoint.companySlug ?? "",
    personUid: checkpoint.personUid!,
    role,
    bucketName: checkpoint.bucketName,
    vaultApiUrl: config.vaultConfig.apiUrl,
    configuredAt: new Date().toISOString(),
  });
  checkpoint.completedSteps.push("write-config");
  await writeCheckpoint(config.hqRoot, checkpoint);
  emit(onProgress, "write-config", "done", configPath);

  // Clean up checkpoint on success
  await deleteCheckpoint(config.hqRoot);

  return {
    personUid: checkpoint.personUid!,
    companyUid: checkpoint.companyUid!,
    companySlug: checkpoint.companySlug ?? "",
    role,
    bucketName: checkpoint.bucketName,
    configPath,
  };
}

/**
 * Resume an interrupted onboarding flow from checkpoint.
 */
export async function resumeOnboarding(
  config: OnboardingConfig,
  onProgress?: ProgressCallback,
): Promise<OnboardingResult> {
  const checkpoint = await readCheckpoint(config.hqRoot);
  if (!checkpoint) {
    throw new Error("No onboarding checkpoint found. Run /onboard to start a new flow.");
  }

  // We need the original input to resume — checkpoint has enough state
  // to reconstruct which flow we're in, but we need to synthesize input
  if (checkpoint.mode === "create-company") {
    // We can't fully reconstruct the original input from checkpoint alone,
    // but the orchestrator is idempotent — completed steps will be skipped.
    // For create-company, we need at minimum the company slug.
    const input: CreateCompanyInput = {
      mode: "create-company",
      personName: "",  // Not needed for resume — person already created
      personEmail: "", // Not needed for resume
      companyName: "", // Not needed for resume
      companySlug: checkpoint.companySlug ?? "",
    };
    return createCompanyFlow(input, config, onProgress);
  } else {
    const input: JoinCompanyInput = {
      mode: "join-company",
      personName: "",
      personEmail: "",
      inviteToken: checkpoint.inviteToken ?? "",
    };
    return joinCompanyFlow(input, config, onProgress);
  }
}

/**
 * Desktop installer contract implementation.
 */
export const onboardingContract: DesktopInstallerContract = {
  async runOnboarding(input, config, onProgress) {
    if (input.mode === "create-company") {
      return createCompanyFlow(input, config, onProgress);
    }
    return joinCompanyFlow(input, config, onProgress);
  },
  resumeOnboarding,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCheckpoint(mode: "create-company" | "join-company"): OnboardingCheckpoint {
  const now = new Date().toISOString();
  return {
    mode,
    startedAt: now,
    updatedAt: now,
    completedSteps: [],
  };
}

function emit(
  cb: ProgressCallback | undefined,
  step: OnboardingStep,
  status: "pending" | "running" | "done" | "skipped" | "failed",
  detail?: string,
): void {
  cb?.({ step, status, detail });
}

function slugFromEmail(email: string): string {
  return email.split("@")[0].toLowerCase().replace(/[^a-z0-9-]/g, "-");
}

async function safeGetEntity(client: VaultClient, uid: string) {
  try {
    return await client.entity.get(uid);
  } catch (err) {
    if (err instanceof VaultNotFoundError) return null;
    throw err;
  }
}

async function writeHqConfig(hqRoot: string, config: HqConfig): Promise<string> {
  const configPath = join(hqRoot, ".hq", "config.json");
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
  return configPath;
}

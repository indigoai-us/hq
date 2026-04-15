/**
 * Onboarding checkpoint persistence (VLT-9 US-001).
 *
 * Reads/writes .hq/onboarding-state.json for idempotent resume.
 * If a flow fails partway, re-running picks up from the last checkpoint.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import type { OnboardingCheckpoint, OnboardingStep } from "./types.js";

const CHECKPOINT_FILE = "onboarding-state.json";

export function getCheckpointPath(hqRoot: string): string {
  return join(hqRoot, ".hq", CHECKPOINT_FILE);
}

export async function readCheckpoint(
  hqRoot: string,
): Promise<OnboardingCheckpoint | null> {
  const path = getCheckpointPath(hqRoot);
  try {
    const raw = await readFile(path, "utf-8");
    return JSON.parse(raw) as OnboardingCheckpoint;
  } catch {
    return null;
  }
}

export async function writeCheckpoint(
  hqRoot: string,
  checkpoint: OnboardingCheckpoint,
): Promise<void> {
  const path = getCheckpointPath(hqRoot);
  await mkdir(dirname(path), { recursive: true });
  checkpoint.updatedAt = new Date().toISOString();
  await writeFile(path, JSON.stringify(checkpoint, null, 2) + "\n", "utf-8");
}

export function isStepComplete(
  checkpoint: OnboardingCheckpoint | null,
  step: OnboardingStep,
): boolean {
  if (!checkpoint) return false;
  return checkpoint.completedSteps.includes(step);
}

export async function deleteCheckpoint(hqRoot: string): Promise<void> {
  const { unlink } = await import("node:fs/promises");
  const path = getCheckpointPath(hqRoot);
  try {
    await unlink(path);
  } catch {
    // File may not exist — that's fine
  }
}

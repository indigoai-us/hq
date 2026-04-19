/**
 * CLI prompt helpers for /onboard command (VLT-9 US-002).
 *
 * Provides typed prompt interfaces the slash command can call.
 * These are library functions — the actual UX is in onboard.md.
 */

import type { OnboardingResult, OnboardingProgress } from "../types.js";

/**
 * Format a progress event for CLI display.
 */
export function formatProgress(event: OnboardingProgress, stepNumber: number, totalSteps: number): string {
  const statusIcon = {
    pending: "○",
    running: "◉",
    done: "✓",
    skipped: "→",
    failed: "✗",
  }[event.status];

  const detail = event.detail ? ` — ${event.detail}` : "";
  return `  ${statusIcon} Step ${stepNumber}/${totalSteps}: ${event.step}${detail}`;
}

/**
 * Format the success summary box.
 */
export function formatSummary(result: OnboardingResult): string {
  const lines = [
    "┌─────────────────────────────────────────────┐",
    "│  HQ Onboarding Complete                     │",
    "├─────────────────────────────────────────────┤",
    `│  Company:  ${result.companySlug.padEnd(33)}│`,
    `│  UID:      ${result.companyUid.padEnd(33)}│`,
    `│  Person:   ${result.personUid.padEnd(33)}│`,
    `│  Role:     ${result.role.padEnd(33)}│`,
  ];

  if (result.bucketName) {
    lines.push(`│  Bucket:   ${result.bucketName.padEnd(33)}│`);
  }

  lines.push("├─────────────────────────────────────────────┤");
  lines.push("│  Next steps:                                │");

  if (result.role === "owner") {
    lines.push("│    • Run /invite <email> to add team        │");
    lines.push("│    • Run hq sync to push files              │");
  } else {
    lines.push("│    • Run hq sync to pull latest files       │");
  }

  lines.push("└─────────────────────────────────────────────┘");
  return lines.join("\n");
}

/**
 * Format an error for CLI display with recovery hints.
 */
export function formatError(error: Error, checkpointPath: string): string {
  const lines = [
    `ERROR: ${error.message}`,
    "",
    `Checkpoint saved to: ${checkpointPath}`,
    "To retry: /onboard --resume",
  ];
  return lines.join("\n");
}

/**
 * Validate a company slug: lowercase, alphanumeric + hyphens, 3-40 chars.
 */
export function validateSlug(slug: string): string | null {
  if (slug.length < 3) return "Slug must be at least 3 characters";
  if (slug.length > 40) return "Slug must be at most 40 characters";
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(slug)) {
    return "Slug must be lowercase alphanumeric with hyphens (e.g. 'my-company')";
  }
  return null;
}

/**
 * Validate email format.
 */
export function validateEmail(email: string): string | null {
  if (!email.includes("@") || !email.includes(".")) {
    return "Invalid email format";
  }
  return null;
}

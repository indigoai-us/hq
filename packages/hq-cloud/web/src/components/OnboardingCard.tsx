"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { fetchClaudeTokenStatus } from "@/services/settings";
import { fetchFileCount } from "@/services/files";
import { Card } from "./Card";

interface StepState {
  accountCreated: boolean;
  hasClaudeToken: boolean;
  fileCount: number | null;
}

interface OnboardingCardProps {
  onDismiss: () => void;
}

const CHECKMARK_ICON = (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2.5}
    className="text-accent-green"
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
  </svg>
);

const ARROW_ICON = (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    className="text-text-tertiary"
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
  </svg>
);

export function OnboardingCard({ onDismiss }: OnboardingCardProps) {
  const [steps, setSteps] = useState<StepState>({
    accountCreated: true,
    hasClaudeToken: false,
    fileCount: null,
  });
  const [loading, setLoading] = useState(true);
  const [allComplete, setAllComplete] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      const [tokenStatus, fileCount] = await Promise.all([
        fetchClaudeTokenStatus().catch(() => ({ hasToken: false, setAt: null })),
        fetchFileCount().catch(() => 0),
      ]);
      setSteps({
        accountCreated: true,
        hasClaudeToken: tokenStatus.hasToken,
        fileCount,
      });
    } catch {
      // If everything fails, just show the card with defaults
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  // Check if all steps are complete and auto-dismiss after 2s
  useEffect(() => {
    if (
      steps.accountCreated &&
      steps.hasClaudeToken &&
      steps.fileCount !== null &&
      steps.fileCount > 0
    ) {
      setAllComplete(true);
      const timer = setTimeout(() => {
        onDismiss();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [steps, onDismiss]);

  if (loading) {
    return (
      <Card className="mx-4 p-6">
        <div className="flex items-center justify-center h-32">
          <span className="text-text-secondary text-sm">Checking setup...</span>
        </div>
      </Card>
    );
  }

  if (allComplete) {
    return (
      <div data-testid="onboarding-card">
        <Card className="mx-4 p-6">
          <div className="flex flex-col items-center gap-3 py-4">
            <div className="w-12 h-12 rounded-full bg-accent-green/20 flex items-center justify-center">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.5}
                className="text-accent-green"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <p className="text-sm font-medium text-text-primary">
              All set! You&apos;re ready to go.
            </p>
            <button
              type="button"
              onClick={onDismiss}
              className="text-xs text-accent-blue hover:underline"
            >
              Dismiss
            </button>
          </div>
        </Card>
      </div>
    );
  }

  const tokenComplete = steps.hasClaudeToken;
  const filesComplete = steps.fileCount !== null && steps.fileCount > 0;

  return (
    <div data-testid="onboarding-card">
    <Card className="mx-4 p-6">
      {/* Header */}
      <div className="mb-5">
        <h3 className="text-base font-semibold text-text-primary mb-1">
          Welcome to HQ Cloud
        </h3>
        <p className="text-sm text-text-secondary">
          Complete these steps to get started with your first session.
        </p>
      </div>

      {/* Steps */}
      <div className="space-y-4">
        {/* Step 1: Account Created */}
        <div className="flex items-start gap-3" data-testid="step-account">
          <div className="mt-0.5 shrink-0">{CHECKMARK_ICON}</div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-text-primary">
              Account created
            </p>
            <p className="text-xs text-text-tertiary mt-0.5">
              Signed in via Clerk
            </p>
          </div>
        </div>

        {/* Step 2: Claude Token */}
        <div className="flex items-start gap-3" data-testid="step-claude-token">
          <div className="mt-0.5 shrink-0">
            {tokenComplete ? CHECKMARK_ICON : ARROW_ICON}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-text-primary">
              Claude token stored
            </p>
            {tokenComplete ? (
              <p className="text-xs text-text-tertiary mt-0.5">
                Token configured
              </p>
            ) : (
              <div className="mt-1">
                <p className="text-xs text-text-tertiary mb-2">
                  Required to launch Claude Code sessions
                </p>
                <Link
                  href="/settings/claude-token"
                  className="inline-flex items-center gap-1 text-xs font-medium text-accent-blue hover:underline"
                >
                  Add Claude token
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Step 3: HQ Files Synced */}
        <div className="flex items-start gap-3" data-testid="step-files">
          <div className="mt-0.5 shrink-0">
            {filesComplete ? CHECKMARK_ICON : ARROW_ICON}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-text-primary">
              HQ files synced
            </p>
            {filesComplete ? (
              <p className="text-xs text-text-tertiary mt-0.5">
                {steps.fileCount} file{steps.fileCount !== 1 ? "s" : ""} uploaded
              </p>
            ) : (
              <p className="text-xs text-text-tertiary mt-0.5">
                {steps.fileCount === 0
                  ? "0 files — run setup to sync your HQ directory"
                  : "Checking files..."}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-5 pt-4 border-t border-border-subtle">
        <button
          type="button"
          onClick={onDismiss}
          className="text-xs text-text-tertiary hover:text-text-secondary transition-colors"
          data-testid="skip-setup"
        >
          Skip setup
        </button>
      </div>
    </Card>
    </div>
  );
}

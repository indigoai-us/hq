"use client";

import { useState, useCallback } from "react";
import { Card } from "./Card";

interface SetupBannerProps {
  onDismiss: () => void;
}

/**
 * Banner shown when the user's HQ files have not been synced yet.
 *
 * Offers two options:
 *   1. "Sync via CLI" - shows the `hq auth login` command to copy
 *   2. "Upload from browser" - disabled for MVP with "Coming soon" tooltip
 *
 * Dismissible, but reappears on next login if setup is still incomplete
 * (dismissal stored in sessionStorage, not localStorage).
 */
export function SetupBanner({ onDismiss }: SetupBannerProps) {
  const [copied, setCopied] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText("hq auth login");
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select the text for manual copy
    }
  }, []);

  return (
    <div data-testid="setup-banner">
      <Card className="mx-4 p-6">
        {/* Header with dismiss button */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-accent-blue/20 flex items-center justify-center shrink-0">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                className="text-accent-blue"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 16v-4m0-4h.01M12 2a10 10 0 100 20 10 10 0 000-20z"
                />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-text-primary">
                Sync your HQ files
              </h3>
              <p className="text-xs text-text-secondary mt-0.5">
                Your HQ files haven&apos;t been synced yet. Set up sync to
                access your files, navigator, and more.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            className="shrink-0 p-1 text-text-tertiary hover:text-text-secondary transition-colors"
            aria-label="Dismiss setup banner"
            data-testid="dismiss-setup-banner"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Options */}
        <div className="space-y-3">
          {/* Option 1: Sync via CLI */}
          <div className="bg-bg-elevated rounded-md p-4 border border-border-subtle">
            <div className="flex items-center gap-2 mb-2">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                className="text-text-secondary"
              >
                <polyline points="4 17 10 11 4 5" />
                <line x1="12" y1="19" x2="20" y2="19" />
              </svg>
              <span className="text-sm font-medium text-text-primary">
                Sync via CLI
              </span>
            </div>
            <p className="text-xs text-text-tertiary mb-3">
              Run this command in your terminal to authenticate and sync your HQ
              files:
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-bg-primary rounded px-3 py-2 text-sm font-mono text-text-primary border border-border-subtle">
                hq auth login
              </code>
              <button
                type="button"
                onClick={() => void handleCopy()}
                className="shrink-0 px-3 py-2 bg-btn-primary text-text-primary text-xs font-medium rounded hover:opacity-90 transition-opacity"
                data-testid="copy-cli-command"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>

          {/* Option 2: Upload from browser (disabled for MVP) */}
          <div className="relative">
            <button
              type="button"
              disabled
              className="w-full bg-bg-elevated rounded-md p-4 border border-border-subtle opacity-50 cursor-not-allowed text-left"
              onMouseEnter={() => setShowTooltip(true)}
              onMouseLeave={() => setShowTooltip(false)}
              data-testid="browser-upload-option"
            >
              <div className="flex items-center gap-2">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  className="text-text-tertiary"
                >
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                <span className="text-sm font-medium text-text-tertiary">
                  Upload from browser
                </span>
              </div>
            </button>
            {showTooltip && (
              <div
                className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-bg-primary border border-border-subtle rounded-md shadow-lg text-xs text-text-secondary whitespace-nowrap z-10"
                data-testid="coming-soon-tooltip"
              >
                Coming soon
              </div>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}

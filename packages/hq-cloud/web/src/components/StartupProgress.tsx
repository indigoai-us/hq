"use client";

import { useState, useEffect } from "react";
import type { StartupPhase } from "@/types/websocket";

interface StartupProgressProps {
  phase: StartupPhase | null | undefined;
  startupTimestamp: number | null | undefined;
  error?: string | null;
  timedOut?: boolean;
}

const PHASE_ORDER: StartupPhase[] = ["launching", "connecting", "initializing", "ready"];

const PHASE_LABELS: Record<StartupPhase, string> = {
  launching: "Launching container...",
  connecting: "Waiting for container to connect...",
  initializing: "Initializing Claude Code...",
  ready: "Session active",
  failed: "Startup failed",
};

function getPhaseIndex(phase: StartupPhase): number {
  return PHASE_ORDER.indexOf(phase);
}

export function StartupProgress({ phase, startupTimestamp, error, timedOut }: StartupProgressProps) {
  const [elapsed, setElapsed] = useState(0);
  const currentPhase = phase ?? "launching";

  // Elapsed seconds timer
  useEffect(() => {
    if (currentPhase === "ready" || currentPhase === "failed") return;

    const baseTime = startupTimestamp ?? Date.now();
    const update = () => setElapsed(Math.floor((Date.now() - baseTime) / 1000));
    update();

    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [currentPhase, startupTimestamp]);

  const isFailed = currentPhase === "failed";
  const isComplete = currentPhase === "ready";
  const currentIndex = getPhaseIndex(currentPhase);

  return (
    <div className="flex flex-col items-center gap-4 py-6 w-full" data-testid="startup-progress">
      {/* Spinner or status icon */}
      {!isFailed && !isComplete && (
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="text-accent-blue animate-spin"
        >
          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
      )}
      {isFailed && (
        <div className="w-8 h-8 rounded-full bg-status-error/20 flex items-center justify-center">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-status-error">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </div>
      )}

      {/* Phase label + elapsed */}
      <div className="text-center">
        <p className={`text-sm ${isFailed ? "text-status-error" : "text-text-secondary"}`}>
          {PHASE_LABELS[currentPhase]}
        </p>
        {!isFailed && !isComplete && (
          <p className="text-xs text-text-tertiary mt-1">{elapsed}s elapsed</p>
        )}
      </div>

      {/* Phase progress dots */}
      <div className="flex items-center gap-2">
        {PHASE_ORDER.map((p, i) => {
          const phaseIdx = currentIndex;
          let dotClass: string;

          if (isFailed) {
            // All dots gray on failure
            dotClass = "bg-status-idle";
          } else if (i < phaseIdx) {
            // Completed phases — green
            dotClass = "bg-status-healthy";
          } else if (i === phaseIdx) {
            // Current phase — blue pulsing
            dotClass = "bg-accent-blue animate-pulse";
          } else {
            // Pending phases — gray
            dotClass = "bg-bg-tertiary";
          }

          return (
            <div key={p} className="flex items-center gap-2">
              {i > 0 && (
                <div
                  className={`w-6 h-px ${
                    i <= phaseIdx && !isFailed ? "bg-status-healthy" : "bg-border-subtle"
                  }`}
                />
              )}
              <div
                className={`w-2.5 h-2.5 rounded-full ${dotClass}`}
                title={p}
              />
            </div>
          );
        })}
      </div>

      {/* Phase labels under dots */}
      <div className="flex items-start gap-2 text-center">
        {PHASE_ORDER.map((p) => (
          <span key={p} className="text-[10px] text-text-tertiary w-16 leading-tight">
            {p.charAt(0).toUpperCase() + p.slice(1)}
          </span>
        ))}
      </div>

      {/* Error message */}
      {isFailed && error && (
        <p className="text-xs text-status-error bg-status-error/10 px-3 py-2 rounded max-w-sm text-center">
          {error}
        </p>
      )}

      {/* Timeout warning */}
      {timedOut && !isFailed && !isComplete && (
        <p className="text-xs text-status-warning bg-status-warning/10 px-3 py-2 rounded max-w-sm text-center">
          Session startup is taking longer than expected. You may want to stop and retry.
        </p>
      )}
    </div>
  );
}

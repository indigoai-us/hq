"use client";

import { useEffect, useRef, useCallback } from "react";
import { useCreateSession } from "@/hooks/useCreateSession";
import { WorkerPickerItem } from "./WorkerPickerItem";
import { SkillPickerItem } from "./SkillPickerItem";
import { ParameterInput } from "./ParameterInput";
import { SpawnConfirmation } from "./SpawnConfirmation";
import { ActionButton } from "./ActionButton";
import { Card } from "./Card";
import type { Session } from "@/types/session";

interface NewSessionSheetProps {
  open: boolean;
  onClose: () => void;
  onCreated: (session: Session) => void;
}

const workerStepLabels: Record<string, string> = {
  "pick-worker": "Select Worker",
  "pick-skill": "Select Skill",
  configure: "Configure",
  review: "Review",
};

export function NewSessionSheet({ open, onClose, onCreated }: NewSessionSheetProps) {
  const {
    mode,
    setMode,
    workers,
    workersLoading,
    workersError,
    workerStep,
    selectedWorker,
    selectedSkill,
    parameters,
    selectWorker,
    selectSkill,
    setParameter,
    canProceedWorker,
    goToReview,
    freeFormPrompt,
    setFreeFormPrompt,
    label,
    creating,
    error,
    confirm,
    goBack,
    reset,
  } = useCreateSession();

  const promptRef = useRef<HTMLTextAreaElement>(null);

  // Reset state when sheet opens
  useEffect(() => {
    if (open) {
      reset();
    }
  }, [open, reset]);

  // Focus prompt input when switching to free-form
  useEffect(() => {
    if (mode === "free-form" && promptRef.current) {
      promptRef.current.focus();
    }
  }, [mode]);

  const handleConfirm = useCallback(async () => {
    const session = await confirm();
    if (session) {
      onCreated(session);
    }
  }, [confirm, onCreated]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (freeFormPrompt.trim() && !creating) {
          void handleConfirm();
        }
      }
    },
    [freeFormPrompt, creating, handleConfirm],
  );

  const handleClose = useCallback(() => {
    if (!creating) {
      onClose();
    }
  }, [creating, onClose]);

  if (!open) return null;

  const showBackButton = mode !== "choose";

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60"
        onClick={handleClose}
        data-testid="sheet-backdrop"
      />

      {/* Sheet */}
      <div
        className="relative w-full sm:max-w-[32rem] max-h-[85vh] bg-bg-primary border border-border-subtle rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col"
        data-testid="new-session-sheet"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle shrink-0">
          <div className="flex items-center gap-2">
            {showBackButton && (
              <button
                type="button"
                onClick={goBack}
                className="text-accent-blue text-sm hover:underline mr-1"
                data-testid="sheet-back"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M19 12H5M12 19l-7-7 7-7" />
                </svg>
              </button>
            )}
            <h2 className="text-base font-semibold text-text-primary">
              {mode === "choose" && "New Session"}
              {mode === "free-form" && "New Session"}
              {mode === "worker" && workerStepLabels[workerStep]}
            </h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={creating}
            className="text-text-tertiary hover:text-text-primary transition-colors p-1"
            aria-label="Close"
            data-testid="sheet-close"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Error banner */}
        {error && (
          <div className="mx-4 mt-3 p-3 bg-accent-red/10 border border-accent-red/30 rounded-md">
            <span className="text-sm text-accent-red" data-testid="sheet-error">{error}</span>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-auto px-4 py-4">
          {/* Mode selection */}
          {mode === "choose" && (
            <div className="space-y-3" data-testid="mode-chooser">
              <Card onClick={() => setMode("free-form")} className="p-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-accent-blue/20 flex items-center justify-center shrink-0">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-accent-blue">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-text-primary">Free-form Prompt</p>
                    <p className="text-xs text-text-secondary mt-0.5">
                      Type any prompt to start a Claude Code session
                    </p>
                  </div>
                </div>
              </Card>

              <Card onClick={() => setMode("worker")} className="p-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-accent-purple/20 flex items-center justify-center shrink-0">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-accent-purple">
                      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-text-primary">Select a Worker</p>
                    <p className="text-xs text-text-secondary mt-0.5">
                      Choose a worker and skill from HQ registry
                    </p>
                  </div>
                </div>
              </Card>
            </div>
          )}

          {/* Free-form prompt input */}
          {mode === "free-form" && (
            <div className="space-y-4" data-testid="free-form-mode">
              <div>
                <label className="block text-sm text-text-secondary mb-2">What should Claude work on?</label>
                <textarea
                  ref={promptRef}
                  value={freeFormPrompt}
                  onChange={(e) => setFreeFormPrompt(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Describe what you want Claude to do..."
                  rows={4}
                  disabled={creating}
                  className="w-full bg-bg-tertiary text-text-primary text-sm px-3 py-2 rounded-md border border-border-subtle focus:border-accent-blue focus:outline-none resize-none"
                  data-testid="free-form-input"
                />
              </div>

              {freeFormPrompt.trim() && (
                <div className="text-xs text-text-tertiary">
                  Session label: <span className="text-text-secondary">{label}</span>
                </div>
              )}

              <ActionButton
                label={creating ? "Creating..." : "Start Session"}
                variant="primary"
                disabled={!freeFormPrompt.trim() || creating}
                onClick={() => void handleConfirm()}
                className="w-full"
              />
            </div>
          )}

          {/* Worker flow */}
          {mode === "worker" && (
            <div data-testid="worker-mode">
              {/* Loading */}
              {workersLoading && (
                <div className="flex items-center justify-center py-8">
                  <span className="text-text-secondary text-sm">Loading workers...</span>
                </div>
              )}

              {/* Worker loading error */}
              {workersError && (
                <div className="text-center py-8">
                  <span className="text-text-secondary text-sm">{workersError}</span>
                </div>
              )}

              {/* Pick worker */}
              {workerStep === "pick-worker" && !workersLoading && !workersError && (
                <div className="space-y-3">
                  {workers.length === 0 ? (
                    <div className="text-text-secondary text-sm text-center py-8">
                      No active workers available
                    </div>
                  ) : (
                    workers.map((w) => (
                      <WorkerPickerItem key={w.id} worker={w} onSelect={selectWorker} />
                    ))
                  )}
                </div>
              )}

              {/* Pick skill */}
              {workerStep === "pick-skill" && selectedWorker && (
                <div className="space-y-3">
                  <p className="text-xs text-text-tertiary mb-2">
                    Worker: <span className="text-text-secondary">{selectedWorker.name}</span>
                  </p>
                  {selectedWorker.skills.map((s) => (
                    <SkillPickerItem key={s.id} skill={s} onSelect={selectSkill} />
                  ))}
                </div>
              )}

              {/* Configure parameters */}
              {workerStep === "configure" && selectedSkill && (
                <div>
                  <p className="text-xs text-text-tertiary mb-2">
                    {selectedWorker?.name} / {selectedSkill.name}
                  </p>
                  <div className="bg-bg-card rounded-lg border border-border-subtle p-4 mb-4">
                    {selectedSkill.parameters?.map((param) => (
                      <ParameterInput
                        key={param.name}
                        param={param}
                        value={parameters[param.name] ?? param.defaultValue ?? ""}
                        onChange={setParameter}
                      />
                    ))}
                  </div>
                  <ActionButton
                    label="Continue"
                    variant="primary"
                    disabled={!canProceedWorker}
                    onClick={goToReview}
                    className="w-full"
                  />
                </div>
              )}

              {/* Review */}
              {workerStep === "review" && selectedWorker && selectedSkill && (
                <div className="space-y-4">
                  <SpawnConfirmation
                    worker={selectedWorker}
                    skill={selectedSkill}
                    parameters={parameters}
                  />

                  <div className="text-xs text-text-tertiary">
                    Session label: <span className="text-text-secondary">{label}</span>
                  </div>

                  <ActionButton
                    label={creating ? "Creating..." : "Start Session"}
                    variant="primary"
                    disabled={creating}
                    onClick={() => void handleConfirm()}
                    className="w-full"
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

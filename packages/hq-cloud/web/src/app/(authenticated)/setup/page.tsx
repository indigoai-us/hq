"use client";

import { useState, useCallback } from "react";
import { submitSetup, streamSync } from "@/services/settings";
import { ActionButton } from "@/components/ActionButton";
import type { SyncProgressEvent } from "@/types/settings";

type SetupPhase = "input" | "syncing" | "success";

export default function SetupPage() {
  const [hqDir, setHqDir] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Sync progress state
  const [phase, setPhase] = useState<SetupPhase>("input");
  const [totalFiles, setTotalFiles] = useState(0);
  const [uploaded, setUploaded] = useState(0);
  const [currentFile, setCurrentFile] = useState("");
  const [syncErrors, setSyncErrors] = useState(0);

  const handleSubmit = useCallback(async () => {
    const trimmed = hqDir.trim();
    if (!trimmed) {
      setError("Please enter your HQ directory path.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      // Phase 1: Provision S3 space (fast)
      const setup = await submitSetup(trimmed);
      const total = setup.totalFiles;
      setTotalFiles(total);

      if (total === 0) {
        // No files to sync — go straight to success
        setPhase("success");
        return;
      }

      // Phase 2: Stream file uploads
      setPhase("syncing");

      await streamSync((event: SyncProgressEvent) => {
        setUploaded(event.uploaded);
        setCurrentFile(event.file);
        if (event.failed) setSyncErrors(event.failed);
      });

      setPhase("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Setup failed. Please try again.");
      setPhase("input");
    } finally {
      setSaving(false);
    }
  }, [hqDir]);

  const progressPct = totalFiles > 0 ? Math.round((uploaded / totalFiles) * 100) : 0;

  // --- Syncing phase ---
  if (phase === "syncing") {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-bg-primary p-4">
        <div className="w-full max-w-[28rem] space-y-6">
          <div className="text-center space-y-2">
            <h1 className="text-2xl font-bold text-text-primary">Syncing your HQ</h1>
            <p className="text-sm text-text-secondary">
              Uploading {totalFiles.toLocaleString()} files to the cloud...
            </p>
          </div>

          <div className="bg-bg-card rounded-lg border border-border-subtle p-6 space-y-4">
            {/* Progress bar */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-text-secondary">
                  {uploaded.toLocaleString()} of {totalFiles.toLocaleString()} files
                </span>
                <span className="text-text-primary font-medium">{progressPct}%</span>
              </div>
              <div className="w-full h-2 bg-bg-elevated rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent-blue rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>

            {/* Current file ticker */}
            {currentFile && (
              <div className="flex items-center gap-2 min-h-[24px]">
                <span className="text-text-tertiary text-xs shrink-0">Uploading:</span>
                <span className="text-xs text-text-secondary truncate font-mono">
                  {currentFile}
                </span>
              </div>
            )}

            {syncErrors > 0 && (
              <p className="text-xs text-accent-red">
                {syncErrors} file{syncErrors !== 1 ? "s" : ""} failed to upload
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // --- Success phase ---
  if (phase === "success") {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-bg-primary p-4">
        <div className="w-full max-w-[28rem] space-y-6">
          <div className="text-center space-y-3">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-accent-green/20">
              <svg className="w-8 h-8 text-accent-green" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-text-primary">You&apos;re all set!</h1>
            <p className="text-sm text-text-secondary">
              {uploaded > 0
                ? `${uploaded.toLocaleString()} files synced to the cloud.`
                : "Your HQ is connected."}
              {syncErrors > 0 && ` (${syncErrors} failed)`}
            </p>
          </div>

          <div className="bg-bg-card rounded-lg border border-border-subtle p-6 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-text-secondary">HQ Directory</span>
              <span className="text-text-primary font-mono text-xs">{hqDir}</span>
            </div>
            {uploaded > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-text-secondary">Files synced</span>
                <span className="text-text-primary">{uploaded.toLocaleString()}</span>
              </div>
            )}
          </div>

          <ActionButton
            label="Continue to HQ Cloud"
            variant="prominent"
            onClick={() => { window.location.href = "/agents"; }}
            className="w-full"
          />
        </div>
      </div>
    );
  }

  // --- Input phase (default) ---
  return (
    <div className="min-h-dvh flex items-center justify-center bg-bg-primary p-4">
      <div className="w-full max-w-[28rem] space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold text-text-primary">Welcome to HQ Cloud</h1>
          <p className="text-sm text-text-secondary">
            Connect your local HQ directory to get started. This is where your workers,
            projects, and knowledge live.
          </p>
        </div>

        <div className="bg-bg-card rounded-lg border border-border-subtle p-4 space-y-4">
          <div>
            <label
              htmlFor="hqDir"
              className="block text-sm font-medium text-text-primary mb-1.5"
            >
              HQ Directory Path
            </label>
            <input
              id="hqDir"
              type="text"
              value={hqDir}
              onChange={(e) => setHqDir(e.target.value)}
              placeholder={
                typeof navigator !== "undefined" && navigator.userAgent?.includes("Win")
                  ? "C:\\hq"
                  : "/home/you/hq"
              }
              className="w-full px-3 py-2.5 bg-bg-elevated border border-border-subtle rounded-md text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent-blue"
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleSubmit();
              }}
            />
            <p className="mt-1.5 text-[11px] text-text-tertiary">
              The absolute path to your HQ folder on your machine.
            </p>
          </div>

          {error && (
            <div className="p-3 bg-accent-red/10 border border-accent-red/30 rounded-md">
              <span className="text-sm text-accent-red">{error}</span>
            </div>
          )}

          <ActionButton
            label={saving ? "Connecting..." : "Save & Continue"}
            variant="primary"
            disabled={saving || !hqDir.trim()}
            onClick={() => void handleSubmit()}
            className="w-full"
          />
        </div>

        <p className="text-center text-[11px] text-text-tertiary">
          You can change this later in Settings.
        </p>
      </div>
    </div>
  );
}

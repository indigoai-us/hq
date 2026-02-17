"use client";

import { useState, useEffect, useCallback } from "react";
import {
  fetchClaudeTokenStatus,
  storeClaudeToken,
  removeClaudeToken,
} from "@/services/settings";
import { SectionHeader } from "@/components/SectionHeader";
import { ActionButton } from "@/components/ActionButton";

export default function ClaudeTokenPage() {
  const [hasToken, setHasToken] = useState(false);
  const [setAt, setSetAt] = useState<string | null>(null);
  const [tokenInput, setTokenInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const status = await fetchClaudeTokenStatus();
        setHasToken(status.hasToken);
        setSetAt(status.setAt);
      } catch {
        setError("Failed to load token status.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSave = useCallback(async () => {
    const trimmed = tokenInput.trim();
    if (!trimmed) {
      setError("Please paste your Claude OAuth token.");
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await storeClaudeToken(trimmed);
      setHasToken(result.hasToken);
      setSetAt(result.setAt);
      setTokenInput("");
      setSuccess("Token stored successfully.");
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to store token.");
    } finally {
      setSaving(false);
    }
  }, [tokenInput]);

  const handleRemove = useCallback(async () => {
    setRemoving(true);
    setError(null);
    setSuccess(null);

    try {
      await removeClaudeToken();
      setHasToken(false);
      setSetAt(null);
      setSuccess("Token removed.");
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove token.");
    } finally {
      setRemoving(false);
    }
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="text-text-secondary text-sm">Loading...</span>
      </div>
    );
  }

  const formattedDate = setAt
    ? new Date(setAt).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <div className="py-4">
      <SectionHeader title="Claude Token" className="px-4 mb-4" />

      {/* Status indicator */}
      <div className="mx-4 bg-bg-card rounded-lg border border-border-subtle p-4 mb-4">
        <div className="flex items-center gap-2 mb-1">
          <span
            className={`w-2.5 h-2.5 rounded-full ${hasToken ? "bg-accent-green" : "bg-accent-red"}`}
          />
          <span className="text-sm font-medium text-text-primary">
            {hasToken ? "Token stored" : "No token"}
          </span>
        </div>
        {formattedDate && (
          <p className="text-[11px] text-text-tertiary ml-4.5">
            Set on {formattedDate}
          </p>
        )}
      </div>

      {/* Instructions */}
      <div className="mx-4 bg-bg-card rounded-lg border border-border-subtle p-4 mb-4">
        <p className="text-sm font-medium text-text-primary mb-2">
          How to get your token
        </p>
        <ol className="list-decimal list-inside text-sm text-text-secondary space-y-1.5">
          <li>
            Open a terminal and run:{" "}
            <code className="px-1.5 py-0.5 bg-bg-elevated rounded text-xs font-mono text-text-primary">
              claude setup-token
            </code>
          </li>
          <li>Copy the token it outputs</li>
          <li>Paste it below and click Save</li>
        </ol>
        <p className="mt-2 text-[11px] text-text-tertiary">
          This token is valid for ~1 year. It is encrypted at rest and never
          exposed via the API.
        </p>
      </div>

      {/* Token input */}
      <div className="mx-4 bg-bg-card rounded-lg border border-border-subtle p-4 space-y-4">
        <div>
          <label
            htmlFor="claude-token"
            className="block text-sm font-medium text-text-primary mb-1.5"
          >
            {hasToken ? "Update Token" : "Paste Token"}
          </label>
          <input
            id="claude-token"
            type="password"
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            placeholder="Paste your Claude OAuth token here"
            className="w-full px-3 py-2.5 bg-bg-elevated border border-border-subtle rounded-md text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent-blue font-mono"
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleSave();
            }}
          />
        </div>

        {error && (
          <div className="p-3 bg-accent-red/10 border border-accent-red/30 rounded-md">
            <span className="text-sm text-accent-red">{error}</span>
          </div>
        )}

        {success && (
          <div className="p-3 bg-accent-green/10 border border-accent-green/30 rounded-md">
            <span className="text-sm text-accent-green">{success}</span>
          </div>
        )}

        <div className="flex gap-3">
          <ActionButton
            label={saving ? "Saving..." : hasToken ? "Update Token" : "Save Token"}
            variant="primary"
            disabled={saving || !tokenInput.trim()}
            onClick={() => void handleSave()}
          />
          {hasToken && (
            <ActionButton
              label={removing ? "Removing..." : "Remove Token"}
              variant="muted"
              disabled={removing}
              onClick={() => void handleRemove()}
            />
          )}
        </div>
      </div>
    </div>
  );
}

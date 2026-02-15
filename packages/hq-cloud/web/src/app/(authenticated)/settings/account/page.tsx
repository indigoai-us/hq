"use client";

import { useState, useEffect, useCallback } from "react";
import { fetchSettings, updateSettings } from "@/services/settings";
import { SectionHeader } from "@/components/SectionHeader";
import { ActionButton } from "@/components/ActionButton";

export default function AccountSettingsPage() {
  const [hqDir, setHqDir] = useState("");
  const [originalHqDir, setOriginalHqDir] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const settings = await fetchSettings();
        const dir = settings.hqDir ?? "";
        setHqDir(dir);
        setOriginalHqDir(dir);
      } catch {
        setError("Failed to load settings.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSave = useCallback(async () => {
    const trimmed = hqDir.trim();
    if (!trimmed) {
      setError("HQ directory cannot be empty.");
      return;
    }

    setSaving(true);
    setError(null);
    setSaved(false);

    try {
      const updated = await updateSettings({ hqDir: trimmed });
      setOriginalHqDir(updated.hqDir ?? trimmed);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }, [hqDir]);

  const hasChanges = hqDir.trim() !== originalHqDir;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="text-text-secondary text-sm">Loading settings...</span>
      </div>
    );
  }

  return (
    <div className="py-4">
      <SectionHeader title="Account" className="px-4 mb-4" />

      <div className="mx-4 bg-bg-card rounded-lg border border-border-subtle p-4 space-y-4">
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
            placeholder="C:\hq"
            className="w-full px-3 py-2.5 bg-bg-elevated border border-border-subtle rounded-md text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent-blue"
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleSave();
            }}
          />
          <p className="mt-1.5 text-[11px] text-text-tertiary">
            Absolute path to your HQ folder. Workers, projects, and knowledge are read from here.
          </p>
        </div>

        {error && (
          <div className="p-3 bg-accent-red/10 border border-accent-red/30 rounded-md">
            <span className="text-sm text-accent-red">{error}</span>
          </div>
        )}

        {saved && (
          <div className="p-3 bg-accent-green/10 border border-accent-green/30 rounded-md">
            <span className="text-sm text-accent-green">Settings saved.</span>
          </div>
        )}

        <ActionButton
          label={saving ? "Saving..." : "Save"}
          variant="primary"
          disabled={saving || !hasChanges}
          onClick={() => void handleSave()}
        />
      </div>
    </div>
  );
}

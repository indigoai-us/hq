"use client";

import { useState, useCallback } from "react";
import { useNotifications } from "@/hooks/useNotifications";
import { SectionHeader } from "@/components/SectionHeader";

interface SettingRowProps {
  label: string;
  description: string;
  value: boolean;
  onToggle: () => Promise<void>;
  disabled?: boolean;
}

function SettingRow({ label, description, value, onToggle, disabled }: SettingRowProps) {
  const [toggling, setToggling] = useState(false);

  const handleToggle = useCallback(async () => {
    if (toggling) return;
    setToggling(true);
    try {
      await onToggle();
    } catch {
      // Failed
    } finally {
      setToggling(false);
    }
  }, [onToggle, toggling]);

  return (
    <div className={`flex items-center justify-between py-3 px-4 ${disabled ? "opacity-50" : ""}`}>
      <div className="flex-1 mr-3">
        <p className={`text-base ${disabled ? "text-text-tertiary" : "text-text-primary"}`}>
          {label}
        </p>
        <p className={`text-[11px] ${disabled ? "text-text-tertiary" : "text-text-tertiary"}`}>
          {description}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        aria-label={`${label} toggle`}
        disabled={disabled || toggling}
        onClick={() => void handleToggle()}
        className={`
          relative w-11 h-6 rounded-full transition-colors
          ${value ? "bg-accent-blue" : "bg-bg-elevated"}
          ${disabled || toggling ? "cursor-not-allowed" : "cursor-pointer"}
        `}
      >
        <span
          className={`
            absolute top-0.5 w-5 h-5 rounded-full transition-transform
            ${value ? "translate-x-[22px] bg-text-primary" : "translate-x-0.5 bg-text-tertiary"}
          `}
        />
      </button>
    </div>
  );
}

export default function NotificationSettingsPage() {
  const {
    permissionGranted,
    settings,
    toggleEnabled,
    toggleQuestions,
    togglePermissions,
    toggleStatusUpdates,
    requestPermission,
  } = useNotifications();

  return (
    <div className="py-4">
      {/* Permission banner */}
      {!permissionGranted && (
        <div className="mx-4 mb-5 p-4 bg-bg-card rounded-lg border border-accent-yellow">
          <p className="text-base font-semibold text-text-primary mb-1">
            Notifications are disabled
          </p>
          <p className="text-sm text-text-secondary mb-3">
            Enable push notifications to get alerts when workers need your input.
          </p>
          <button
            type="button"
            onClick={() => void requestPermission()}
            className="px-4 py-2 bg-accent-blue text-text-primary text-sm font-semibold rounded-md"
          >
            Enable Notifications
          </button>
        </div>
      )}

      {/* Master toggle */}
      <div className="mb-5">
        <SectionHeader title="Notifications" className="px-4 mb-2" />
        <div className="mx-4 bg-bg-card rounded-lg border border-border-subtle">
          <SettingRow
            label="Push Notifications"
            description="Receive alerts when workers need your attention"
            value={settings.enabled}
            onToggle={toggleEnabled}
          />
        </div>
      </div>

      {/* Category toggles */}
      <div className="mb-5">
        <SectionHeader title="Categories" className="px-4 mb-2" />
        <div className="mx-4 bg-bg-card rounded-lg border border-border-subtle divide-y divide-border-subtle">
          <SettingRow
            label="Questions"
            description="When a worker asks you a question"
            value={settings.questionsEnabled}
            onToggle={toggleQuestions}
            disabled={!settings.enabled}
          />
          <SettingRow
            label="Permission Requests"
            description="When a worker needs approval to use a tool"
            value={settings.permissionsEnabled}
            onToggle={togglePermissions}
            disabled={!settings.enabled}
          />
          <SettingRow
            label="Status Updates"
            description="When a worker completes or encounters an error"
            value={settings.statusUpdatesEnabled}
            onToggle={toggleStatusUpdates}
            disabled={!settings.enabled}
          />
        </div>
      </div>
    </div>
  );
}

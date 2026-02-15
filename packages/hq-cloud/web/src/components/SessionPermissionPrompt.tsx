"use client";

import { useState, useCallback } from "react";
import type { SessionPermissionRequest } from "@/types/session";
import { ActionButton } from "./ActionButton";

interface SessionPermissionPromptProps {
  permission: SessionPermissionRequest;
  onRespond: (requestId: string, behavior: "allow" | "deny") => void;
}

function formatInput(input: Record<string, unknown>): string {
  // Show the command or key details from the tool input
  if (input.command) return String(input.command);
  if (input.file_path) return String(input.file_path);
  if (input.pattern) return String(input.pattern);
  if (input.url) return String(input.url);
  const keys = Object.keys(input);
  if (keys.length === 0) return "";
  return JSON.stringify(input, null, 2).slice(0, 200);
}

export function SessionPermissionPrompt({ permission, onRespond }: SessionPermissionPromptProps) {
  const [sending, setSending] = useState(false);

  const handleRespond = useCallback(
    async (behavior: "allow" | "deny") => {
      if (sending) return;
      setSending(true);
      navigator.vibrate?.(50);
      onRespond(permission.requestId, behavior);
    },
    [permission.requestId, onRespond, sending],
  );

  const inputDisplay = formatInput(permission.input);

  return (
    <div className="p-3 bg-bg-card rounded-lg border border-accent-yellow/30 mr-auto max-w-[90%]">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-semibold text-accent-yellow uppercase tracking-wide">
          Permission Request
        </span>
      </div>

      <p className="text-sm text-text-primary mb-1">
        Allow <strong className="text-accent-purple font-mono">{permission.toolName}</strong>?
      </p>

      {inputDisplay && (
        <pre className="text-xs text-text-tertiary bg-bg-secondary rounded px-2 py-1.5 mb-3 overflow-x-auto whitespace-pre-wrap break-all font-mono">
          {inputDisplay}
        </pre>
      )}

      <div className="flex gap-2">
        <ActionButton
          label="Allow"
          variant="prominent"
          size="sm"
          disabled={sending}
          onClick={() => void handleRespond("allow")}
        />
        <ActionButton
          label="Deny"
          variant="muted"
          size="sm"
          disabled={sending}
          onClick={() => void handleRespond("deny")}
        />
      </div>
    </div>
  );
}

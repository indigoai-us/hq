import type { AgentPermissionRequest } from "@/types/agent";
import { ActionButton } from "./ActionButton";

interface PermissionPromptProps {
  permission: AgentPermissionRequest;
  onRespond: (permissionId: string, allowed: boolean) => void;
  sending?: boolean;
}

export function PermissionPrompt({ permission, onRespond, sending }: PermissionPromptProps) {
  return (
    <div className="p-3 bg-bg-card rounded-lg border border-accent-yellow/30">
      <p className="text-xs text-accent-yellow font-medium mb-1">Permission Requested</p>
      <p className="text-sm text-text-primary mb-1">
        Allow <strong>{permission.tool}</strong>?
      </p>
      <p className="text-xs text-text-tertiary mb-3">{permission.description}</p>
      <div className="flex gap-2">
        <ActionButton
          label="Allow"
          variant="prominent"
          size="sm"
          disabled={sending}
          onClick={() => onRespond(permission.id, true)}
        />
        <ActionButton
          label="Deny"
          variant="muted"
          size="sm"
          disabled={sending}
          onClick={() => onRespond(permission.id, false)}
        />
      </div>
    </div>
  );
}

import { apiRequest, getToken } from "@/lib/api-client";
import { getApiUrl } from "@/lib/storage";
import type {
  UserSettingsResponse,
  OnboardingStatusResponse,
  SetupResponse,
  SyncProgressEvent,
  ClaudeTokenStatusResponse,
  ClaudeTokenStoreResponse,
} from "@/types/settings";

export async function fetchSettings(): Promise<UserSettingsResponse> {
  return apiRequest<UserSettingsResponse>("/api/settings");
}

export async function updateSettings(
  data: { hqDir?: string; notifications?: Record<string, boolean> },
): Promise<UserSettingsResponse> {
  return apiRequest<UserSettingsResponse>("/api/settings", {
    method: "PUT",
    body: data,
  });
}

export async function checkOnboardingStatus(): Promise<OnboardingStatusResponse> {
  return apiRequest<OnboardingStatusResponse>("/api/settings/onboarding-status");
}

export async function submitSetup(hqDir: string): Promise<SetupResponse> {
  return apiRequest<SetupResponse>("/api/settings/setup", {
    method: "POST",
    body: { hqDir },
  });
}

export async function fetchClaudeTokenStatus(): Promise<ClaudeTokenStatusResponse> {
  return apiRequest<ClaudeTokenStatusResponse>("/api/settings/claude-token");
}

export async function storeClaudeToken(token: string): Promise<ClaudeTokenStoreResponse> {
  return apiRequest<ClaudeTokenStoreResponse>("/api/settings/claude-token", {
    method: "POST",
    body: { token },
  });
}

export async function removeClaudeToken(): Promise<{ ok: boolean; hasToken: boolean }> {
  return apiRequest<{ ok: boolean; hasToken: boolean }>("/api/settings/claude-token", {
    method: "DELETE",
  });
}

/**
 * Stream the sync upload progress via SSE.
 * Calls onProgress for each event, returns final result.
 */
export async function streamSync(
  onProgress: (event: SyncProgressEvent) => void,
): Promise<SyncProgressEvent> {
  const token = await getToken();
  if (!token) throw new Error("Not authenticated");

  const baseUrl = getApiUrl();
  const response = await fetch(`${baseUrl}/api/settings/setup/sync`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error(`Sync failed: ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let lastEvent: SyncProgressEvent = { uploaded: 0, total: 0, failed: 0, file: "" };
  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Parse SSE lines from buffer
    const lines = buffer.split("\n");
    // Keep incomplete last line in buffer
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try {
          const event: SyncProgressEvent = JSON.parse(line.slice(6));
          lastEvent = event;
          onProgress(event);
        } catch {
          // skip malformed lines
        }
      }
    }
  }

  return lastEvent;
}

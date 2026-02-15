import { apiRequest } from "@/lib/api-client";
import type { Session, SessionMessage, CreateSessionInput } from "@/types/session";

export async function createSession(input: CreateSessionInput = {}): Promise<Session> {
  return apiRequest<Session>("/api/sessions", {
    method: "POST",
    body: input,
  });
}

export async function fetchSessions(): Promise<Session[]> {
  return apiRequest<Session[]>("/api/sessions");
}

export async function fetchSession(sessionId: string): Promise<Session> {
  return apiRequest<Session>(`/api/sessions/${sessionId}`);
}

export async function fetchSessionMessages(
  sessionId: string,
  options?: { limit?: number; before?: number },
): Promise<SessionMessage[]> {
  const params = new URLSearchParams();
  if (options?.limit) params.set("limit", String(options.limit));
  if (options?.before) params.set("before", String(options.before));
  const qs = params.toString();
  return apiRequest<SessionMessage[]>(`/api/sessions/${sessionId}/messages${qs ? `?${qs}` : ""}`);
}

export async function stopSession(sessionId: string): Promise<{ ok: boolean; status: string }> {
  return apiRequest<{ ok: boolean; status: string }>(`/api/sessions/${sessionId}`, {
    method: "DELETE",
  });
}

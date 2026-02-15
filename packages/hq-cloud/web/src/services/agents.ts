import { apiRequest } from "@/lib/api-client";
import type { Agent, AgentMessage } from "@/types/agent";

export async function fetchAgents(): Promise<Agent[]> {
  return apiRequest<Agent[]>("/api/agents");
}

export async function fetchAgent(agentId: string): Promise<Agent> {
  return apiRequest<Agent>(`/api/agents/${agentId}`);
}

export async function fetchAgentMessages(agentId: string): Promise<AgentMessage[]> {
  return apiRequest<AgentMessage[]>(`/api/agents/${agentId}/messages`);
}

export async function answerQuestion(
  agentId: string,
  questionId: string,
  answer: string,
): Promise<void> {
  await apiRequest(`/api/agents/${agentId}/questions/${questionId}/answer`, {
    method: "POST",
    body: { answer },
  });
}

export async function respondToPermission(
  agentId: string,
  permissionId: string,
  allowed: boolean,
): Promise<void> {
  await apiRequest(`/api/agents/${agentId}/permissions/${permissionId}/respond`, {
    method: "POST",
    body: { allowed },
  });
}

export async function sendMessage(agentId: string, content: string): Promise<void> {
  await apiRequest(`/api/agents/${agentId}/messages`, {
    method: "POST",
    body: { content },
  });
}

export async function sendGlobalMessage(content: string): Promise<void> {
  await apiRequest("/api/messages", {
    method: "POST",
    body: { content },
  });
}

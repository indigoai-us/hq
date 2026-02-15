import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  fetchAgents,
  fetchAgent,
  fetchAgentMessages,
  answerQuestion,
  respondToPermission,
  sendMessage,
  sendGlobalMessage,
} from "../agents";

vi.mock("@/lib/api-client", () => ({
  apiRequest: vi.fn(),
}));

import { apiRequest } from "@/lib/api-client";

const mockApiRequest = vi.mocked(apiRequest);

describe("agents service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("fetchAgents", () => {
    it("calls apiRequest with /api/agents", async () => {
      const agents = [
        { id: "1", name: "Agent A", type: "code", status: "running" },
        { id: "2", name: "Agent B", type: "research", status: "idle" },
      ];
      mockApiRequest.mockResolvedValue(agents);

      const result = await fetchAgents();
      expect(mockApiRequest).toHaveBeenCalledWith("/api/agents");
      expect(result).toEqual(agents);
    });

    it("returns empty array when no agents exist", async () => {
      mockApiRequest.mockResolvedValue([]);

      const result = await fetchAgents();
      expect(result).toEqual([]);
    });

    it("propagates errors from apiRequest", async () => {
      mockApiRequest.mockRejectedValue(new Error("Not authenticated. Please log in."));
      await expect(fetchAgents()).rejects.toThrow("Not authenticated");
    });
  });

  describe("fetchAgent", () => {
    it("calls apiRequest with /api/agents/:id", async () => {
      const agent = { id: "abc", name: "Test Agent", type: "code", status: "running" };
      mockApiRequest.mockResolvedValue(agent);

      const result = await fetchAgent("abc");
      expect(mockApiRequest).toHaveBeenCalledWith("/api/agents/abc");
      expect(result).toEqual(agent);
    });

    it("propagates 404 errors", async () => {
      mockApiRequest.mockRejectedValue(new Error("API error 404: Not Found"));
      await expect(fetchAgent("nonexistent")).rejects.toThrow("404");
    });
  });

  describe("fetchAgentMessages", () => {
    it("calls apiRequest with /api/agents/:id/messages", async () => {
      const messages = [
        { id: "m1", role: "agent", content: "Hello", timestamp: "2025-01-01T00:00:00Z" },
        { id: "m2", role: "user", content: "Hi", timestamp: "2025-01-01T00:01:00Z" },
      ];
      mockApiRequest.mockResolvedValue(messages);

      const result = await fetchAgentMessages("agent-1");
      expect(mockApiRequest).toHaveBeenCalledWith("/api/agents/agent-1/messages");
      expect(result).toEqual(messages);
    });
  });

  describe("answerQuestion", () => {
    it("sends POST with answer body", async () => {
      mockApiRequest.mockResolvedValue(undefined);

      await answerQuestion("agent-1", "q-1", "Yes, proceed");
      expect(mockApiRequest).toHaveBeenCalledWith(
        "/api/agents/agent-1/questions/q-1/answer",
        {
          method: "POST",
          body: { answer: "Yes, proceed" },
        },
      );
    });

    it("propagates errors", async () => {
      mockApiRequest.mockRejectedValue(new Error("API error 500: Internal Server Error"));
      await expect(answerQuestion("a", "q", "answer")).rejects.toThrow("500");
    });
  });

  describe("respondToPermission", () => {
    it("sends POST with allowed: true", async () => {
      mockApiRequest.mockResolvedValue(undefined);

      await respondToPermission("agent-1", "perm-1", true);
      expect(mockApiRequest).toHaveBeenCalledWith(
        "/api/agents/agent-1/permissions/perm-1/respond",
        {
          method: "POST",
          body: { allowed: true },
        },
      );
    });

    it("sends POST with allowed: false", async () => {
      mockApiRequest.mockResolvedValue(undefined);

      await respondToPermission("agent-1", "perm-1", false);
      expect(mockApiRequest).toHaveBeenCalledWith(
        "/api/agents/agent-1/permissions/perm-1/respond",
        {
          method: "POST",
          body: { allowed: false },
        },
      );
    });
  });

  describe("sendMessage", () => {
    it("sends POST with content body to agent endpoint", async () => {
      mockApiRequest.mockResolvedValue(undefined);

      await sendMessage("agent-1", "Hello agent");
      expect(mockApiRequest).toHaveBeenCalledWith(
        "/api/agents/agent-1/messages",
        {
          method: "POST",
          body: { content: "Hello agent" },
        },
      );
    });
  });

  describe("sendGlobalMessage", () => {
    it("sends POST with content body to /api/messages", async () => {
      mockApiRequest.mockResolvedValue(undefined);

      await sendGlobalMessage("Broadcast message");
      expect(mockApiRequest).toHaveBeenCalledWith(
        "/api/messages",
        {
          method: "POST",
          body: { content: "Broadcast message" },
        },
      );
    });

    it("propagates errors from apiRequest", async () => {
      mockApiRequest.mockRejectedValue(new Error("API error 403: Forbidden"));
      await expect(sendGlobalMessage("test")).rejects.toThrow("403");
    });
  });
});

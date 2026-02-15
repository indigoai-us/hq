import { describe, it, expect, beforeEach, vi } from "vitest";
import { fetchNavigatorTree } from "../navigator";

vi.mock("@/lib/api-client", () => ({
  apiRequest: vi.fn(),
}));

import { apiRequest } from "@/lib/api-client";

const mockApiRequest = vi.mocked(apiRequest);

describe("navigator service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("fetchNavigatorTree", () => {
    it("calls apiRequest with /api/navigator/tree", async () => {
      mockApiRequest.mockResolvedValue({ groups: [] });

      await fetchNavigatorTree();
      expect(mockApiRequest).toHaveBeenCalledWith("/api/navigator/tree");
    });

    it("returns the tree response with groups", async () => {
      const tree = {
        groups: [
          {
            id: "companies",
            name: "Companies",
            children: [
              { id: "c1", name: "Acme Corp", type: "company", status: "healthy" },
            ],
          },
          {
            id: "projects",
            name: "Projects",
            children: [
              { id: "p1", name: "Project Alpha", type: "project", status: "idle" },
            ],
          },
        ],
      };
      mockApiRequest.mockResolvedValue(tree);

      const result = await fetchNavigatorTree();
      expect(result).toEqual(tree);
    });

    it("returns empty groups array", async () => {
      mockApiRequest.mockResolvedValue({ groups: [] });

      const result = await fetchNavigatorTree();
      expect(result.groups).toEqual([]);
    });

    it("returns groups with nested children", async () => {
      const tree = {
        groups: [
          {
            id: "knowledge",
            name: "Knowledge",
            children: [
              {
                id: "k1",
                name: "API Docs",
                type: "knowledge",
                status: "healthy",
                children: [
                  {
                    id: "f1",
                    name: "auth.md",
                    type: "file",
                    status: "healthy",
                    filePath: "/knowledge/api/auth.md",
                  },
                ],
              },
            ],
          },
        ],
      };
      mockApiRequest.mockResolvedValue(tree);

      const result = await fetchNavigatorTree();
      expect(result.groups[0].children[0].children).toHaveLength(1);
      expect(result.groups[0].children[0].children![0].filePath).toBe(
        "/knowledge/api/auth.md",
      );
    });

    it("propagates errors from apiRequest", async () => {
      mockApiRequest.mockRejectedValue(new Error("Not authenticated. Please log in."));
      await expect(fetchNavigatorTree()).rejects.toThrow("Not authenticated");
    });

    it("propagates 500 server errors", async () => {
      mockApiRequest.mockRejectedValue(new Error("API error 500: Internal Server Error"));
      await expect(fetchNavigatorTree()).rejects.toThrow("500");
    });

    it("returns groups with various node statuses", async () => {
      const tree = {
        groups: [
          {
            id: "workers",
            name: "Workers",
            children: [
              { id: "w1", name: "Worker A", type: "worker", status: "healthy" },
              { id: "w2", name: "Worker B", type: "worker", status: "warning" },
              { id: "w3", name: "Worker C", type: "worker", status: "error" },
              { id: "w4", name: "Worker D", type: "worker", status: "idle" },
            ],
          },
        ],
      };
      mockApiRequest.mockResolvedValue(tree);

      const result = await fetchNavigatorTree();
      const statuses = result.groups[0].children.map(
        (c: { status: string }) => c.status,
      );
      expect(statuses).toEqual(["healthy", "warning", "error", "idle"]);
    });

    it("returns multiple groups", async () => {
      const tree = {
        groups: [
          { id: "g1", name: "Group 1", children: [] },
          { id: "g2", name: "Group 2", children: [] },
          { id: "g3", name: "Group 3", children: [] },
        ],
      };
      mockApiRequest.mockResolvedValue(tree);

      const result = await fetchNavigatorTree();
      expect(result.groups).toHaveLength(3);
    });
  });
});

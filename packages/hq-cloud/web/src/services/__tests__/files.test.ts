import { describe, it, expect, beforeEach, vi } from "vitest";
import { fetchFileContent } from "../files";
import type { FileContentResponse } from "../files";

vi.mock("@/lib/api-client", () => ({
  apiRequest: vi.fn(),
}));

import { apiRequest } from "@/lib/api-client";

const mockApiRequest = vi.mocked(apiRequest);

describe("files service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("fetchFileContent", () => {
    it("calls apiRequest with encoded file path", async () => {
      const response: FileContentResponse = {
        path: "/knowledge/api.md",
        content: "# API Docs",
        size: 11,
      };
      mockApiRequest.mockResolvedValue(response);

      await fetchFileContent("/knowledge/api.md");
      expect(mockApiRequest).toHaveBeenCalledWith(
        "/api/files/content?path=%2Fknowledge%2Fapi.md",
      );
    });

    it("encodes special characters in the file path", async () => {
      mockApiRequest.mockResolvedValue({
        path: "/docs/my file (1).md",
        content: "content",
        size: 7,
      });

      await fetchFileContent("/docs/my file (1).md");
      expect(mockApiRequest).toHaveBeenCalledWith(
        `/api/files/content?path=${encodeURIComponent("/docs/my file (1).md")}`,
      );
    });

    it("returns file content response", async () => {
      const response: FileContentResponse = {
        path: "/workers/dev-team/worker.yaml",
        content: "name: dev-team\ntype: code",
        size: 25,
        mimeType: "text/yaml",
        lastModified: "2025-06-01T12:00:00Z",
      };
      mockApiRequest.mockResolvedValue(response);

      const result = await fetchFileContent("/workers/dev-team/worker.yaml");
      expect(result.path).toBe("/workers/dev-team/worker.yaml");
      expect(result.content).toBe("name: dev-team\ntype: code");
      expect(result.size).toBe(25);
      expect(result.mimeType).toBe("text/yaml");
      expect(result.lastModified).toBe("2025-06-01T12:00:00Z");
    });

    it("returns response without optional fields", async () => {
      const response: FileContentResponse = {
        path: "/README.md",
        content: "# Readme",
        size: 9,
      };
      mockApiRequest.mockResolvedValue(response);

      const result = await fetchFileContent("/README.md");
      expect(result.mimeType).toBeUndefined();
      expect(result.lastModified).toBeUndefined();
    });

    it("propagates not authenticated errors", async () => {
      mockApiRequest.mockRejectedValue(new Error("Not authenticated. Please log in."));
      await expect(fetchFileContent("/any.md")).rejects.toThrow("Not authenticated");
    });

    it("propagates 404 errors for missing files", async () => {
      mockApiRequest.mockRejectedValue(new Error("API error 404: File not found"));
      await expect(fetchFileContent("/missing.md")).rejects.toThrow("404");
    });

    it("propagates 500 server errors", async () => {
      mockApiRequest.mockRejectedValue(new Error("API error 500: Internal Server Error"));
      await expect(fetchFileContent("/any.md")).rejects.toThrow("500");
    });

    it("handles paths with hash and query-like characters", async () => {
      mockApiRequest.mockResolvedValue({
        path: "/docs/notes#section?foo=bar.md",
        content: "content",
        size: 7,
      });

      await fetchFileContent("/docs/notes#section?foo=bar.md");
      expect(mockApiRequest).toHaveBeenCalledWith(
        `/api/files/content?path=${encodeURIComponent("/docs/notes#section?foo=bar.md")}`,
      );
    });

    it("handles empty file content", async () => {
      const response: FileContentResponse = {
        path: "/empty-file.txt",
        content: "",
        size: 0,
      };
      mockApiRequest.mockResolvedValue(response);

      const result = await fetchFileContent("/empty-file.txt");
      expect(result.content).toBe("");
      expect(result.size).toBe(0);
    });

    it("handles deeply nested file paths", async () => {
      mockApiRequest.mockResolvedValue({
        path: "/a/b/c/d/e/f.ts",
        content: "export {}",
        size: 9,
      });

      await fetchFileContent("/a/b/c/d/e/f.ts");
      expect(mockApiRequest).toHaveBeenCalledWith(
        `/api/files/content?path=${encodeURIComponent("/a/b/c/d/e/f.ts")}`,
      );
    });

    it("returns large file content", async () => {
      const largeContent = "x".repeat(100000);
      const response: FileContentResponse = {
        path: "/large-file.txt",
        content: largeContent,
        size: 100000,
      };
      mockApiRequest.mockResolvedValue(response);

      const result = await fetchFileContent("/large-file.txt");
      expect(result.content).toHaveLength(100000);
      expect(result.size).toBe(100000);
    });
  });
});

/**
 * Tests for the files service.
 * Verifies API calls for fetching file content.
 */
import { fetchFileContent } from "../../src/services/files";
import * as api from "../../src/services/api";

// Mock the API module
jest.mock("../../src/services/api", () => ({
  apiRequest: jest.fn(),
}));

const mockApiRequest = api.apiRequest as jest.MockedFunction<typeof api.apiRequest>;

describe("fetchFileContent", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("calls apiRequest with encoded file path", async () => {
    const mockResponse = {
      path: "/companies/stelo/knowledge/brand.md",
      content: "# Brand Guidelines",
      size: 19,
    };
    mockApiRequest.mockResolvedValue(mockResponse);

    const result = await fetchFileContent("/companies/stelo/knowledge/brand.md");

    expect(mockApiRequest).toHaveBeenCalledWith(
      "/api/files/content?path=%2Fcompanies%2Fstelo%2Fknowledge%2Fbrand.md",
    );
    expect(result).toEqual(mockResponse);
  });

  it("encodes special characters in file path", async () => {
    mockApiRequest.mockResolvedValue({ path: "", content: "", size: 0 });

    await fetchFileContent("/path/with spaces/file (1).md");

    expect(mockApiRequest).toHaveBeenCalledWith(
      expect.stringContaining("path%2Fwith%20spaces%2Ffile%20(1).md"),
    );
  });

  it("propagates API errors", async () => {
    mockApiRequest.mockRejectedValue(new Error("API error 404: Not found"));

    await expect(fetchFileContent("/nonexistent.md")).rejects.toThrow(
      "API error 404: Not found",
    );
  });
});

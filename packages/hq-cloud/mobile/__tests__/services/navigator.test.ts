/**
 * Tests for navigator service.
 * Verifies API calls for fetching the navigator tree.
 */
import { fetchNavigatorTree } from "../../src/services/navigator";
import { apiRequest } from "../../src/services/api";

jest.mock("../../src/services/api", () => ({
  apiRequest: jest.fn(),
}));

const mockApiRequest = apiRequest as jest.MockedFunction<typeof apiRequest>;

describe("navigator service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("fetchNavigatorTree", () => {
    it("calls the correct API endpoint", async () => {
      mockApiRequest.mockResolvedValue({ groups: [] });
      await fetchNavigatorTree();
      expect(mockApiRequest).toHaveBeenCalledWith("/api/navigator/tree");
    });

    it("returns the tree response", async () => {
      const mockResponse = {
        groups: [
          {
            id: "group-companies",
            name: "Companies",
            children: [],
          },
        ],
      };
      mockApiRequest.mockResolvedValue(mockResponse);

      const result = await fetchNavigatorTree();
      expect(result).toEqual(mockResponse);
    });

    it("propagates API errors", async () => {
      mockApiRequest.mockRejectedValue(new Error("API error 401: Unauthorized"));
      await expect(fetchNavigatorTree()).rejects.toThrow("API error 401: Unauthorized");
    });
  });
});

import { describe, it, expect, beforeEach, vi } from "vitest";
import { getApiUrl, setApiUrl } from "../storage";

describe("storage", () => {
  const getItemSpy = vi.spyOn(Storage.prototype, "getItem");
  const setItemSpy = vi.spyOn(Storage.prototype, "setItem");

  beforeEach(() => {
    localStorage.clear();
    getItemSpy.mockClear();
    setItemSpy.mockClear();
  });

  describe("getApiUrl", () => {
    it("returns default URL when no URL is stored and no env var set", () => {
      // When NEXT_PUBLIC_API_URL is not set, defaults to localhost:3001
      expect(getApiUrl()).toBe(
        process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001",
      );
    });

    it("returns the stored URL", () => {
      localStorage.setItem("hq_cloud_api_url", "https://api.example.com");
      expect(getApiUrl()).toBe("https://api.example.com");
    });

    it("reads from the correct storage key", () => {
      getApiUrl();
      expect(getItemSpy).toHaveBeenCalledWith("hq_cloud_api_url");
    });
  });

  describe("setApiUrl", () => {
    it("stores the URL in localStorage", () => {
      setApiUrl("https://custom-api.example.com");
      expect(localStorage.getItem("hq_cloud_api_url")).toBe("https://custom-api.example.com");
    });

    it("writes to the correct storage key", () => {
      setApiUrl("https://example.com");
      expect(setItemSpy).toHaveBeenCalledWith("hq_cloud_api_url", "https://example.com");
    });

    it("overrides the default URL on subsequent getApiUrl calls", () => {
      setApiUrl("https://prod.example.com");
      expect(getApiUrl()).toBe("https://prod.example.com");
    });
  });
});

/**
 * Tests for useFileViewer hook.
 * Verifies file loading, type detection, error handling, retry, and share.
 */
import { renderHook, act, waitFor } from "@testing-library/react-native";
import { Share } from "react-native";
import { useFileViewer, detectFileType, getLanguageLabel, getFileName } from "../../src/hooks/useFileViewer";
import { fetchFileContent } from "../../src/services/files";

// Mock the file service
jest.mock("../../src/services/files", () => ({
  fetchFileContent: jest.fn(),
}));

// Mock Share
jest.spyOn(Share, "share").mockResolvedValue({ action: "sharedAction" } as never);

const mockFetch = fetchFileContent as jest.MockedFunction<typeof fetchFileContent>;

describe("detectFileType", () => {
  it("detects markdown files", () => {
    expect(detectFileType("/path/to/file.md")).toBe("markdown");
    expect(detectFileType("/path/to/file.mdx")).toBe("markdown");
  });

  it("detects JSON files", () => {
    expect(detectFileType("/path/to/file.json")).toBe("json");
  });

  it("detects code files", () => {
    expect(detectFileType("/path/to/file.ts")).toBe("code");
    expect(detectFileType("/path/to/file.tsx")).toBe("code");
    expect(detectFileType("/path/to/file.js")).toBe("code");
    expect(detectFileType("/path/to/file.py")).toBe("code");
    expect(detectFileType("/path/to/file.go")).toBe("code");
    expect(detectFileType("/path/to/file.rs")).toBe("code");
    expect(detectFileType("/path/to/file.yaml")).toBe("code");
    expect(detectFileType("/path/to/file.css")).toBe("code");
    expect(detectFileType("/path/to/file.html")).toBe("code");
    expect(detectFileType("/path/to/file.sql")).toBe("code");
  });

  it("returns text for unknown extensions", () => {
    expect(detectFileType("/path/to/file.txt")).toBe("text");
    expect(detectFileType("/path/to/file.log")).toBe("text");
    expect(detectFileType("/path/to/file.csv")).toBe("text");
  });

  it("handles files without extensions", () => {
    expect(detectFileType("/path/to/dockerfile")).toBe("code");
    expect(detectFileType("/path/to/README")).toBe("text");
  });
});

describe("getLanguageLabel", () => {
  it("returns correct labels for known extensions", () => {
    expect(getLanguageLabel("file.ts")).toBe("TypeScript");
    expect(getLanguageLabel("file.tsx")).toBe("TypeScript (JSX)");
    expect(getLanguageLabel("file.js")).toBe("JavaScript");
    expect(getLanguageLabel("file.py")).toBe("Python");
    expect(getLanguageLabel("file.go")).toBe("Go");
    expect(getLanguageLabel("file.rs")).toBe("Rust");
    expect(getLanguageLabel("file.yaml")).toBe("YAML");
  });

  it("returns Plain Text for unknown extensions", () => {
    expect(getLanguageLabel("file.txt")).toBe("Plain Text");
    expect(getLanguageLabel("file.log")).toBe("Plain Text");
  });
});

describe("getFileName", () => {
  it("extracts file name from full path", () => {
    expect(getFileName("/companies/stelo/knowledge/brand.md")).toBe("brand.md");
  });

  it("handles simple file name", () => {
    expect(getFileName("README.md")).toBe("README.md");
  });

  it("handles path with many segments", () => {
    expect(getFileName("/a/b/c/d/file.ts")).toBe("file.ts");
  });
});

describe("useFileViewer", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("starts in loading state", () => {
    mockFetch.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useFileViewer("/path/to/file.md"));

    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBeNull();
    expect(result.current.file).toBeNull();
  });

  it("loads file content successfully", async () => {
    mockFetch.mockResolvedValue({
      path: "/path/to/file.md",
      content: "# Hello World",
      size: 13,
    });

    const { result } = renderHook(() => useFileViewer("/path/to/file.md"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.file).not.toBeNull();
    expect(result.current.file?.content).toBe("# Hello World");
    expect(result.current.fileType).toBe("markdown");
    expect(result.current.fileName).toBe("file.md");
    expect(result.current.error).toBeNull();
  });

  it("handles fetch error", async () => {
    mockFetch.mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() => useFileViewer("/path/to/file.md"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe("Network error");
    expect(result.current.file).toBeNull();
  });

  it("handles non-Error rejection", async () => {
    mockFetch.mockRejectedValue("something went wrong");

    const { result } = renderHook(() => useFileViewer("/path/to/file.md"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe("Failed to load file");
  });

  it("retry reloads the file", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    const { result } = renderHook(() => useFileViewer("/path/to/file.md"));

    await waitFor(() => {
      expect(result.current.error).toBe("Network error");
    });

    mockFetch.mockResolvedValueOnce({
      path: "/path/to/file.md",
      content: "# Success",
      size: 9,
    });

    act(() => {
      result.current.retry();
    });

    await waitFor(() => {
      expect(result.current.file?.content).toBe("# Success");
    });
    expect(result.current.error).toBeNull();
  });

  it("pretty-prints JSON content", async () => {
    const rawJson = '{"name":"test","value":42}';
    mockFetch.mockResolvedValue({
      path: "/path/to/data.json",
      content: rawJson,
      size: rawJson.length,
    });

    const { result } = renderHook(() => useFileViewer("/path/to/data.json"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.fileType).toBe("json");
    expect(result.current.formattedContent).toBe(
      JSON.stringify(JSON.parse(rawJson), null, 2),
    );
  });

  it("returns raw content for invalid JSON", async () => {
    const invalidJson = "{broken json";
    mockFetch.mockResolvedValue({
      path: "/path/to/bad.json",
      content: invalidJson,
      size: invalidJson.length,
    });

    const { result } = renderHook(() => useFileViewer("/path/to/bad.json"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.formattedContent).toBe(invalidJson);
  });

  it("share calls Share.share with file content", async () => {
    mockFetch.mockResolvedValue({
      path: "/path/to/file.md",
      content: "# Hello",
      size: 7,
    });

    const { result } = renderHook(() => useFileViewer("/path/to/file.md"));

    await waitFor(() => {
      expect(result.current.file).not.toBeNull();
    });

    await act(async () => {
      await result.current.shareFile();
    });

    expect(Share.share).toHaveBeenCalledWith({
      title: "file.md",
      message: "# Hello",
    });
  });

  it("share does nothing when file is not loaded", async () => {
    mockFetch.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useFileViewer("/path/to/file.md"));

    await act(async () => {
      await result.current.shareFile();
    });

    expect(Share.share).not.toHaveBeenCalled();
  });

  it("returns correct language label for code files", async () => {
    mockFetch.mockResolvedValue({
      path: "/path/to/app.tsx",
      content: "const x = 1;",
      size: 12,
    });

    const { result } = renderHook(() => useFileViewer("/path/to/app.tsx"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.fileType).toBe("code");
    expect(result.current.languageLabel).toBe("TypeScript (JSX)");
  });

  it("returns text for plain content", async () => {
    mockFetch.mockResolvedValue({
      path: "/path/to/notes.txt",
      content: "Just some text",
      size: 14,
    });

    const { result } = renderHook(() => useFileViewer("/path/to/notes.txt"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.fileType).toBe("text");
    expect(result.current.formattedContent).toBe("Just some text");
  });
});

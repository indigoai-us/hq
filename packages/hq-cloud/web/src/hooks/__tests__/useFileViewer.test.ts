import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

vi.mock("@/services/files", () => ({
  fetchFileContent: vi.fn(),
}));

describe("useFileViewer", () => {
  let fetchFileContentMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const filesModule = await import("@/services/files");
    fetchFileContentMock = filesModule.fetchFileContent as ReturnType<typeof vi.fn>;
  });

  it("starts with loading=true", async () => {
    fetchFileContentMock.mockResolvedValue({
      path: "/src/index.ts",
      content: "hello",
      size: 5,
    });
    const { useFileViewer } = await import("../useFileViewer");
    const { result } = renderHook(() => useFileViewer("/src/index.ts"));

    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it("loads file content on mount", async () => {
    fetchFileContentMock.mockResolvedValue({
      path: "/src/index.ts",
      content: "const x = 1;",
      size: 13,
    });
    const { useFileViewer } = await import("../useFileViewer");
    const { result } = renderHook(() => useFileViewer("/src/index.ts"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.file).not.toBeNull();
    expect(result.current.file!.content).toBe("const x = 1;");
    expect(result.current.error).toBeNull();
  });

  it("sets error on fetch failure", async () => {
    fetchFileContentMock.mockRejectedValue(new Error("Not found"));
    const { useFileViewer } = await import("../useFileViewer");
    const { result } = renderHook(() => useFileViewer("/missing.ts"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe("Not found");
    expect(result.current.file).toBeNull();
  });

  it("sets generic error for non-Error throws", async () => {
    fetchFileContentMock.mockRejectedValue("oops");
    const { useFileViewer } = await import("../useFileViewer");
    const { result } = renderHook(() => useFileViewer("/bad.ts"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe("Failed to load file");
  });

  // File type detection
  it("detects markdown files", async () => {
    fetchFileContentMock.mockResolvedValue({ path: "/docs/readme.md", content: "# Hi", size: 4 });
    const { useFileViewer } = await import("../useFileViewer");
    const { result } = renderHook(() => useFileViewer("/docs/readme.md"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.fileType).toBe("markdown");
  });

  it("detects mdx files as markdown", async () => {
    fetchFileContentMock.mockResolvedValue({ path: "/page.mdx", content: "# Hi", size: 4 });
    const { useFileViewer } = await import("../useFileViewer");
    const { result } = renderHook(() => useFileViewer("/page.mdx"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.fileType).toBe("markdown");
  });

  it("detects json files", async () => {
    fetchFileContentMock.mockResolvedValue({ path: "/data.json", content: "{}", size: 2 });
    const { useFileViewer } = await import("../useFileViewer");
    const { result } = renderHook(() => useFileViewer("/data.json"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.fileType).toBe("json");
  });

  it("detects TypeScript files as code", async () => {
    fetchFileContentMock.mockResolvedValue({ path: "/src/app.ts", content: "", size: 0 });
    const { useFileViewer } = await import("../useFileViewer");
    const { result } = renderHook(() => useFileViewer("/src/app.ts"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.fileType).toBe("code");
  });

  it("detects tsx files as code", async () => {
    fetchFileContentMock.mockResolvedValue({ path: "/App.tsx", content: "", size: 0 });
    const { useFileViewer } = await import("../useFileViewer");
    const { result } = renderHook(() => useFileViewer("/App.tsx"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.fileType).toBe("code");
  });

  it("detects Python files as code", async () => {
    fetchFileContentMock.mockResolvedValue({ path: "/script.py", content: "", size: 0 });
    const { useFileViewer } = await import("../useFileViewer");
    const { result } = renderHook(() => useFileViewer("/script.py"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.fileType).toBe("code");
  });

  it("detects YAML files as code", async () => {
    fetchFileContentMock.mockResolvedValue({ path: "/config.yaml", content: "", size: 0 });
    const { useFileViewer } = await import("../useFileViewer");
    const { result } = renderHook(() => useFileViewer("/config.yaml"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.fileType).toBe("code");
  });

  it("detects Dockerfile as code", async () => {
    fetchFileContentMock.mockResolvedValue({ path: "/Dockerfile", content: "", size: 0 });
    const { useFileViewer } = await import("../useFileViewer");
    const { result } = renderHook(() => useFileViewer("/Dockerfile"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.fileType).toBe("code");
  });

  it("detects unknown extensions as text", async () => {
    fetchFileContentMock.mockResolvedValue({ path: "/file.xyz", content: "data", size: 4 });
    const { useFileViewer } = await import("../useFileViewer");
    const { result } = renderHook(() => useFileViewer("/file.xyz"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.fileType).toBe("text");
  });

  it("detects files without extension as text", async () => {
    fetchFileContentMock.mockResolvedValue({ path: "/LICENCE", content: "MIT", size: 3 });
    const { useFileViewer } = await import("../useFileViewer");
    const { result } = renderHook(() => useFileViewer("/LICENCE"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.fileType).toBe("text");
  });

  // Language labels
  it("returns TypeScript label for .ts files", async () => {
    fetchFileContentMock.mockResolvedValue({ path: "/app.ts", content: "", size: 0 });
    const { useFileViewer } = await import("../useFileViewer");
    const { result } = renderHook(() => useFileViewer("/app.ts"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.languageLabel).toBe("TypeScript");
  });

  it("returns Python label for .py files", async () => {
    fetchFileContentMock.mockResolvedValue({ path: "/main.py", content: "", size: 0 });
    const { useFileViewer } = await import("../useFileViewer");
    const { result } = renderHook(() => useFileViewer("/main.py"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.languageLabel).toBe("Python");
  });

  it("returns Dockerfile label for Dockerfile", async () => {
    fetchFileContentMock.mockResolvedValue({ path: "/Dockerfile", content: "", size: 0 });
    const { useFileViewer } = await import("../useFileViewer");
    const { result } = renderHook(() => useFileViewer("/Dockerfile"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.languageLabel).toBe("Dockerfile");
  });

  // File name
  it("extracts file name from path", async () => {
    fetchFileContentMock.mockResolvedValue({ path: "/src/utils/helpers.ts", content: "", size: 0 });
    const { useFileViewer } = await import("../useFileViewer");
    const { result } = renderHook(() => useFileViewer("/src/utils/helpers.ts"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.fileName).toBe("helpers.ts");
  });

  // Formatted content
  it("pretty-prints JSON content", async () => {
    const rawJson = '{"key":"value","num":42}';
    fetchFileContentMock.mockResolvedValue({ path: "/data.json", content: rawJson, size: rawJson.length });
    const { useFileViewer } = await import("../useFileViewer");
    const { result } = renderHook(() => useFileViewer("/data.json"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    const expected = JSON.stringify({ key: "value", num: 42 }, null, 2);
    expect(result.current.formattedContent).toBe(expected);
  });

  it("returns raw content for invalid JSON", async () => {
    const invalid = "{broken json";
    fetchFileContentMock.mockResolvedValue({ path: "/bad.json", content: invalid, size: invalid.length });
    const { useFileViewer } = await import("../useFileViewer");
    const { result } = renderHook(() => useFileViewer("/bad.json"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.formattedContent).toBe(invalid);
  });

  it("returns raw content for non-JSON files", async () => {
    const code = "const x = 1;";
    fetchFileContentMock.mockResolvedValue({ path: "/app.ts", content: code, size: code.length });
    const { useFileViewer } = await import("../useFileViewer");
    const { result } = renderHook(() => useFileViewer("/app.ts"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.formattedContent).toBe(code);
  });

  it("returns empty string for formattedContent when file is null", async () => {
    fetchFileContentMock.mockRejectedValue(new Error("fail"));
    const { useFileViewer } = await import("../useFileViewer");
    const { result } = renderHook(() => useFileViewer("/missing.ts"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.formattedContent).toBe("");
  });

  // Retry
  it("retry reloads the file", async () => {
    fetchFileContentMock.mockRejectedValue(new Error("fail"));
    const { useFileViewer } = await import("../useFileViewer");
    const { result } = renderHook(() => useFileViewer("/src/app.ts"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("fail");

    fetchFileContentMock.mockResolvedValue({ path: "/src/app.ts", content: "ok", size: 2 });

    act(() => {
      result.current.retry();
    });

    await waitFor(() => {
      expect(result.current.error).toBeNull();
      expect(result.current.file!.content).toBe("ok");
    });
  });

  // Share
  it("shareFile uses navigator.share when available", async () => {
    const shareMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { value: shareMock, writable: true, configurable: true });

    fetchFileContentMock.mockResolvedValue({ path: "/readme.md", content: "# Hello", size: 7 });
    const { useFileViewer } = await import("../useFileViewer");
    const { result } = renderHook(() => useFileViewer("/readme.md"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.shareFile();
    });

    expect(shareMock).toHaveBeenCalledWith({
      title: "readme.md",
      text: "# Hello",
    });

    // Cleanup
    Object.defineProperty(navigator, "share", { value: undefined, writable: true, configurable: true });
  });

  it("shareFile falls back to clipboard when share is not available", async () => {
    Object.defineProperty(navigator, "share", { value: undefined, writable: true, configurable: true });
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: writeTextMock },
      writable: true,
      configurable: true,
    });

    fetchFileContentMock.mockResolvedValue({ path: "/readme.md", content: "# Hello", size: 7 });
    const { useFileViewer } = await import("../useFileViewer");
    const { result } = renderHook(() => useFileViewer("/readme.md"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.shareFile();
    });

    expect(writeTextMock).toHaveBeenCalledWith("# Hello");
  });

  it("shareFile does nothing when file is null", async () => {
    fetchFileContentMock.mockRejectedValue(new Error("fail"));
    const { useFileViewer } = await import("../useFileViewer");
    const { result } = renderHook(() => useFileViewer("/missing.ts"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    // Should not throw
    await act(async () => {
      await result.current.shareFile();
    });
  });
});

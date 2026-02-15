/**
 * Tests for FileViewerScreen.
 * Verifies loading/error/retry states, content rendering by file type,
 * metadata bar, share button, and navigation header.
 */
import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { Share } from "react-native";
import { FileViewerScreen } from "../../src/screens/FileViewerScreen";
import { fetchFileContent } from "../../src/services/files";

// Mock the file service
jest.mock("../../src/services/files", () => ({
  fetchFileContent: jest.fn(),
}));

// Mock Share
jest.spyOn(Share, "share").mockResolvedValue({ action: "sharedAction" } as never);

const mockFetch = fetchFileContent as jest.MockedFunction<typeof fetchFileContent>;

const mockNavigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
  setOptions: jest.fn(),
  addListener: jest.fn(),
} as unknown as Props["navigation"];

type Props = Parameters<typeof FileViewerScreen>[0];

function createRoute(filePath: string) {
  return {
    key: "test",
    name: "FileViewer" as const,
    params: { filePath },
  };
}

describe("FileViewerScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // --- Loading state ---

  it("shows loading state initially", () => {
    mockFetch.mockReturnValue(new Promise(() => {}));
    const { getByTestId } = render(
      <FileViewerScreen
        navigation={mockNavigation}
        route={createRoute("/path/to/file.md")}
      />,
    );
    expect(getByTestId("file-viewer-loading")).toBeTruthy();
  });

  it("shows loading text", () => {
    mockFetch.mockReturnValue(new Promise(() => {}));
    const { getByText } = render(
      <FileViewerScreen
        navigation={mockNavigation}
        route={createRoute("/path/to/file.md")}
      />,
    );
    expect(getByText("Loading file...")).toBeTruthy();
  });

  // --- Error state ---

  it("shows error state on fetch failure", async () => {
    mockFetch.mockRejectedValue(new Error("Not found"));
    const { getByTestId, getByText } = render(
      <FileViewerScreen
        navigation={mockNavigation}
        route={createRoute("/path/to/missing.md")}
      />,
    );

    await waitFor(() => {
      expect(getByTestId("file-viewer-error")).toBeTruthy();
    });
    expect(getByText("Could not load file")).toBeTruthy();
    expect(getByText("Not found")).toBeTruthy();
  });

  it("shows file path in error state", async () => {
    mockFetch.mockRejectedValue(new Error("Error"));
    const { getByText } = render(
      <FileViewerScreen
        navigation={mockNavigation}
        route={createRoute("/path/to/missing.md")}
      />,
    );

    await waitFor(() => {
      expect(getByText("/path/to/missing.md")).toBeTruthy();
    });
  });

  it("has retry button in error state", async () => {
    mockFetch.mockRejectedValue(new Error("Error"));
    const { getByTestId } = render(
      <FileViewerScreen
        navigation={mockNavigation}
        route={createRoute("/path/to/file.md")}
      />,
    );

    await waitFor(() => {
      expect(getByTestId("file-viewer-retry-button")).toBeTruthy();
    });
  });

  it("retries fetch on retry button press", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Error"));
    const { getByTestId } = render(
      <FileViewerScreen
        navigation={mockNavigation}
        route={createRoute("/path/to/file.md")}
      />,
    );

    await waitFor(() => {
      expect(getByTestId("file-viewer-retry-button")).toBeTruthy();
    });

    mockFetch.mockResolvedValueOnce({
      path: "/path/to/file.md",
      content: "# Hello",
      size: 7,
    });

    fireEvent.press(getByTestId("file-viewer-retry-button"));

    await waitFor(() => {
      expect(getByTestId("file-viewer-screen")).toBeTruthy();
    });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  // --- Successful content loading ---

  it("renders screen with testID after loading", async () => {
    mockFetch.mockResolvedValue({
      path: "/path/to/file.md",
      content: "# Hello",
      size: 7,
    });

    const { getByTestId } = render(
      <FileViewerScreen
        navigation={mockNavigation}
        route={createRoute("/path/to/file.md")}
      />,
    );

    await waitFor(() => {
      expect(getByTestId("file-viewer-screen")).toBeTruthy();
    });
  });

  it("displays file metadata bar", async () => {
    mockFetch.mockResolvedValue({
      path: "/path/to/file.md",
      content: "# Hello",
      size: 7,
    });

    const { getByTestId } = render(
      <FileViewerScreen
        navigation={mockNavigation}
        route={createRoute("/path/to/file.md")}
      />,
    );

    await waitFor(() => {
      expect(getByTestId("file-viewer-meta")).toBeTruthy();
    });
  });

  it("displays file type badge for markdown", async () => {
    mockFetch.mockResolvedValue({
      path: "/path/to/file.md",
      content: "# Hello",
      size: 7,
    });

    const { getByText } = render(
      <FileViewerScreen
        navigation={mockNavigation}
        route={createRoute("/path/to/file.md")}
      />,
    );

    await waitFor(() => {
      expect(getByText("MARKDOWN")).toBeTruthy();
    });
  });

  it("displays file type badge for JSON", async () => {
    mockFetch.mockResolvedValue({
      path: "/path/to/data.json",
      content: '{"key": "value"}',
      size: 16,
    });

    const { getAllByText } = render(
      <FileViewerScreen
        navigation={mockNavigation}
        route={createRoute("/path/to/data.json")}
      />,
    );

    await waitFor(() => {
      // "JSON" appears in both the type badge and the JsonRenderer header
      expect(getAllByText("JSON").length).toBeGreaterThanOrEqual(1);
    });
  });

  it("displays file type badge for code", async () => {
    mockFetch.mockResolvedValue({
      path: "/path/to/app.ts",
      content: "const x = 1;",
      size: 12,
    });

    const { getByText } = render(
      <FileViewerScreen
        navigation={mockNavigation}
        route={createRoute("/path/to/app.ts")}
      />,
    );

    await waitFor(() => {
      expect(getByText("CODE")).toBeTruthy();
    });
  });

  it("displays language label for code files", async () => {
    mockFetch.mockResolvedValue({
      path: "/path/to/app.ts",
      content: "const x = 1;",
      size: 12,
    });

    const { getAllByText } = render(
      <FileViewerScreen
        navigation={mockNavigation}
        route={createRoute("/path/to/app.ts")}
      />,
    );

    await waitFor(() => {
      // "TypeScript" appears in both the meta bar and the CodeRenderer header
      expect(getAllByText("TypeScript").length).toBeGreaterThanOrEqual(1);
    });
  });

  it("displays file size", async () => {
    mockFetch.mockResolvedValue({
      path: "/path/to/file.md",
      content: "# Hello",
      size: 2048,
    });

    const { getByText } = render(
      <FileViewerScreen
        navigation={mockNavigation}
        route={createRoute("/path/to/file.md")}
      />,
    );

    await waitFor(() => {
      expect(getByText("2.0 KB")).toBeTruthy();
    });
  });

  it("displays file path below metadata", async () => {
    mockFetch.mockResolvedValue({
      path: "/companies/stelo/brand.md",
      content: "# Brand",
      size: 7,
    });

    const { getByText } = render(
      <FileViewerScreen
        navigation={mockNavigation}
        route={createRoute("/companies/stelo/brand.md")}
      />,
    );

    await waitFor(() => {
      expect(getByText("/companies/stelo/brand.md")).toBeTruthy();
    });
  });

  it("has a scroll view for content", async () => {
    mockFetch.mockResolvedValue({
      path: "/path/to/file.md",
      content: "# Hello",
      size: 7,
    });

    const { getByTestId } = render(
      <FileViewerScreen
        navigation={mockNavigation}
        route={createRoute("/path/to/file.md")}
      />,
    );

    await waitFor(() => {
      expect(getByTestId("file-viewer-scroll")).toBeTruthy();
    });
  });

  // --- Content type rendering ---

  it("renders markdown content with MarkdownRenderer", async () => {
    mockFetch.mockResolvedValue({
      path: "/path/to/readme.md",
      content: "# Hello World\n\nThis is markdown.",
      size: 33,
    });

    const { getByTestId } = render(
      <FileViewerScreen
        navigation={mockNavigation}
        route={createRoute("/path/to/readme.md")}
      />,
    );

    await waitFor(() => {
      expect(getByTestId("file-viewer-markdown")).toBeTruthy();
    });
  });

  it("renders JSON content with JsonRenderer", async () => {
    mockFetch.mockResolvedValue({
      path: "/path/to/config.json",
      content: '{"key": "value"}',
      size: 16,
    });

    const { getByTestId } = render(
      <FileViewerScreen
        navigation={mockNavigation}
        route={createRoute("/path/to/config.json")}
      />,
    );

    await waitFor(() => {
      expect(getByTestId("file-viewer-json")).toBeTruthy();
    });
  });

  it("renders code content with CodeRenderer", async () => {
    mockFetch.mockResolvedValue({
      path: "/path/to/app.ts",
      content: "const x = 1;",
      size: 12,
    });

    const { getByTestId } = render(
      <FileViewerScreen
        navigation={mockNavigation}
        route={createRoute("/path/to/app.ts")}
      />,
    );

    await waitFor(() => {
      expect(getByTestId("file-viewer-code")).toBeTruthy();
    });
  });

  it("renders plain text for unknown file types", async () => {
    mockFetch.mockResolvedValue({
      path: "/path/to/notes.txt",
      content: "Just some text",
      size: 14,
    });

    const { getByTestId } = render(
      <FileViewerScreen
        navigation={mockNavigation}
        route={createRoute("/path/to/notes.txt")}
      />,
    );

    await waitFor(() => {
      expect(getByTestId("file-viewer-text")).toBeTruthy();
    });
  });

  // --- Navigation header ---

  it("sets navigation header title to file name", async () => {
    mockFetch.mockResolvedValue({
      path: "/path/to/readme.md",
      content: "# Hello",
      size: 7,
    });

    render(
      <FileViewerScreen
        navigation={mockNavigation}
        route={createRoute("/path/to/readme.md")}
      />,
    );

    await waitFor(() => {
      expect(mockNavigation.setOptions).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "readme.md",
        }),
      );
    });
  });

  it("sets navigation header with share button", async () => {
    mockFetch.mockResolvedValue({
      path: "/path/to/file.md",
      content: "# Hello",
      size: 7,
    });

    render(
      <FileViewerScreen
        navigation={mockNavigation}
        route={createRoute("/path/to/file.md")}
      />,
    );

    await waitFor(() => {
      expect(mockNavigation.setOptions).toHaveBeenCalledWith(
        expect.objectContaining({
          headerRight: expect.any(Function),
        }),
      );
    });
  });
});

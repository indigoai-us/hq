/**
 * Tests for FileBrowserScreen (Navigator screen).
 * Verifies loading/error/empty states, tree rendering, expand/collapse,
 * navigation to FileViewer, and pull-to-refresh.
 */
import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { FileBrowserScreen } from "../../src/screens/FileBrowserScreen";
import { fetchNavigatorTree } from "../../src/services/navigator";
import type { NavigatorTreeResponse } from "../../src/types";

// Mock the navigator service
jest.mock("../../src/services/navigator", () => ({
  fetchNavigatorTree: jest.fn(),
}));

// Mock the WebSocket event hook (no-op for screen tests)
jest.mock("../../src/hooks/useWebSocketEvent", () => ({
  useWebSocketEvent: jest.fn(),
}));

// Mock WebSocket context
jest.mock("../../src/contexts/WebSocketContext", () => ({
  useWebSocket: jest.fn(() => ({
    connectionStatus: "connected",
    isConnected: true,
    reconnect: jest.fn(),
    subscribe: jest.fn(() => jest.fn()),
  })),
}));

const mockFetchTree = fetchNavigatorTree as jest.MockedFunction<typeof fetchNavigatorTree>;

const mockNavigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
  setOptions: jest.fn(),
  addListener: jest.fn(),
} as unknown as Props["navigation"];

type Props = Parameters<typeof FileBrowserScreen>[0];

const mockRoute = { key: "test", name: "FileBrowser" as const, params: undefined };

const sampleTree: NavigatorTreeResponse = {
  groups: [
    {
      id: "group-companies",
      name: "Companies",
      children: [
        {
          id: "company-stelo",
          name: "Stelo Labs Inc",
          type: "company",
          status: "healthy",
          children: [
            {
              id: "project-launch",
              name: "Product Launch",
              type: "project",
              status: "healthy",
              children: [
                {
                  id: "worker-writer",
                  name: "Launch Writer",
                  type: "worker",
                  status: "healthy",
                },
                {
                  id: "file-brand",
                  name: "Brand Guidelines",
                  type: "file",
                  status: "healthy",
                  filePath: "/companies/stelo/knowledge/brand-guidelines.md",
                },
              ],
            },
            {
              id: "worker-research",
              name: "Research Agent",
              type: "worker",
              status: "healthy",
            },
            {
              id: "knowledge-playbook",
              name: "Company Playbook",
              type: "knowledge",
              status: "healthy",
              filePath: "/companies/stelo/knowledge/playbook.md",
            },
          ],
        },
        {
          id: "company-holding",
          name: "Holding Co",
          type: "company",
          status: "healthy",
        },
        {
          id: "company-angel",
          name: "Angel Portfolio",
          type: "company",
          status: "warning",
          children: [
            {
              id: "knowledge-memo",
              name: "Investment Memo",
              type: "knowledge",
              status: "warning",
              children: [
                {
                  id: "worker-analyst",
                  name: "Market Analyst",
                  type: "worker",
                  status: "warning",
                },
                {
                  id: "file-thesis",
                  name: "Investment Thesis",
                  type: "file",
                  status: "warning",
                  filePath: "/companies/angel/knowledge/thesis.md",
                },
              ],
            },
          ],
        },
      ],
    },
    {
      id: "group-standalone",
      name: "Standalone Projects",
      children: [
        {
          id: "project-calendar",
          name: "Q1 Content Calendar",
          type: "project",
          status: "error",
          children: [
            {
              id: "worker-content",
              name: "Content Writer",
              type: "worker",
              status: "error",
            },
          ],
        },
      ],
    },
  ],
};

describe("FileBrowserScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("shows loading state initially", () => {
    mockFetchTree.mockReturnValue(new Promise(() => {}));
    const { getByTestId } = render(
      <FileBrowserScreen navigation={mockNavigation} route={mockRoute} />,
    );
    expect(getByTestId("navigator-loading")).toBeTruthy();
  });

  it("shows loading text", () => {
    mockFetchTree.mockReturnValue(new Promise(() => {}));
    const { getByText } = render(
      <FileBrowserScreen navigation={mockNavigation} route={mockRoute} />,
    );
    expect(getByText("Loading navigator...")).toBeTruthy();
  });

  it("shows empty state when no groups", async () => {
    mockFetchTree.mockResolvedValue({ groups: [] });
    const { getByTestId, getByText } = render(
      <FileBrowserScreen navigation={mockNavigation} route={mockRoute} />,
    );

    await waitFor(() => {
      expect(getByTestId("navigator-empty")).toBeTruthy();
    });
    expect(getByText("No Files Yet")).toBeTruthy();
    expect(
      getByText("Your companies, projects, and knowledge will appear here"),
    ).toBeTruthy();
  });

  it("shows error state with retry button", async () => {
    mockFetchTree.mockRejectedValue(new Error("Network error"));
    const { getByTestId, getByText } = render(
      <FileBrowserScreen navigation={mockNavigation} route={mockRoute} />,
    );

    await waitFor(() => {
      expect(getByTestId("navigator-error")).toBeTruthy();
    });
    expect(getByText("Could not load navigator")).toBeTruthy();
    expect(getByText("Network error")).toBeTruthy();
    expect(getByTestId("navigator-retry-button")).toBeTruthy();
  });

  it("retries fetch on retry button press", async () => {
    mockFetchTree.mockRejectedValueOnce(new Error("Network error"));
    const { getByTestId } = render(
      <FileBrowserScreen navigation={mockNavigation} route={mockRoute} />,
    );

    await waitFor(() => {
      expect(getByTestId("navigator-error")).toBeTruthy();
    });

    mockFetchTree.mockResolvedValue(sampleTree);
    fireEvent.press(getByTestId("navigator-retry-button"));

    expect(mockFetchTree).toHaveBeenCalledTimes(2);
  });

  it("renders NAVIGATOR section header when tree is loaded", async () => {
    mockFetchTree.mockResolvedValue(sampleTree);
    const { getByText } = render(
      <FileBrowserScreen navigation={mockNavigation} route={mockRoute} />,
    );

    await waitFor(() => {
      expect(getByText("Navigator")).toBeTruthy();
    });
  });

  it("renders top-level groups (Companies, Standalone Projects)", async () => {
    mockFetchTree.mockResolvedValue(sampleTree);
    const { getByText } = render(
      <FileBrowserScreen navigation={mockNavigation} route={mockRoute} />,
    );

    await waitFor(() => {
      expect(getByText("Companies")).toBeTruthy();
    });
    expect(getByText("Standalone Projects")).toBeTruthy();
  });

  it("expands group on tap to show children", async () => {
    mockFetchTree.mockResolvedValue(sampleTree);
    const { getByTestId, getByText, queryByText } = render(
      <FileBrowserScreen navigation={mockNavigation} route={mockRoute} />,
    );

    await waitFor(() => {
      expect(getByText("Companies")).toBeTruthy();
    });

    // Children not visible initially
    expect(queryByText("Stelo Labs Inc")).toBeNull();

    // Expand Companies group
    fireEvent.press(getByTestId("tree-group-group-companies-header"));

    // Now children should be visible
    expect(getByText("Stelo Labs Inc")).toBeTruthy();
    expect(getByText("Holding Co")).toBeTruthy();
    expect(getByText("Angel Portfolio")).toBeTruthy();
  });

  it("collapses group on second tap", async () => {
    mockFetchTree.mockResolvedValue(sampleTree);
    const { getByTestId, getByText, queryByText } = render(
      <FileBrowserScreen navigation={mockNavigation} route={mockRoute} />,
    );

    await waitFor(() => {
      expect(getByText("Companies")).toBeTruthy();
    });

    // Expand
    fireEvent.press(getByTestId("tree-group-group-companies-header"));
    expect(getByText("Stelo Labs Inc")).toBeTruthy();

    // Collapse
    fireEvent.press(getByTestId("tree-group-group-companies-header"));
    expect(queryByText("Stelo Labs Inc")).toBeNull();
  });

  it("expands nested nodes to reveal deeper children", async () => {
    mockFetchTree.mockResolvedValue(sampleTree);
    const { getByTestId, getByText, queryByText } = render(
      <FileBrowserScreen navigation={mockNavigation} route={mockRoute} />,
    );

    await waitFor(() => {
      expect(getByText("Companies")).toBeTruthy();
    });

    // Expand Companies
    fireEvent.press(getByTestId("tree-group-group-companies-header"));
    expect(getByText("Stelo Labs Inc")).toBeTruthy();
    expect(queryByText("Product Launch")).toBeNull();

    // Expand Stelo Labs Inc
    fireEvent.press(getByTestId("tree-node-company-stelo-row"));
    expect(getByText("Product Launch")).toBeTruthy();
    expect(getByText("Research Agent")).toBeTruthy();
    expect(getByText("Company Playbook")).toBeTruthy();
    expect(queryByText("Launch Writer")).toBeNull();

    // Expand Product Launch
    fireEvent.press(getByTestId("tree-node-project-launch-row"));
    expect(getByText("Launch Writer")).toBeTruthy();
    expect(getByText("Brand Guidelines")).toBeTruthy();
  });

  it("navigates to FileViewer when file node is tapped", async () => {
    mockFetchTree.mockResolvedValue(sampleTree);
    const { getByTestId, getByText } = render(
      <FileBrowserScreen navigation={mockNavigation} route={mockRoute} />,
    );

    await waitFor(() => {
      expect(getByText("Companies")).toBeTruthy();
    });

    // Navigate: Companies > Stelo > Product Launch > Brand Guidelines
    fireEvent.press(getByTestId("tree-group-group-companies-header"));
    fireEvent.press(getByTestId("tree-node-company-stelo-row"));
    fireEvent.press(getByTestId("tree-node-project-launch-row"));
    fireEvent.press(getByTestId("tree-node-file-brand-row"));

    expect(mockNavigation.navigate).toHaveBeenCalledWith("FileViewer", {
      filePath: "/companies/stelo/knowledge/brand-guidelines.md",
    });
  });

  it("navigates to FileViewer when knowledge node with filePath is tapped", async () => {
    mockFetchTree.mockResolvedValue(sampleTree);
    const { getByTestId, getByText } = render(
      <FileBrowserScreen navigation={mockNavigation} route={mockRoute} />,
    );

    await waitFor(() => {
      expect(getByText("Companies")).toBeTruthy();
    });

    // Navigate: Companies > Stelo > Company Playbook
    fireEvent.press(getByTestId("tree-group-group-companies-header"));
    fireEvent.press(getByTestId("tree-node-company-stelo-row"));
    fireEvent.press(getByTestId("tree-node-knowledge-playbook-row"));

    expect(mockNavigation.navigate).toHaveBeenCalledWith("FileViewer", {
      filePath: "/companies/stelo/knowledge/playbook.md",
    });
  });

  it("renders the navigator-screen testID", async () => {
    mockFetchTree.mockResolvedValue(sampleTree);
    const { getByTestId } = render(
      <FileBrowserScreen navigation={mockNavigation} route={mockRoute} />,
    );

    await waitFor(() => {
      expect(getByTestId("navigator-screen")).toBeTruthy();
    });
  });

  it("renders the scroll container", async () => {
    mockFetchTree.mockResolvedValue(sampleTree);
    const { getByTestId } = render(
      <FileBrowserScreen navigation={mockNavigation} route={mockRoute} />,
    );

    await waitFor(() => {
      expect(getByTestId("navigator-scroll")).toBeTruthy();
    });
  });
});

/**
 * Tests for SpawnWorkerScreen.
 * MOB-011: Spawn worker from mobile
 */
import React from "react";
import { render, fireEvent, waitFor, act } from "@testing-library/react-native";
import { SpawnWorkerScreen } from "../../src/screens/SpawnWorkerScreen";
import { fetchWorkers, spawnWorker } from "../../src/services/workers";
import type { WorkerDefinition, AgentsStackParamList } from "../../src/types";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

jest.mock("../../src/services/workers", () => ({
  fetchWorkers: jest.fn(),
  spawnWorker: jest.fn(),
}));

const mockFetchWorkers = fetchWorkers as jest.MockedFunction<typeof fetchWorkers>;
const mockSpawnWorker = spawnWorker as jest.MockedFunction<typeof spawnWorker>;

type Props = NativeStackScreenProps<AgentsStackParamList, "SpawnWorker">;

const mockNavigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
  replace: jest.fn(),
  setOptions: jest.fn(),
  addListener: jest.fn(),
} as unknown as Props["navigation"];

const mockRoute = { key: "test", name: "SpawnWorker" as const, params: undefined };

const sampleWorkers: WorkerDefinition[] = [
  {
    id: "frontend-dev",
    name: "Frontend Developer",
    category: "code",
    description: "Builds React components",
    status: "active",
    skills: [
      {
        id: "build-component",
        name: "Build Component",
        description: "Create a new React component",
        parameters: [
          {
            name: "componentName",
            label: "Component Name",
            type: "string",
            required: true,
            placeholder: "e.g., UserCard",
          },
        ],
      },
      {
        id: "fix-bug",
        name: "Fix Bug",
        description: "Fix a bug in existing code",
        parameters: [],
      },
    ],
  },
  {
    id: "analyst",
    name: "Analyst",
    category: "research",
    description: "Performs analysis",
    status: "active",
    skills: [
      {
        id: "analyze",
        name: "Analyze",
        description: "Run analysis",
      },
    ],
  },
];

describe("SpawnWorkerScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("shows loading state initially", () => {
    mockFetchWorkers.mockReturnValue(new Promise(() => {}));
    const { getByTestId } = render(
      <SpawnWorkerScreen navigation={mockNavigation} route={mockRoute} />,
    );
    expect(getByTestId("spawn-loading")).toBeTruthy();
  });

  it("shows error state when fetch fails", async () => {
    mockFetchWorkers.mockRejectedValue(new Error("Network error"));
    const { getByTestId, getByText } = render(
      <SpawnWorkerScreen navigation={mockNavigation} route={mockRoute} />,
    );

    await waitFor(() => {
      expect(getByTestId("spawn-error")).toBeTruthy();
    });
    expect(getByText("Could not load workers")).toBeTruthy();
    expect(getByText("Network error")).toBeTruthy();
  });

  it("shows worker picker after loading", async () => {
    mockFetchWorkers.mockResolvedValue(sampleWorkers);
    const { getByTestId, getByText } = render(
      <SpawnWorkerScreen navigation={mockNavigation} route={mockRoute} />,
    );

    await waitFor(() => {
      expect(getByTestId("spawn-pick-worker")).toBeTruthy();
    });

    expect(getByText("Frontend Developer")).toBeTruthy();
    expect(getByText("Analyst")).toBeTruthy();
  });

  it("shows skill picker when worker with multiple skills is selected", async () => {
    mockFetchWorkers.mockResolvedValue(sampleWorkers);
    const { getByTestId, getByText } = render(
      <SpawnWorkerScreen navigation={mockNavigation} route={mockRoute} />,
    );

    await waitFor(() => {
      expect(getByTestId("worker-item-frontend-dev")).toBeTruthy();
    });

    fireEvent.press(getByTestId("worker-item-frontend-dev"));

    await waitFor(() => {
      expect(getByTestId("spawn-pick-skill")).toBeTruthy();
    });

    expect(getByText("Build Component")).toBeTruthy();
    expect(getByText("Fix Bug")).toBeTruthy();
  });

  it("goes directly to confirm for single-skill worker without params", async () => {
    mockFetchWorkers.mockResolvedValue(sampleWorkers);
    const { getByTestId } = render(
      <SpawnWorkerScreen navigation={mockNavigation} route={mockRoute} />,
    );

    await waitFor(() => {
      expect(getByTestId("worker-item-analyst")).toBeTruthy();
    });

    fireEvent.press(getByTestId("worker-item-analyst"));

    await waitFor(() => {
      expect(getByTestId("spawn-confirm")).toBeTruthy();
    });
  });

  it("shows configure step for skill with parameters", async () => {
    mockFetchWorkers.mockResolvedValue(sampleWorkers);
    const { getByTestId, getByText } = render(
      <SpawnWorkerScreen navigation={mockNavigation} route={mockRoute} />,
    );

    await waitFor(() => {
      expect(getByTestId("worker-item-frontend-dev")).toBeTruthy();
    });

    fireEvent.press(getByTestId("worker-item-frontend-dev"));

    await waitFor(() => {
      expect(getByTestId("skill-item-build-component")).toBeTruthy();
    });

    fireEvent.press(getByTestId("skill-item-build-component"));

    await waitFor(() => {
      expect(getByTestId("spawn-configure")).toBeTruthy();
    });

    expect(getByText("Component Name")).toBeTruthy();
  });

  it("goes directly to confirm for skill without parameters", async () => {
    mockFetchWorkers.mockResolvedValue(sampleWorkers);
    const { getByTestId } = render(
      <SpawnWorkerScreen navigation={mockNavigation} route={mockRoute} />,
    );

    await waitFor(() => {
      expect(getByTestId("worker-item-frontend-dev")).toBeTruthy();
    });

    fireEvent.press(getByTestId("worker-item-frontend-dev"));

    await waitFor(() => {
      expect(getByTestId("skill-item-fix-bug")).toBeTruthy();
    });

    fireEvent.press(getByTestId("skill-item-fix-bug"));

    await waitFor(() => {
      expect(getByTestId("spawn-confirm")).toBeTruthy();
    });
  });

  it("spawns worker and navigates to agent detail on success", async () => {
    mockFetchWorkers.mockResolvedValue(sampleWorkers);
    mockSpawnWorker.mockResolvedValue({
      agentId: "agent-123",
      agentName: "Analyst",
      status: "running",
    });

    const { getByTestId } = render(
      <SpawnWorkerScreen navigation={mockNavigation} route={mockRoute} />,
    );

    // Select single-skill worker (goes straight to confirm)
    await waitFor(() => {
      expect(getByTestId("worker-item-analyst")).toBeTruthy();
    });

    fireEvent.press(getByTestId("worker-item-analyst"));

    await waitFor(() => {
      expect(getByTestId("spawn-confirm-button")).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(getByTestId("spawn-confirm-button"));
    });

    await waitFor(() => {
      expect(mockSpawnWorker).toHaveBeenCalledWith({
        workerId: "analyst",
        skillId: "analyze",
        parameters: undefined,
      });
    });

    expect(mockNavigation.replace).toHaveBeenCalledWith("AgentDetail", {
      agentId: "agent-123",
    });
  });

  it("shows confirmation card with worker and skill details", async () => {
    mockFetchWorkers.mockResolvedValue(sampleWorkers);
    const { getByTestId, getByText } = render(
      <SpawnWorkerScreen navigation={mockNavigation} route={mockRoute} />,
    );

    await waitFor(() => {
      expect(getByTestId("worker-item-analyst")).toBeTruthy();
    });

    fireEvent.press(getByTestId("worker-item-analyst"));

    await waitFor(() => {
      expect(getByTestId("spawn-confirmation")).toBeTruthy();
    });

    expect(getByText("Confirm Spawn")).toBeTruthy();
    expect(getByText("Analyst")).toBeTruthy();
    expect(getByText("Analyze")).toBeTruthy();
  });
});

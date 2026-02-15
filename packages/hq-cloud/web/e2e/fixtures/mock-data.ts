import type { Agent, AgentMessage } from "../../src/types/agent";
import type { WorkerDefinition } from "../../src/types/worker";
import type { NavigatorTreeResponse } from "../../src/types/navigator";

let _idCounter = 0;
function uid(prefix = "id") {
  return `${prefix}-${++_idCounter}`;
}

export function makeAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: uid("agent"),
    name: "Test Agent",
    type: "code",
    status: "running",
    progress: { completed: 3, total: 10 },
    lastActivity: new Date().toISOString(),
    ...overrides,
  };
}

export function makeAgentMessage(
  overrides: Partial<AgentMessage> = {},
): AgentMessage {
  return {
    id: uid("msg"),
    role: "agent",
    content: "Hello from the agent",
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

export function makeWorker(
  overrides: Partial<WorkerDefinition> = {},
): WorkerDefinition {
  return {
    id: uid("worker"),
    name: "Code Worker",
    category: "code",
    description: "A code worker for testing",
    status: "active",
    skills: [
      {
        id: "skill-implement",
        name: "Implement Feature",
        description: "Implement a new feature",
        parameters: [
          {
            name: "description",
            label: "Description",
            type: "string",
            required: true,
            placeholder: "Describe the feature...",
          },
          {
            name: "priority",
            label: "Priority",
            type: "select",
            options: ["low", "medium", "high"],
            defaultValue: "medium",
          },
        ],
      },
      {
        id: "skill-fix",
        name: "Fix Bug",
        description: "Fix a bug in the codebase",
      },
    ],
    ...overrides,
  };
}

export function makeNavigatorTree(): NavigatorTreeResponse {
  return {
    groups: [
      {
        id: "grp-companies",
        name: "Companies",
        children: [
          {
            id: "node-acme",
            name: "Acme Corp",
            type: "company",
            status: "healthy",
            children: [
              {
                id: "node-acme-readme",
                name: "README.md",
                type: "file",
                status: "idle",
                filePath: "companies/acme/README.md",
              },
            ],
          },
        ],
      },
      {
        id: "grp-projects",
        name: "Projects",
        children: [
          {
            id: "node-proj1",
            name: "hq-cloud",
            type: "project",
            status: "warning",
            children: [
              {
                id: "node-prd",
                name: "prd.json",
                type: "file",
                status: "idle",
                filePath: "projects/hq-cloud/prd.json",
              },
            ],
          },
        ],
      },
      {
        id: "grp-workers",
        name: "Workers",
        children: [
          {
            id: "node-worker-dev",
            name: "dev-frontend",
            type: "worker",
            status: "healthy",
          },
        ],
      },
    ],
  };
}

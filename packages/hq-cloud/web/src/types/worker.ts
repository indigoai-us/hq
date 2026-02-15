export type WorkerCategory = "code" | "content" | "social" | "research" | "ops";

export interface WorkerSkill {
  id: string;
  name: string;
  description: string;
  parameters?: WorkerSkillParameter[];
}

export interface WorkerSkillParameter {
  name: string;
  label: string;
  type: "string" | "number" | "boolean" | "select";
  required?: boolean;
  defaultValue?: string;
  placeholder?: string;
  options?: string[];
}

export interface WorkerDefinition {
  id: string;
  name: string;
  category: WorkerCategory;
  description: string;
  status: "active" | "inactive" | "deprecated";
  skills: WorkerSkill[];
}

export interface SpawnWorkerRequest {
  workerId: string;
  skillId: string;
  parameters?: Record<string, string>;
}

export interface SpawnWorkerResponse {
  agentId: string;
  agentName: string;
  status: string;
}

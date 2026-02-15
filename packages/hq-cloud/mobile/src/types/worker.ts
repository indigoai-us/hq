/**
 * Worker registry types for spawning workers from mobile.
 * MOB-011: Spawn worker from mobile
 */

export type WorkerCategory = "code" | "content" | "social" | "research" | "ops";

export interface WorkerSkill {
  /** Unique skill identifier */
  id: string;
  /** Human-readable skill name */
  name: string;
  /** Brief description of what the skill does */
  description: string;
  /** Parameter definitions for this skill */
  parameters?: WorkerSkillParameter[];
}

export interface WorkerSkillParameter {
  /** Parameter name/key */
  name: string;
  /** Human-readable label */
  label: string;
  /** Parameter type for input rendering */
  type: "string" | "number" | "boolean" | "select";
  /** Whether this parameter is required */
  required?: boolean;
  /** Default value */
  defaultValue?: string;
  /** Placeholder text for the input */
  placeholder?: string;
  /** Available options for select type */
  options?: string[];
}

export interface WorkerDefinition {
  /** Unique worker identifier */
  id: string;
  /** Human-readable worker name */
  name: string;
  /** Worker category */
  category: WorkerCategory;
  /** Brief description of the worker's purpose */
  description: string;
  /** Worker status in registry */
  status: "active" | "inactive" | "deprecated";
  /** Available skills */
  skills: WorkerSkill[];
}

export interface SpawnWorkerRequest {
  /** Worker ID to spawn */
  workerId: string;
  /** Skill ID to execute */
  skillId: string;
  /** Optional parameters for the skill */
  parameters?: Record<string, string>;
}

export interface SpawnWorkerResponse {
  /** ID of the newly created agent */
  agentId: string;
  /** Name of the spawned agent */
  agentName: string;
  /** Current status */
  status: string;
}

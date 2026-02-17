export type ProjectStatus = "READY" | "IN_PROGRESS" | "COMPLETED";

export interface ProjectSummary {
  slug: string;
  name: string;
  description: string;
  status: ProjectStatus;
  storiesTotal: number;
  storiesComplete: number;
  completionPercent: number;
}

export interface DashboardConfig {
  priorities: string[];
}

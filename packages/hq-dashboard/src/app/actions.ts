"use server";

import fs from "fs/promises";
import path from "path";
import { revalidatePath } from "next/cache";
import type {
  ProjectSummary,
  ProjectStatus,
  DashboardConfig,
} from "@/types/project";

const HQ_ROOT = process.env.HQ_ROOT || "C:\\hq";

function statePath(): string {
  return path.join(HQ_ROOT, "workspace", "orchestrator", "state.json");
}

function configPath(): string {
  return path.join(HQ_ROOT, "projects", "dashboard-config.json");
}

interface OrchestratorProject {
  name: string;
  state: string;
  prdPath: string;
  storiesComplete: number;
  storiesTotal: number;
}

interface OrchestratorState {
  projects: OrchestratorProject[];
}

interface PrdFile {
  name: string;
  description: string;
  userStories?: { id: string; passes?: boolean }[];
}

async function readJson<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function readPrdDescription(prdRelPath: string): Promise<string> {
  const prd = await readJson<PrdFile>(path.join(HQ_ROOT, prdRelPath));
  return prd?.description ?? "";
}

function normaliseStatus(raw: string): ProjectStatus {
  const upper = raw.toUpperCase();
  if (upper === "COMPLETED") return "COMPLETED";
  if (upper === "IN_PROGRESS") return "IN_PROGRESS";
  return "READY";
}

async function readConfig(): Promise<DashboardConfig | null> {
  return readJson<DashboardConfig>(configPath());
}

async function writeConfig(config: DashboardConfig): Promise<void> {
  await fs.writeFile(configPath(), JSON.stringify(config, null, 2), "utf-8");
}

function defaultSortKey(status: ProjectStatus): number {
  if (status === "IN_PROGRESS") return 0;
  if (status === "READY") return 1;
  return 2;
}

export async function getProjects(): Promise<ProjectSummary[]> {
  const state = await readJson<OrchestratorState>(statePath());
  const stateProjects = state?.projects ?? [];

  const slugMap = new Map<
    string,
    {
      name: string;
      status: ProjectStatus;
      storiesTotal: number;
      storiesComplete: number;
      prdPath: string;
    }
  >();

  for (const p of stateProjects) {
    slugMap.set(p.name, {
      name: p.name,
      status: normaliseStatus(p.state),
      storiesTotal: p.storiesTotal,
      storiesComplete: p.storiesComplete,
      prdPath: p.prdPath,
    });
  }

  const projectsDir = path.join(HQ_ROOT, "projects");
  let dirEntries: string[] = [];
  try {
    const entries = await fs.readdir(projectsDir, { withFileTypes: true });
    dirEntries = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    // projects/ dir missing is fine
  }

  for (const slug of dirEntries) {
    if (slugMap.has(slug)) continue;
    const prdRelPath = `projects/${slug}/prd.json`;
    const prd = await readJson<PrdFile>(path.join(HQ_ROOT, prdRelPath));
    if (!prd) continue;

    const stories = prd.userStories ?? [];
    const total = stories.length;
    const complete = stories.filter((s) => s.passes === true).length;
    const status: ProjectStatus =
      complete >= total && total > 0
        ? "COMPLETED"
        : complete > 0
          ? "IN_PROGRESS"
          : "READY";

    slugMap.set(slug, {
      name: prd.name || slug,
      status,
      storiesTotal: total,
      storiesComplete: complete,
      prdPath: prdRelPath,
    });
  }

  const summaries: ProjectSummary[] = [];
  for (const [slug, data] of slugMap) {
    const description = await readPrdDescription(data.prdPath);
    const pct =
      data.storiesTotal > 0
        ? Math.round((data.storiesComplete / data.storiesTotal) * 100)
        : 0;

    summaries.push({
      slug,
      name: data.name,
      description,
      status: data.status,
      storiesTotal: data.storiesTotal,
      storiesComplete: data.storiesComplete,
      completionPercent: pct,
    });
  }

  let config = await readConfig();
  const allSlugs = summaries.map((p) => p.slug);

  if (!config) {
    const sorted = [...summaries].sort(
      (a, b) => defaultSortKey(a.status) - defaultSortKey(b.status),
    );
    config = { priorities: sorted.map((p) => p.slug) };
    await writeConfig(config);
  } else {
    const existing = new Set(config.priorities);
    const newSlugs = allSlugs.filter((s) => !existing.has(s));
    if (newSlugs.length > 0) {
      config.priorities = [...config.priorities, ...newSlugs];
      await writeConfig(config);
    }
  }

  const priorityIndex = new Map(
    config.priorities.map((slug, i) => [slug, i]),
  );
  summaries.sort((a, b) => {
    const ai = priorityIndex.get(a.slug) ?? 9999;
    const bi = priorityIndex.get(b.slug) ?? 9999;
    return ai - bi;
  });

  return summaries;
}

export async function savePriorities(slugs: string[]): Promise<void> {
  const projectsDir = path.join(HQ_ROOT, "projects");
  let knownSlugs: Set<string>;
  try {
    const entries = await fs.readdir(projectsDir, { withFileTypes: true });
    knownSlugs = new Set(
      entries.filter((e) => e.isDirectory()).map((e) => e.name),
    );
  } catch {
    knownSlugs = new Set();
  }

  const existingConfig = await readConfig();
  if (existingConfig) {
    for (const s of existingConfig.priorities) {
      knownSlugs.add(s);
    }
  }

  const seen = new Set<string>();
  const validated: string[] = [];
  for (const slug of slugs) {
    if (knownSlugs.has(slug) && !seen.has(slug)) {
      validated.push(slug);
      seen.add(slug);
    }
  }

  for (const slug of knownSlugs) {
    if (!seen.has(slug)) {
      validated.push(slug);
      seen.add(slug);
    }
  }

  await writeConfig({ priorities: validated });
  revalidatePath("/");
}

/**
 * Delete a project: removes prd.json directory, orchestrator state entry,
 * and dashboard-config.json entry.
 */
export async function deleteProject(slug: string): Promise<void> {
  // 1. Remove the project directory
  const projectDir = path.join(HQ_ROOT, "projects", slug);
  try {
    await fs.rm(projectDir, { recursive: true, force: true });
  } catch {
    // directory might not exist
  }

  // 2. Remove from orchestrator state.json
  const state = await readJson<OrchestratorState>(statePath());
  if (state) {
    state.projects = state.projects.filter((p) => p.name !== slug);
    await fs.writeFile(statePath(), JSON.stringify(state, null, 2), "utf-8");
  }

  // 3. Remove from dashboard-config.json
  const config = await readConfig();
  if (config) {
    config.priorities = config.priorities.filter((s) => s !== slug);
    await writeConfig(config);
  }

  // 4. Remove orchestrator workspace if it exists
  const orchDir = path.join(HQ_ROOT, "workspace", "orchestrator", slug);
  try {
    await fs.rm(orchDir, { recursive: true, force: true });
  } catch {
    // might not exist
  }

  revalidatePath("/");
}

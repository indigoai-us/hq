"use client";

import { useRouter } from "next/navigation";
import type { ProjectSummary, ProjectStatus } from "@/types/project";

export type FilterValue = "all" | "incomplete" | "finished";

export function parseFilter(raw: string | null): FilterValue {
  if (raw === "incomplete" || raw === "finished") return raw;
  return "all";
}

export function applyFilter(
  projects: ProjectSummary[],
  filter: FilterValue,
): ProjectSummary[] {
  if (filter === "incomplete")
    return projects.filter((p) => p.status !== "COMPLETED");
  if (filter === "finished")
    return projects.filter((p) => p.status === "COMPLETED");
  return projects;
}

function countForFilter(projects: ProjectSummary[], filter: FilterValue): number {
  return applyFilter(projects, filter).length;
}

interface ProjectFilterBarProps {
  projects: ProjectSummary[];
  activeFilter: FilterValue;
}

const filters: { value: FilterValue; label: string }[] = [
  { value: "all", label: "All" },
  { value: "incomplete", label: "Incomplete" },
  { value: "finished", label: "Finished" },
];

export function ProjectFilterBar({ projects, activeFilter }: ProjectFilterBarProps) {
  const router = useRouter();

  function setFilter(f: FilterValue) {
    const params = new URLSearchParams(window.location.search);
    if (f === "all") {
      params.delete("filter");
    } else {
      params.set("filter", f);
    }
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : "/", { scroll: false });
  }

  return (
    <div className="flex gap-2 mb-4">
      {filters.map((f) => {
        const active = activeFilter === f.value;
        const count = countForFilter(projects, f.value);
        return (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`
              px-3 py-1.5 rounded-full text-xs font-medium transition-colors flex items-center gap-1.5
              ${active
                ? "bg-accent-blue text-text-inverse shadow-sm"
                : "bg-bg-tertiary text-text-secondary hover:text-text-primary hover:bg-bg-elevated"
              }
            `}
          >
            {f.label}
            <span className={`tabular-nums ${active ? "text-text-inverse/70" : "text-text-tertiary"}`}>
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

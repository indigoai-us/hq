"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type DragEvent,
} from "react";
import { useSearchParams } from "next/navigation";
import type { ProjectSummary } from "@/types/project";
import { ProjectCard } from "./ProjectCard";
import { ProjectFilterBar, parseFilter, applyFilter } from "./ProjectFilterBar";
import { savePriorities, deleteProject } from "@/app/actions";

interface DragDropProjectListProps {
  projects: ProjectSummary[];
}

export function DragDropProjectList({ projects }: DragDropProjectListProps) {
  const [localProjects, setLocalProjects] = useState(projects);

  // Sync from server when props change (e.g. after revalidation)
  useEffect(() => {
    setLocalProjects(projects);
  }, [projects]);

  const searchParams = useSearchParams();
  const activeFilter = parseFilter(searchParams.get("filter"));

  const visibleProjects = useMemo(
    () => applyFilter(localProjects, activeFilter),
    [localProjects, activeFilter],
  );

  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [kbSelectedIndex, setKbSelectedIndex] = useState<number | null>(null);
  const [kbMovingIndex, setKbMovingIndex] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const reorder = useCallback(
    (fromVisibleIdx: number, toVisibleIdx: number) => {
      if (fromVisibleIdx === toVisibleIdx) return;

      const newVisible = [...visibleProjects];
      const [moved] = newVisible.splice(fromVisibleIdx, 1);
      newVisible.splice(toVisibleIdx, 0, moved);

      const visibleSlugs = new Set(visibleProjects.map((p) => p.slug));
      let visibleCursor = 0;
      const newFull = localProjects.map((p) => {
        if (visibleSlugs.has(p.slug)) {
          return newVisible[visibleCursor++];
        }
        return p;
      });

      // Update local state immediately
      setLocalProjects(newFull);
      // Persist to disk (fire and forget)
      savePriorities(newFull.map((p) => p.slug));
    },
    [visibleProjects, localProjects],
  );

  const handleDelete = useCallback(
    async (slug: string) => {
      // Optimistically remove from local state
      setLocalProjects((prev) => prev.filter((p) => p.slug !== slug));
      setConfirmDelete(null);
      // Persist deletion
      await deleteProject(slug);
    },
    [],
  );

  // ---- HTML5 Drag & Drop handlers ----

  const handleDragStart = useCallback(
    (e: DragEvent<HTMLDivElement>, idx: number) => {
      setDragIndex(idx);
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", String(idx));
    },
    [],
  );

  const handleDragOver = useCallback(
    (e: DragEvent<HTMLDivElement>, idx: number) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setOverIndex(idx);
    },
    [],
  );

  const handleDragLeave = useCallback(() => {
    setOverIndex(null);
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>, toIdx: number) => {
      e.preventDefault();
      if (dragIndex != null && dragIndex !== toIdx) {
        reorder(dragIndex, toIdx);
      }
      setDragIndex(null);
      setOverIndex(null);
    },
    [dragIndex, reorder],
  );

  const handleDragEnd = useCallback(() => {
    setDragIndex(null);
    setOverIndex(null);
  }, []);

  // ---- Keyboard handlers ----

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>, idx: number) => {
      const len = visibleProjects.length;

      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (kbMovingIndex != null) {
          if (kbMovingIndex !== idx) reorder(kbMovingIndex, idx);
          setKbMovingIndex(null);
          setKbSelectedIndex(idx);
        } else {
          if (kbSelectedIndex === idx && kbMovingIndex === null) {
            setKbMovingIndex(idx);
          } else {
            setKbSelectedIndex(idx);
          }
        }
        return;
      }

      if (e.key === "Escape") {
        e.preventDefault();
        setKbMovingIndex(null);
        return;
      }

      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const direction = e.key === "ArrowDown" ? 1 : -1;
        const nextIdx = idx + direction;
        if (nextIdx < 0 || nextIdx >= len) return;

        if (kbMovingIndex != null) {
          reorder(idx, nextIdx);
          setKbMovingIndex(nextIdx);
          setKbSelectedIndex(nextIdx);
          requestAnimationFrame(() => {
            const items = listRef.current?.querySelectorAll<HTMLDivElement>("[data-project-item]");
            items?.[nextIdx]?.focus();
          });
        } else {
          setKbSelectedIndex(nextIdx);
          requestAnimationFrame(() => {
            const items = listRef.current?.querySelectorAll<HTMLDivElement>("[data-project-item]");
            items?.[nextIdx]?.focus();
          });
        }
      }
    },
    [visibleProjects.length, kbMovingIndex, kbSelectedIndex, reorder],
  );

  const globalPriorityMap = useMemo(() => {
    const map = new Map<string, number>();
    localProjects.forEach((p, i) => map.set(p.slug, i + 1));
    return map;
  }, [localProjects]);

  return (
    <>
      <ProjectFilterBar projects={localProjects} activeFilter={activeFilter} />

      <div ref={listRef} className="space-y-2" role="listbox" aria-label="Projects ordered by priority">
        {visibleProjects.map((project, idx) => {
          const isDragging = dragIndex === idx;
          const isOver = overIndex === idx && dragIndex !== idx;
          const isKbMoving = kbMovingIndex === idx;
          const isKbSelected = kbSelectedIndex === idx;
          const globalPriority = globalPriorityMap.get(project.slug) ?? idx + 1;

          return (
            <div
              key={project.slug}
              data-project-item
              role="option"
              aria-selected={isKbSelected || isKbMoving}
              aria-label={`Priority ${globalPriority}: ${project.name}`}
              tabIndex={0}
              draggable
              onDragStart={(e) => handleDragStart(e, idx)}
              onDragOver={(e) => handleDragOver(e, idx)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, idx)}
              onDragEnd={handleDragEnd}
              onKeyDown={(e) => handleKeyDown(e, idx)}
              className={`
                transition-all duration-200 rounded-lg outline-none
                ${isDragging ? "opacity-40 scale-95" : "opacity-100"}
                ${isOver ? "ring-2 ring-accent-blue ring-offset-2 ring-offset-bg-primary" : ""}
                ${isKbMoving ? "ring-2 ring-accent-yellow ring-offset-2 ring-offset-bg-primary scale-[1.02] shadow-lg" : ""}
                ${isKbSelected && !isKbMoving ? "ring-1 ring-border-active" : ""}
                focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary
                cursor-grab active:cursor-grabbing
              `}
            >
              {isOver && dragIndex != null && dragIndex > idx && (
                <div className="h-0.5 bg-accent-blue rounded-full mb-1 animate-pulse" />
              )}

              <ProjectCard
                project={project}
                priority={globalPriority}
                onDeleteRequest={() => setConfirmDelete(project.slug)}
              />

              {isOver && dragIndex != null && dragIndex < idx && (
                <div className="h-0.5 bg-accent-blue rounded-full mt-1 animate-pulse" />
              )}
            </div>
          );
        })}

        {visibleProjects.length === 0 && (
          <div className="text-center py-12 text-text-tertiary text-sm">
            No projects match this filter.
          </div>
        )}
      </div>

      {/* Delete confirmation dialog */}
      {confirmDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setConfirmDelete(null)}
        >
          <div
            className="bg-bg-secondary border border-border-subtle rounded-xl p-6 max-w-sm w-full mx-4 shadow-2xl animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-text-primary mb-2">
              Delete project?
            </h3>
            <p className="text-xs text-text-secondary mb-1">
              This will permanently delete <span className="font-medium text-text-primary">{confirmDelete}</span> including:
            </p>
            <ul className="text-xs text-text-tertiary mb-4 list-disc list-inside space-y-0.5">
              <li>Project PRD and README</li>
              <li>Orchestrator state entry</li>
              <li>Orchestrator workspace data</li>
            </ul>
            <p className="text-[10px] text-accent-red/80 mb-4">
              This does not delete any code in repos/. Only HQ project metadata.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmDelete(null)}
                className="px-3 py-1.5 text-xs rounded-md bg-bg-tertiary text-text-secondary hover:text-text-primary transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(confirmDelete)}
                className="px-3 py-1.5 text-xs rounded-md bg-accent-red text-white hover:bg-accent-red/80 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

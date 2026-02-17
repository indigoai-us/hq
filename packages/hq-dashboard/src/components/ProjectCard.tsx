import type { ProjectSummary } from "@/types/project";
import { TrainTrack } from "./TrainTrack";
import { ClaudeLaunchButton } from "./ClaudeLaunchButton";

interface ProjectCardProps {
  project: ProjectSummary;
  priority: number;
  onDeleteRequest?: () => void;
}

function statusBadge(status: string) {
  if (status === "COMPLETED")
    return "bg-accent-green/15 text-accent-green";
  if (status === "IN_PROGRESS")
    return "bg-accent-blue/15 text-accent-blue";
  return "bg-accent-yellow/15 text-accent-yellow";
}

function statusLabel(status: string) {
  if (status === "COMPLETED") return "Done";
  if (status === "IN_PROGRESS") return "In Progress";
  return "Ready";
}

export function ProjectCard({ project, priority, onDeleteRequest }: ProjectCardProps) {
  return (
    <div className="bg-bg-card border border-border-subtle rounded-lg p-4 hover:border-border-active transition-colors">
      {/* Header row */}
      <div className="flex items-start gap-3">
        {/* Priority badge */}
        <span className="flex-shrink-0 w-7 h-7 rounded-full bg-bg-elevated flex items-center justify-center text-xs font-bold text-text-secondary tabular-nums">
          {priority}
        </span>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-sm font-medium text-text-primary truncate">
              {project.name}
            </h3>
            <span className={`flex-shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full ${statusBadge(project.status)}`}>
              {statusLabel(project.status)}
            </span>
          </div>
          {project.description && (
            <p className="text-xs text-text-tertiary line-clamp-1 mb-2">
              {project.description}
            </p>
          )}
        </div>

        <div className="flex items-center gap-0.5">
          <ClaudeLaunchButton slug={project.slug} name={project.name} />

          {/* Delete button */}
          {onDeleteRequest && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDeleteRequest();
              }}
              title="Delete project"
              className="p-1.5 rounded-md text-text-tertiary hover:text-accent-red hover:bg-accent-red/10 transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M3 4h10M6 4V3a1 1 0 011-1h2a1 1 0 011 1v1M5 4v8a1 1 0 001 1h4a1 1 0 001-1V4" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Train track */}
      <TrainTrack
        completionPercent={project.completionPercent}
        status={project.status}
        storiesComplete={project.storiesComplete}
        storiesTotal={project.storiesTotal}
      />
    </div>
  );
}

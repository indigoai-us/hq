import { Suspense } from "react";
import { getProjects } from "./actions";
import { DragDropProjectList } from "@/components/DragDropProjectList";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const projects = await getProjects();

  return (
    <div className="min-h-dvh bg-bg-primary">
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-lg font-bold text-text-primary">HQ Projects</h1>
            <p className="text-xs text-text-tertiary mt-0.5">
              Drag to reorder priority. Click terminal icon to launch Claude.
            </p>
          </div>
          <span className="text-xs text-text-tertiary tabular-nums">
            {projects.length} projects
          </span>
        </div>

        {projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3">
            <div className="w-16 h-16 rounded-full bg-bg-tertiary flex items-center justify-center">
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                className="text-text-tertiary"
              >
                <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
            </div>
            <span className="text-text-secondary text-sm">No projects found</span>
            <span className="text-text-tertiary text-xs max-w-64 text-center">
              Add project PRDs to your HQ projects/ directory to see them here.
            </span>
          </div>
        ) : (
          <Suspense
            fallback={
              <div className="text-text-tertiary text-sm py-4">
                Loading projects...
              </div>
            }
          >
            <DragDropProjectList projects={projects} />
          </Suspense>
        )}
      </div>
    </div>
  );
}

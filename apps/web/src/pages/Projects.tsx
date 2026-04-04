import { useEffect, useState } from "react";
import { useAuth } from "../lib/auth";
import { listFiles, getFile } from "../lib/api";

interface Story {
  id: string;
  title: string;
  passes?: boolean;
  priority?: number;
}

interface Project {
  name: string;
  description?: string;
  goal?: string;
  stories: Story[];
  passed: number;
  total: number;
}

function parseProject(json: string): Project | null {
  try {
    const data = JSON.parse(json);
    const stories: Story[] = (data.userStories || []).map(
      (s: { id: string; title: string; passes?: boolean; priority?: number }) => ({
        id: s.id,
        title: s.title,
        passes: s.passes === true,
        priority: s.priority,
      })
    );
    return {
      name: data.name || "Unnamed",
      description: data.description,
      goal: data.metadata?.goal,
      stories,
      passed: stories.filter((s) => s.passes).length,
      total: stories.length,
    };
  } catch {
    return null;
  }
}

function StatusBadge({ passed, total }: { passed: number; total: number }) {
  if (total === 0) return null;
  if (passed === 0)
    return (
      <span className="rounded-full bg-neutral-800 px-2 py-0.5 text-xs text-neutral-400">
        Not Started
      </span>
    );
  if (passed === total)
    return (
      <span className="rounded-full bg-emerald-900/50 px-2 py-0.5 text-xs text-emerald-400">
        Complete
      </span>
    );
  return (
    <span className="rounded-full bg-blue-900/50 px-2 py-0.5 text-xs text-blue-400">
      In Progress
    </span>
  );
}

export function Projects() {
  const { getToken } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const token = await getToken();
      if (!token) return;
      try {
        // List all files, filter for prd.json
        const result = await listFiles(token);
        const prdFiles = result.files.filter((f) => f.path.endsWith("/prd.json"));

        const loaded: Project[] = [];
        for (const file of prdFiles) {
          try {
            const content = await getFile(token, file.path);
            const project = parseProject(content);
            if (project) loaded.push(project);
          } catch {
            // Skip unreadable files
          }
        }

        // Sort: in-progress first, then not started, then complete
        loaded.sort((a, b) => {
          const aStatus = a.passed === a.total ? 2 : a.passed === 0 ? 1 : 0;
          const bStatus = b.passed === b.total ? 2 : b.passed === 0 ? 1 : 0;
          return aStatus - bStatus;
        });

        setProjects(loaded);
      } catch (err) {
        console.error("Failed to load projects:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [getToken]);

  if (loading) {
    return <div className="p-6 text-neutral-500 text-sm">Loading projects...</div>;
  }

  if (projects.length === 0) {
    return (
      <div className="p-6">
        <h1 className="text-lg font-bold mb-4">Projects</h1>
        <p className="text-neutral-500 text-sm">
          No projects found. Create a project with{" "}
          <code className="text-neutral-300">/prd</code> in Claude Code.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-lg font-bold mb-6">Projects</h1>

      <div className="space-y-3">
        {projects.map((project) => {
          const pct = project.total > 0 ? Math.round((project.passed / project.total) * 100) : 0;
          const isExpanded = expanded === project.name;

          return (
            <div key={project.name} className="rounded-lg border border-neutral-800 bg-neutral-950">
              <button
                onClick={() => setExpanded(isExpanded ? null : project.name)}
                className="flex w-full items-start justify-between p-4 text-left"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-neutral-200">{project.name}</span>
                    <StatusBadge passed={project.passed} total={project.total} />
                  </div>
                  {project.description && (
                    <p className="text-xs text-neutral-500 line-clamp-1">{project.description}</p>
                  )}
                  {/* Progress bar */}
                  <div className="mt-2 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-neutral-800">
                      <div
                        className="h-full rounded-full bg-emerald-500 transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-xs text-neutral-500 tabular-nums flex-shrink-0">
                      {project.passed}/{project.total}
                    </span>
                  </div>
                </div>
                <span className="ml-3 text-neutral-600 flex-shrink-0">
                  {isExpanded ? "▾" : "▸"}
                </span>
              </button>

              {/* Expanded story list */}
              {isExpanded && (
                <div className="border-t border-neutral-800 px-4 py-3">
                  {project.stories.map((story) => (
                    <div
                      key={story.id}
                      className="flex items-center gap-2 py-1.5 text-sm"
                    >
                      <span
                        className={`h-2 w-2 flex-shrink-0 rounded-full ${
                          story.passes ? "bg-emerald-400" : "bg-neutral-600"
                        }`}
                      />
                      <span className="text-xs text-neutral-500 font-mono">{story.id}</span>
                      <span className={story.passes ? "text-neutral-300" : "text-neutral-500"}>
                        {story.title}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

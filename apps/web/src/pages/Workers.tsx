import { useEffect, useState, useMemo } from "react";
import { useAuth } from "../lib/auth";
import { getFile } from "../lib/api";

interface Worker {
  name: string;
  type?: string;
  team?: string;
  company?: string;
  description?: string;
  status?: string;
}

interface RegistryData {
  version?: string;
  workers?: Record<string, Worker>;
}

function parseRegistry(yaml: string): Worker[] {
  // Lightweight YAML-like parser for registry.yaml
  // Handles the simple key-value structure of the registry
  const workers: Worker[] = [];
  let currentWorker: Partial<Worker> | null = null;
  let currentName = "";

  for (const line of yaml.split("\n")) {
    const trimmed = line.trimEnd();

    // Top-level worker key (2-space indent under "workers:")
    const workerMatch = trimmed.match(/^ {2}(\S.+):$/);
    if (workerMatch) {
      if (currentWorker && currentName) {
        workers.push({ name: currentName, ...currentWorker } as Worker);
      }
      currentName = workerMatch[1];
      currentWorker = {};
      continue;
    }

    // Worker field (4-space indent)
    const fieldMatch = trimmed.match(/^ {4}(\w+):\s*(.+)?$/);
    if (fieldMatch && currentWorker) {
      const [, key, value] = fieldMatch;
      if (value) {
        (currentWorker as Record<string, string>)[key] = value.replace(/^["']|["']$/g, "");
      }
    }
  }

  // Push last worker
  if (currentWorker && currentName) {
    workers.push({ name: currentName, ...currentWorker } as Worker);
  }

  return workers;
}

export function Workers() {
  const { getToken } = useAuth();
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    async function load() {
      const token = await getToken();
      if (!token) return;
      try {
        const content = await getFile(token, "workers/registry.yaml");
        setWorkers(parseRegistry(content));
      } catch {
        setError("sync");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [getToken]);

  // Group by team
  const grouped = useMemo(() => {
    const filtered = workers.filter(
      (w) =>
        !search ||
        w.name.toLowerCase().includes(search.toLowerCase()) ||
        w.type?.toLowerCase().includes(search.toLowerCase())
    );

    const groups: Record<string, Worker[]> = {};
    for (const w of filtered) {
      const team = w.team || "other";
      if (!groups[team]) groups[team] = [];
      groups[team].push(w);
    }
    return groups;
  }, [workers, search]);

  if (loading) {
    return <div className="p-6 text-neutral-500 text-sm">Loading workers...</div>;
  }

  if (error === "sync") {
    return (
      <div className="p-6">
        <h1 className="text-lg font-bold mb-4">Workers</h1>
        <p className="text-neutral-500 text-sm">
          Sync your HQ to see workers. Run <code className="text-neutral-300">hq sync start</code> on
          your machine.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-bold">Workers</h1>
        <input
          type="text"
          placeholder="Search workers..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-md border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm text-white placeholder-neutral-500 focus:border-neutral-500 focus:outline-none w-48"
        />
      </div>

      {Object.keys(grouped).length === 0 ? (
        <p className="text-neutral-500 text-sm">No workers match your search.</p>
      ) : (
        Object.entries(grouped)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([team, teamWorkers]) => (
            <section key={team} className="mb-6">
              <h2 className="text-xs font-medium uppercase tracking-wider text-neutral-500 mb-2">
                {team}
              </h2>
              <div className="space-y-1">
                {teamWorkers.map((w) => (
                  <div
                    key={w.name}
                    className="flex items-center justify-between rounded-md px-3 py-2.5 hover:bg-neutral-900"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-neutral-200 truncate">
                          {w.name}
                        </span>
                        {w.type && (
                          <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-xs text-neutral-400">
                            {w.type}
                          </span>
                        )}
                      </div>
                      {w.description && (
                        <p className="mt-0.5 text-xs text-neutral-500 truncate">
                          {w.description}
                        </p>
                      )}
                    </div>
                    {w.status && (
                      <span
                        className={`ml-3 flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                          w.status === "active"
                            ? "bg-emerald-900/50 text-emerald-400"
                            : "bg-neutral-800 text-neutral-500"
                        }`}
                      >
                        {w.status}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </section>
          ))
      )}
    </div>
  );
}

import { useEffect, useState, useCallback } from "react";

interface HealthStatus {
  status: "ok" | "degraded";
  uptime: number;
  queueDepth: number;
  activeContainers: number;
  timestamp: number;
}

interface ContainerInfo {
  containerId: string;
  groupId: string;
  messageId: number;
  sessionId: string;
  startedAt: number;
  timeoutMs: number;
}

interface AgentStatus {
  health: HealthStatus | null;
  containers: ContainerInfo[];
  error: string | null;
  lastChecked: number;
}

const REFRESH_INTERVAL = 30_000;

function formatUptime(ms: number): string {
  const hours = Math.floor(ms / 3_600_000);
  const mins = Math.floor((ms % 3_600_000) / 60_000);
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function formatAge(startedAt: number): string {
  const diff = Date.now() - startedAt;
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function StatusDot({ status }: { status: "ok" | "degraded" | "offline" }) {
  const color =
    status === "ok"
      ? "bg-emerald-400"
      : status === "degraded"
        ? "bg-amber-400"
        : "bg-neutral-600";

  return (
    <span className={`inline-block h-2 w-2 rounded-full ${color}`} />
  );
}

export function Agents() {
  const [agentUrl, setAgentUrl] = useState(
    () => localStorage.getItem("hq-agent-url") || "http://localhost:3000"
  );
  const [status, setStatus] = useState<AgentStatus>({
    health: null,
    containers: [],
    error: null,
    lastChecked: 0,
  });
  const [loading, setLoading] = useState(true);

  const fetchStatus = useCallback(async () => {
    try {
      const [healthRes, statusRes] = await Promise.all([
        fetch(`${agentUrl}/health`, { signal: AbortSignal.timeout(5000) }),
        fetch(`${agentUrl}/api/status`, { signal: AbortSignal.timeout(5000) }).catch(() => null),
      ]);

      const health: HealthStatus = await healthRes.json();

      let containers: ContainerInfo[] = [];
      if (statusRes?.ok) {
        const data = await statusRes.json();
        containers = data.containers ?? [];
      }

      setStatus({
        health,
        containers,
        error: null,
        lastChecked: Date.now(),
      });
    } catch {
      setStatus((prev) => ({
        ...prev,
        health: null,
        error: "Agent unreachable",
        lastChecked: Date.now(),
      }));
    } finally {
      setLoading(false);
    }
  }, [agentUrl]);

  useEffect(() => {
    fetchStatus();
    const timer = setInterval(fetchStatus, REFRESH_INTERVAL);
    return () => clearInterval(timer);
  }, [fetchStatus]);

  const handleUrlChange = (url: string) => {
    setAgentUrl(url);
    localStorage.setItem("hq-agent-url", url);
  };

  const overallStatus = status.health
    ? status.health.status
    : "offline";

  return (
    <div className="max-w-3xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold">Agents</h1>
          <div className="flex items-center gap-1.5">
            <StatusDot status={overallStatus} />
            <span className="text-xs text-neutral-400 capitalize">{overallStatus}</span>
          </div>
        </div>
        <button
          onClick={() => { setLoading(true); fetchStatus(); }}
          className="rounded-md border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm text-neutral-300 hover:border-neutral-500 hover:text-white transition-colors"
        >
          Refresh
        </button>
      </div>

      {/* Agent URL config */}
      <div className="mb-6">
        <label className="block text-xs text-neutral-500 mb-1">Agent URL</label>
        <input
          type="text"
          value={agentUrl}
          onChange={(e) => handleUrlChange(e.target.value)}
          className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm text-white placeholder-neutral-500 focus:border-neutral-500 focus:outline-none"
          placeholder="http://localhost:3000"
        />
      </div>

      {loading && !status.health ? (
        <div className="text-neutral-500 text-sm">Connecting to agent...</div>
      ) : status.error ? (
        <div className="rounded-md border border-neutral-800 bg-neutral-950 p-4">
          <p className="text-sm text-neutral-400">
            Agent is offline or unreachable at <code className="text-neutral-300">{agentUrl}</code>.
          </p>
          <p className="mt-2 text-xs text-neutral-600">
            Start the agent engine with <code className="text-neutral-400">npm run dev</code> in{" "}
            <code className="text-neutral-400">packages/hq-agent/</code>, or update the URL above.
          </p>
        </div>
      ) : status.health ? (
        <div className="space-y-6">
          {/* Health summary */}
          <section>
            <h2 className="text-xs font-medium uppercase tracking-wider text-neutral-500 mb-3">
              Health
            </h2>
            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-md border border-neutral-800 bg-neutral-950 p-4">
                <div className="text-xs text-neutral-500 mb-1">Uptime</div>
                <div className="text-lg font-medium text-neutral-200">
                  {formatUptime(status.health.uptime)}
                </div>
              </div>
              <div className="rounded-md border border-neutral-800 bg-neutral-950 p-4">
                <div className="text-xs text-neutral-500 mb-1">Queue Depth</div>
                <div className="text-lg font-medium text-neutral-200">
                  {status.health.queueDepth}
                </div>
              </div>
              <div className="rounded-md border border-neutral-800 bg-neutral-950 p-4">
                <div className="text-xs text-neutral-500 mb-1">Active Containers</div>
                <div className="text-lg font-medium text-neutral-200">
                  {status.health.activeContainers}
                </div>
              </div>
            </div>
          </section>

          {/* Running containers */}
          <section>
            <h2 className="text-xs font-medium uppercase tracking-wider text-neutral-500 mb-3">
              Running Containers ({status.containers.length})
            </h2>
            {status.containers.length === 0 ? (
              <p className="text-sm text-neutral-600">No containers running.</p>
            ) : (
              <div className="space-y-1">
                {status.containers.map((c) => (
                  <div
                    key={c.containerId}
                    className="flex items-center justify-between rounded-md px-3 py-2.5 hover:bg-neutral-900"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-neutral-200 truncate font-mono">
                        {c.containerId}
                      </div>
                      <div className="mt-0.5 text-xs text-neutral-500">
                        group: {c.groupId} &middot; msg: {c.messageId}
                      </div>
                    </div>
                    <span className="ml-3 flex-shrink-0 text-xs text-neutral-500">
                      {formatAge(c.startedAt)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Last checked */}
          <div className="text-xs text-neutral-600">
            Last checked: {new Date(status.lastChecked).toLocaleTimeString()} &middot;
            Auto-refreshes every {REFRESH_INTERVAL / 1000}s
          </div>
        </div>
      ) : null}
    </div>
  );
}

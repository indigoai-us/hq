import { useEffect, useState } from "react";
import { useAuth } from "../lib/auth";
import { listTeams, getTeamMembers, createInvite, removeMember } from "../lib/api";

interface TeamMember {
  userId: string;
  username: string;
  role: string;
  joinedAt?: string;
}

interface TeamInfo {
  id: string;
  name: string;
  plan?: string;
  members: TeamMember[];
}

export function Team() {
  const { getToken } = useAuth();
  const [teams, setTeams] = useState<TeamInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [inviteTeamId, setInviteTeamId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const token = await getToken();
      if (!token) return;
      try {
        const teamList = await listTeams(token);
        const loaded: TeamInfo[] = [];
        for (const team of teamList) {
          try {
            const members = await getTeamMembers(token, team.id);
            loaded.push({ ...team, members });
          } catch {
            loaded.push({ ...team, members: [] });
          }
        }
        setTeams(loaded);
      } catch {
        // API not available yet — show empty state
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [getToken]);

  async function handleGenerateInvite(teamId: string) {
    const token = await getToken();
    if (!token) return;
    try {
      setError(null);
      const { token: inviteToken } = await createInvite(token, teamId);
      setInviteLink(inviteToken);
      setInviteTeamId(teamId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate invite");
    }
  }

  async function handleRemoveMember(teamId: string, userId: string) {
    const token = await getToken();
    if (!token) return;
    try {
      await removeMember(token, teamId, userId);
      setTeams((prev) =>
        prev.map((t) =>
          t.id === teamId
            ? { ...t, members: t.members.filter((m) => m.userId !== userId) }
            : t
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove member");
    }
  }

  function copyInvite() {
    if (!inviteLink) return;
    navigator.clipboard.writeText(`npx create-hq --join ${inviteLink}`);
  }

  if (loading) {
    return <div className="p-6 text-neutral-500 text-sm">Loading team...</div>;
  }

  // No teams — show CTA
  if (teams.length === 0) {
    return (
      <div className="max-w-lg mx-auto p-6 text-center">
        <h1 className="text-lg font-bold mb-4">Team</h1>
        <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-8">
          <p className="text-sm text-neutral-300 mb-2">Create a Team</p>
          <p className="text-xs text-neutral-500 mb-4">
            Teams let you share HQ with your organization. Members get synced access to shared
            knowledge, workers, and projects through HQ Cloud.
          </p>
          <p className="text-xs text-neutral-600">
            Coming soon — team creation will be available in the dashboard.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-lg font-bold mb-6">Team</h1>

      {error && (
        <div className="mb-4 rounded-md bg-red-900/30 border border-red-800/50 px-3 py-2 text-sm text-red-400">
          {error}
        </div>
      )}

      {teams.map((team) => (
        <div key={team.id} className="rounded-lg border border-neutral-800 bg-neutral-950 mb-4">
          {/* Team header */}
          <div className="flex items-center justify-between border-b border-neutral-800 p-4">
            <div>
              <h2 className="text-sm font-medium text-neutral-200">{team.name}</h2>
              {team.plan && (
                <span className="text-xs text-neutral-500">{team.plan} plan</span>
              )}
            </div>
            <button
              onClick={() => handleGenerateInvite(team.id)}
              className="rounded-md bg-neutral-800 px-3 py-1.5 text-xs font-medium text-neutral-200 hover:bg-neutral-700 transition-colors"
            >
              Generate Invite Link
            </button>
          </div>

          {/* Invite link display */}
          {inviteLink && inviteTeamId === team.id && (
            <div className="border-b border-neutral-800 bg-neutral-900/50 px-4 py-3">
              <p className="text-xs text-neutral-400 mb-1.5">Share this command:</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded bg-neutral-800 px-2 py-1.5 text-xs text-neutral-300 truncate">
                  npx create-hq --join {inviteLink}
                </code>
                <button
                  onClick={copyInvite}
                  className="rounded bg-neutral-800 px-2 py-1.5 text-xs text-neutral-400 hover:text-white transition-colors flex-shrink-0"
                >
                  Copy
                </button>
              </div>
            </div>
          )}

          {/* Member list */}
          <div className="p-4">
            <h3 className="text-xs font-medium uppercase tracking-wider text-neutral-500 mb-2">
              Members ({team.members.length})
            </h3>
            {team.members.length === 0 ? (
              <p className="text-xs text-neutral-600">No members yet.</p>
            ) : (
              <div className="space-y-1">
                {team.members.map((member) => (
                  <div
                    key={member.userId}
                    className="flex items-center justify-between rounded-md px-3 py-2 hover:bg-neutral-900"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-neutral-300">{member.username}</span>
                      <span
                        className={`rounded px-1.5 py-0.5 text-xs ${
                          member.role === "admin"
                            ? "bg-amber-900/40 text-amber-400"
                            : "bg-neutral-800 text-neutral-500"
                        }`}
                      >
                        {member.role}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      {member.joinedAt && (
                        <span className="text-xs text-neutral-600">
                          {new Date(member.joinedAt).toLocaleDateString()}
                        </span>
                      )}
                      <button
                        onClick={() => handleRemoveMember(team.id, member.userId)}
                        className="text-xs text-neutral-600 hover:text-red-400 transition-colors"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

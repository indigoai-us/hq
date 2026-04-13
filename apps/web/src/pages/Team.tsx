import { useEffect, useRef, useState, useCallback } from "react";
import { useAuth } from "../lib/auth";
import {
  listTeams,
  getTeamMembers,
  createInvite,
  removeMember,
  getEntitlements,
  setEntitlements,
  type Pack,
  type EntitlementsManifest,
} from "../lib/api";
import { PackEditor } from "../components/PackEditor";
import { EntitlementAssigner } from "../components/EntitlementAssigner";
import { SubmissionReview } from "../components/SubmissionReview";

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

  // Entitlements state per team
  const [entitlements, setEntitlementsState] = useState<Record<string, EntitlementsManifest>>({});
  const [entitlementsLoading, setEntitlementsLoading] = useState<Record<string, boolean>>({});
  const [entitlementsSaving, setEntitlementsSaving] = useState<Record<string, boolean>>({});

  // Pack editor modal
  const [packEditorTeam, setPackEditorTeam] = useState<string | null>(null);
  const [packEditorName, setPackEditorName] = useState<string | null>(null); // null = new

  // Active tab per team: "packs" | "submissions"
  const [activeTabs, setActiveTabs] = useState<Record<string, "packs" | "submissions">>({});

  function getTab(teamId: string): "packs" | "submissions" {
    return activeTabs[teamId] ?? "packs";
  }

  function setTab(teamId: string, tab: "packs" | "submissions") {
    setActiveTabs((prev) => ({ ...prev, [teamId]: tab }));
  }

  // Debounce save timers
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

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

        // Load entitlements for each team
        for (const team of loaded) {
          setEntitlementsLoading((prev) => ({ ...prev, [team.id]: true }));
          try {
            const manifest = await getEntitlements(token, team.id);
            setEntitlementsState((prev) => ({ ...prev, [team.id]: manifest }));
          } catch {
            setEntitlementsState((prev) => ({
              ...prev,
              [team.id]: { packs: {}, assignments: {} },
            }));
          } finally {
            setEntitlementsLoading((prev) => ({ ...prev, [team.id]: false }));
          }
        }
      } catch {
        // API not available yet — show empty state
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [getToken]);

  // Persist entitlements with debounce (500ms) after any change
  const persistEntitlements = useCallback(
    async (teamId: string, manifest: EntitlementsManifest) => {
      const token = await getToken();
      if (!token) return;
      setEntitlementsSaving((prev) => ({ ...prev, [teamId]: true }));
      try {
        await setEntitlements(token, teamId, manifest);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save entitlements");
      } finally {
        setEntitlementsSaving((prev) => ({ ...prev, [teamId]: false }));
      }
    },
    [getToken]
  );

  function scheduleEntitlementsSave(teamId: string, manifest: EntitlementsManifest) {
    if (saveTimers.current[teamId]) clearTimeout(saveTimers.current[teamId]);
    saveTimers.current[teamId] = setTimeout(() => {
      persistEntitlements(teamId, manifest);
    }, 500);
  }

  // Pack editor handlers
  function openNewPack(teamId: string) {
    setPackEditorTeam(teamId);
    setPackEditorName(null);
  }

  function openEditPack(teamId: string, packName: string) {
    setPackEditorTeam(teamId);
    setPackEditorName(packName);
  }

  function closePackEditor() {
    setPackEditorTeam(null);
    setPackEditorName(null);
  }

  function handlePackSave(teamId: string, name: string, pack: Pack) {
    setEntitlementsState((prev) => {
      const current = prev[teamId] ?? { packs: {}, assignments: {} };
      const updated: EntitlementsManifest = {
        ...current,
        packs: { ...current.packs, [name]: pack },
      };
      scheduleEntitlementsSave(teamId, updated);
      return { ...prev, [teamId]: updated };
    });
    closePackEditor();
  }

  function handlePackDelete(teamId: string, name: string) {
    setEntitlementsState((prev) => {
      const current = prev[teamId] ?? { packs: {}, assignments: {} };
      const { [name]: _, ...remainingPacks } = current.packs;
      // Also remove deleted pack from all assignments
      const cleanedAssignments: Record<string, string[]> = {};
      for (const [key, packsArr] of Object.entries(current.assignments)) {
        const filtered = packsArr.filter((p) => p !== name);
        if (filtered.length > 0) cleanedAssignments[key] = filtered;
      }
      const updated: EntitlementsManifest = {
        packs: remainingPacks,
        assignments: cleanedAssignments,
      };
      scheduleEntitlementsSave(teamId, updated);
      return { ...prev, [teamId]: updated };
    });
    closePackEditor();
  }

  function handleAssignmentsChange(teamId: string, assignments: Record<string, string[]>) {
    setEntitlementsState((prev) => {
      const current = prev[teamId] ?? { packs: {}, assignments: {} };
      const updated: EntitlementsManifest = { ...current, assignments };
      scheduleEntitlementsSave(teamId, updated);
      return { ...prev, [teamId]: updated };
    });
  }

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

      {teams.map((team) => {
        const manifest = entitlements[team.id] ?? { packs: {}, assignments: {} };
        const packNames = Object.keys(manifest.packs);
        const isEntitlementsLoading = entitlementsLoading[team.id];
        const isSaving = entitlementsSaving[team.id];

        return (
          <div key={team.id} className="rounded-lg border border-neutral-800 bg-neutral-950 mb-6">
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

            {/* Tab switcher: Packs | Submissions */}
            <div className="flex border-b border-neutral-800">
              {(["packs", "submissions"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setTab(team.id, tab)}
                  className={`px-4 py-2.5 text-xs font-medium capitalize transition-colors ${
                    getTab(team.id) === tab
                      ? "text-neutral-200 border-b-2 border-neutral-200 -mb-px"
                      : "text-neutral-500 hover:text-neutral-300"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Packs section */}
            {getTab(team.id) === "packs" && (
            <div className="border-b border-neutral-800 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-medium uppercase tracking-wider text-neutral-500">
                  Packs
                </h3>
                <button
                  onClick={() => openNewPack(team.id)}
                  className="rounded-md bg-neutral-800 px-2.5 py-1 text-xs font-medium text-neutral-300 hover:bg-neutral-700 transition-colors"
                >
                  + New Pack
                </button>
              </div>

              {isEntitlementsLoading ? (
                <p className="text-xs text-neutral-600">Loading packs...</p>
              ) : packNames.length === 0 ? (
                <p className="text-xs text-neutral-600">
                  No packs defined yet. Create a pack to start assigning content to members.
                </p>
              ) : (
                <div className="space-y-1">
                  {packNames.map((packName) => {
                    const pack = manifest.packs[packName];
                    return (
                      <div
                        key={packName}
                        className="flex items-start justify-between rounded-md px-3 py-2 hover:bg-neutral-900 group"
                      >
                        <div className="flex-1 min-w-0 mr-3">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-neutral-300">{packName}</span>
                            {pack.description && (
                              <span className="text-xs text-neutral-500 truncate">
                                {pack.description}
                              </span>
                            )}
                          </div>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {pack.paths.map((path) => (
                              <span
                                key={path}
                                className="rounded bg-neutral-800 px-1.5 py-0.5 text-xs font-mono text-neutral-500"
                              >
                                {path}
                              </span>
                            ))}
                          </div>
                        </div>
                        <button
                          onClick={() => openEditPack(team.id, packName)}
                          className="text-xs text-neutral-600 hover:text-neutral-300 transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0"
                        >
                          Edit
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            )}

            {/* Submissions section */}
            {getTab(team.id) === "submissions" && (
            <div className="border-b border-neutral-800 p-4">
              <h3 className="text-xs font-medium uppercase tracking-wider text-neutral-500 mb-3">
                Submissions
              </h3>
              <SubmissionReview teamId={team.id} members={team.members} />
            </div>
            )}

            {/* Member list with entitlement assignment */}
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-medium uppercase tracking-wider text-neutral-500">
                  Members ({team.members.length})
                </h3>
                <div className="flex items-center gap-3">
                  {isSaving && (
                    <span className="text-xs text-neutral-600">Saving...</span>
                  )}
                  {team.members.length > 0 && (
                    <button
                      onClick={() => handleRemoveMember(team.id, team.members[team.members.length - 1].userId)}
                      className="sr-only"
                    >
                      {/* Hidden — remove buttons are inline per member */}
                    </button>
                  )}
                </div>
              </div>

              {team.members.length === 0 ? (
                <p className="text-xs text-neutral-600">No members yet.</p>
              ) : packNames.length === 0 ? (
                /* No packs defined: fall back to simple member list */
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
              ) : (
                /* Packs exist: show entitlement assigner */
                <EntitlementAssigner
                  members={team.members}
                  packs={manifest.packs}
                  assignments={manifest.assignments}
                  onChange={(assignments) => handleAssignmentsChange(team.id, assignments)}
                  saving={isSaving}
                />
              )}

              {/* Remove members (when using assigner mode) */}
              {packNames.length > 0 && team.members.length > 0 && (
                <div className="mt-3 space-y-0.5">
                  {team.members.map((member) => (
                    <div key={member.userId} className="flex justify-end">
                      <button
                        onClick={() => handleRemoveMember(team.id, member.userId)}
                        className="text-xs text-neutral-700 hover:text-red-400 transition-colors px-3"
                      >
                        Remove {member.username}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* Pack editor modal */}
      {packEditorTeam && (
        <PackEditor
          packName={packEditorName}
          initialPack={
            packEditorName
              ? entitlements[packEditorTeam]?.packs[packEditorName]
              : undefined
          }
          existingNames={Object.keys(entitlements[packEditorTeam]?.packs ?? {})}
          onSave={(name, pack) => handlePackSave(packEditorTeam, name, pack)}
          onDelete={packEditorName ? (name) => handlePackDelete(packEditorTeam, name) : undefined}
          onCancel={closePackEditor}
        />
      )}
    </div>
  );
}

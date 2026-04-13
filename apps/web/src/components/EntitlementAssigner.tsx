import { useState, useRef, useEffect } from "react";
import type { Pack } from "../lib/api";

interface TeamMember {
  userId: string;
  username: string;
  role: string;
}

interface EntitlementAssignerProps {
  members: TeamMember[];
  packs: Record<string, Pack>;
  /** assignments: userId or "role:member" → pack names */
  assignments: Record<string, string[]>;
  /** Called whenever the caller should persist a new assignments map */
  onChange: (assignments: Record<string, string[]>) => void;
  saving?: boolean;
}

function PackChip({
  packName,
  onRemove,
}: {
  packName: string;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-neutral-800 px-2 py-0.5 text-xs text-neutral-300">
      {packName}
      <button
        onClick={onRemove}
        className="ml-0.5 text-neutral-500 hover:text-white transition-colors leading-none"
        aria-label={`Remove ${packName}`}
      >
        ×
      </button>
    </span>
  );
}

function AddPackDropdown({
  availablePacks,
  onAdd,
}: {
  availablePacks: string[];
  onAdd: (packName: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  if (availablePacks.length === 0) return null;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 rounded-full border border-dashed border-neutral-700 px-2 py-0.5 text-xs text-neutral-500 hover:border-neutral-500 hover:text-neutral-300 transition-colors"
      >
        + Add
      </button>
      {open && (
        <div className="absolute left-0 top-6 z-20 min-w-[140px] rounded-md border border-neutral-700 bg-neutral-900 py-1 shadow-xl">
          {availablePacks.map((p) => (
            <button
              key={p}
              onClick={() => { onAdd(p); setOpen(false); }}
              className="block w-full px-3 py-1.5 text-left text-xs text-neutral-300 hover:bg-neutral-800 transition-colors"
            >
              {p}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function EntitlementAssigner({
  members,
  packs,
  assignments,
  onChange,
  saving,
}: EntitlementAssignerProps) {
  const allPackNames = Object.keys(packs);

  function getAssigned(key: string): string[] {
    return assignments[key] ?? [];
  }

  function assign(key: string, packName: string) {
    const current = getAssigned(key);
    if (current.includes(packName)) return;
    onChange({ ...assignments, [key]: [...current, packName] });
  }

  function unassign(key: string, packName: string) {
    const current = getAssigned(key);
    const next = current.filter((p) => p !== packName);
    if (next.length === 0) {
      // Remove the key entirely to keep manifest clean
      const { [key]: _, ...rest } = assignments;
      onChange(rest);
    } else {
      onChange({ ...assignments, [key]: next });
    }
  }

  // All members role-based defaults key
  const roleKey = "role:member";
  const roleAssigned = getAssigned(roleKey);
  const roleAvailable = allPackNames.filter((p) => !roleAssigned.includes(p));

  return (
    <div className="space-y-1">
      {/* Role-based defaults row */}
      <div className="rounded-md border border-neutral-800/60 bg-neutral-900/40 px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 min-w-[140px]">
            <span className="text-sm text-neutral-300">All members</span>
            <span className="rounded px-1.5 py-0.5 text-xs bg-neutral-800 text-neutral-500">
              role:member
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {roleAssigned.map((p) => (
              <PackChip
                key={p}
                packName={p}
                onRemove={() => unassign(roleKey, p)}
              />
            ))}
            <AddPackDropdown
              availablePacks={roleAvailable}
              onAdd={(p) => assign(roleKey, p)}
            />
          </div>
        </div>
      </div>

      {/* Individual members */}
      {members.map((member) => {
        const assigned = getAssigned(member.userId);
        const available = allPackNames.filter((p) => !assigned.includes(p));
        return (
          <div
            key={member.userId}
            className="flex flex-wrap items-center gap-2 rounded-md px-3 py-2.5 hover:bg-neutral-900/60 transition-colors"
          >
            <div className="flex items-center gap-2 min-w-[140px]">
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
            <div className="flex flex-wrap items-center gap-1.5">
              {assigned.map((p) => (
                <PackChip
                  key={p}
                  packName={p}
                  onRemove={() => unassign(member.userId, p)}
                />
              ))}
              <AddPackDropdown
                availablePacks={available}
                onAdd={(p) => assign(member.userId, p)}
              />
            </div>
          </div>
        );
      })}

      {saving && (
        <p className="pt-1 text-xs text-neutral-600">Saving...</p>
      )}
    </div>
  );
}

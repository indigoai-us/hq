import { useState, useEffect } from "react";
import type { Pack } from "../lib/api";

interface PackEditorProps {
  /** Pack name being edited, or null for new pack */
  packName: string | null;
  /** Existing pack data when editing */
  initialPack?: Pack;
  /** All existing pack names (to prevent duplicates) */
  existingNames: string[];
  onSave: (name: string, pack: Pack) => void;
  onDelete?: (name: string) => void;
  onCancel: () => void;
}

export function PackEditor({
  packName,
  initialPack,
  existingNames,
  onSave,
  onDelete,
  onCancel,
}: PackEditorProps) {
  const isNew = packName === null;

  const [name, setName] = useState(packName ?? "");
  const [description, setDescription] = useState(initialPack?.description ?? "");
  const [pathsText, setPathsText] = useState(
    initialPack?.paths.join("\n") ?? ""
  );
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Reset when packName changes
  useEffect(() => {
    setName(packName ?? "");
    setDescription(initialPack?.description ?? "");
    setPathsText(initialPack?.paths.join("\n") ?? "");
    setError(null);
    setConfirmDelete(false);
  }, [packName, initialPack]);

  function handleSave() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Pack name is required.");
      return;
    }
    // Only check for duplicates when creating a new pack or renaming
    if (isNew && existingNames.includes(trimmedName)) {
      setError(`A pack named "${trimmedName}" already exists.`);
      return;
    }
    const paths = pathsText
      .split("\n")
      .map((p) => p.trim())
      .filter(Boolean);
    if (paths.length === 0) {
      setError("At least one path pattern is required.");
      return;
    }
    onSave(trimmedName, { description: description.trim(), paths });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") onCancel();
  }

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onKeyDown={handleKeyDown}
    >
      <div
        className="w-full max-w-md rounded-lg border border-neutral-800 bg-neutral-950 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
          <h2 className="text-sm font-medium text-neutral-200">
            {isNew ? "New Pack" : `Edit Pack — ${packName}`}
          </h2>
          <button
            onClick={onCancel}
            className="text-neutral-500 hover:text-white transition-colors text-lg leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 p-4">
          {error && (
            <div className="rounded-md bg-red-900/30 border border-red-800/50 px-3 py-2 text-sm text-red-400">
              {error}
            </div>
          )}

          {/* Name */}
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-400">
              Pack Name
            </label>
            <input
              autoFocus
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); setError(null); }}
              disabled={!isNew}
              placeholder="e.g. design-assets"
              className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 placeholder-neutral-600 focus:border-neutral-500 focus:outline-none disabled:opacity-50"
            />
            {!isNew && (
              <p className="mt-1 text-xs text-neutral-600">
                Pack names cannot be changed after creation.
              </p>
            )}
          </div>

          {/* Description */}
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-400">
              Description
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Short description of this pack"
              className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 placeholder-neutral-600 focus:border-neutral-500 focus:outline-none"
            />
          </div>

          {/* Path patterns */}
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-400">
              Path Patterns
              <span className="ml-1 text-neutral-600">(one per line)</span>
            </label>
            <textarea
              rows={5}
              value={pathsText}
              onChange={(e) => { setPathsText(e.target.value); setError(null); }}
              placeholder={"workers/public/\nknowledge/public/design-styles/\ncompanies/*/workers/"}
              className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm font-mono text-neutral-200 placeholder-neutral-600 focus:border-neutral-500 focus:outline-none resize-none"
            />
            <p className="mt-1 text-xs text-neutral-600">
              Glob-style patterns passed to git sparse-checkout.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-neutral-800 px-4 py-3">
          <div>
            {!isNew && onDelete && (
              confirmDelete ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-red-400">Delete this pack?</span>
                  <button
                    onClick={() => { onDelete(packName!); setConfirmDelete(false); }}
                    className="rounded px-2 py-1 text-xs bg-red-900/40 text-red-400 hover:bg-red-900/70 transition-colors"
                  >
                    Yes, delete
                  </button>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="text-xs text-neutral-600 hover:text-red-400 transition-colors"
                >
                  Delete pack
                </button>
              )
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onCancel}
              className="rounded-md px-3 py-1.5 text-xs text-neutral-400 hover:text-neutral-200 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="rounded-md bg-neutral-800 px-3 py-1.5 text-xs font-medium text-neutral-200 hover:bg-neutral-700 transition-colors"
            >
              {isNew ? "Create Pack" : "Save Changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

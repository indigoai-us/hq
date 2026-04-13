/**
 * DiffViewer — renders a unified diff with green additions and red deletions.
 * Pure custom component with no heavy library dependency.
 */

import type { DiffFile } from "../lib/api";

interface DiffViewerProps {
  files: DiffFile[];
}

export function DiffViewer({ files }: DiffViewerProps) {
  if (files.length === 0) {
    return (
      <p className="text-xs text-neutral-500 italic">No file changes found.</p>
    );
  }

  return (
    <div className="space-y-4">
      {files.map((file) => (
        <div
          key={file.filename}
          className="rounded-md border border-neutral-800 overflow-hidden"
        >
          {/* File header */}
          <div className="flex items-center justify-between bg-neutral-900 px-3 py-2 border-b border-neutral-800">
            <span className="text-xs font-mono text-neutral-300 truncate">
              {file.filename}
            </span>
            <div className="flex items-center gap-3 flex-shrink-0 ml-3">
              <span className="text-xs text-green-500">+{file.additions}</span>
              <span className="text-xs text-red-500">-{file.deletions}</span>
              <StatusBadge status={file.status} />
            </div>
          </div>

          {/* Diff patch */}
          {file.patch ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs font-mono">
                <tbody>
                  {parsePatch(file.patch).map((line, idx) => (
                    <DiffLine key={idx} line={line} />
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="px-3 py-2 text-xs text-neutral-600 italic">
              {file.status === "binary"
                ? "Binary file — no diff available"
                : "No textual diff available"}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// --- Internal helpers ---

type LineType = "addition" | "deletion" | "context" | "hunk";

interface ParsedLine {
  type: LineType;
  content: string;
}

function parsePatch(patch: string): ParsedLine[] {
  return patch.split("\n").map((line) => {
    if (line.startsWith("@@")) return { type: "hunk", content: line };
    if (line.startsWith("+")) return { type: "addition", content: line };
    if (line.startsWith("-")) return { type: "deletion", content: line };
    return { type: "context", content: line };
  });
}

function DiffLine({ line }: { line: ParsedLine }) {
  const rowClass =
    line.type === "addition"
      ? "bg-green-950/40"
      : line.type === "deletion"
      ? "bg-red-950/40"
      : line.type === "hunk"
      ? "bg-neutral-900"
      : "";

  const textClass =
    line.type === "addition"
      ? "text-green-400"
      : line.type === "deletion"
      ? "text-red-400"
      : line.type === "hunk"
      ? "text-neutral-500"
      : "text-neutral-400";

  return (
    <tr className={rowClass}>
      <td className={`select-none px-2 py-0.5 border-r border-neutral-800/60 ${textClass} w-4 align-top`}>
        {line.type === "addition" ? "+" : line.type === "deletion" ? "-" : " "}
      </td>
      <td className={`px-3 py-0.5 whitespace-pre ${textClass} align-top`}>
        {line.type === "hunk" ? line.content : line.content.slice(1)}
      </td>
    </tr>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    added: { label: "added", cls: "bg-green-900/40 text-green-400" },
    removed: { label: "removed", cls: "bg-red-900/40 text-red-400" },
    modified: { label: "modified", cls: "bg-blue-900/40 text-blue-400" },
    renamed: { label: "renamed", cls: "bg-amber-900/40 text-amber-400" },
  };
  const entry = map[status] ?? {
    label: status,
    cls: "bg-neutral-800 text-neutral-500",
  };
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs ${entry.cls}`}>
      {entry.label}
    </span>
  );
}

import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { listFiles } from "../lib/api";

interface FileEntry {
  path: string;
  size: number;
  lastModified: string;
}

interface FolderEntry {
  name: string;
  isDir: true;
}

type Entry = (FileEntry & { isDir: false }) | FolderEntry;

export function FileBrowser() {
  const { getToken } = useAuth();
  const location = useLocation();
  const currentPath = location.pathname.replace("/files", "").replace(/^\//, "");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const token = await getToken();
      if (!token) return;

      try {
        const result = await listFiles(token);
        const prefix = currentPath ? currentPath + "/" : "";

        // Build directory listing from flat file list
        const dirs = new Set<string>();
        const files: (FileEntry & { isDir: false })[] = [];

        for (const file of result.files) {
          if (!file.path.startsWith(prefix) && prefix) continue;
          const rest = file.path.slice(prefix.length);
          const slashIdx = rest.indexOf("/");

          if (slashIdx >= 0) {
            dirs.add(rest.slice(0, slashIdx));
          } else if (rest) {
            files.push({ ...file, isDir: false });
          }
        }

        const dirEntries: FolderEntry[] = [...dirs].sort().map((name) => ({
          name,
          isDir: true,
        }));

        setEntries([
          ...dirEntries,
          ...files.sort((a, b) => a.path.localeCompare(b.path)),
        ]);
      } catch (err) {
        console.error("Failed to list files:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [currentPath, getToken]);

  const parentPath = currentPath.includes("/")
    ? currentPath.split("/").slice(0, -1).join("/")
    : "";

  return (
    <div className="max-w-2xl mx-auto p-6">
      <header className="flex items-center gap-4 mb-6">
        <Link to="/" className="text-neutral-500 hover:text-white text-sm">HQ</Link>
        <span className="text-neutral-700">/</span>
        <span className="text-sm text-neutral-300">{currentPath || "files"}</span>
      </header>

      {currentPath && (
        <Link
          to={parentPath ? `/files/${parentPath}` : "/files"}
          className="flex items-center py-2 px-3 text-sm text-neutral-500 hover:text-white"
        >
          ..
        </Link>
      )}

      {loading ? (
        <p className="text-neutral-600 text-sm p-3">Loading...</p>
      ) : entries.length === 0 ? (
        <p className="text-neutral-600 text-sm p-3">Empty directory</p>
      ) : (
        <div className="space-y-0.5">
          {entries.map((entry) => {
            if (entry.isDir) {
              const dirPath = currentPath
                ? `${currentPath}/${entry.name}`
                : entry.name;
              return (
                <Link
                  key={entry.name}
                  to={`/files/${dirPath}`}
                  className="flex items-center py-2 px-3 rounded hover:bg-neutral-900 text-sm"
                >
                  <span className="text-neutral-500 mr-2">+</span>
                  <span className="text-neutral-300">{entry.name}/</span>
                </Link>
              );
            }

            const fileName = entry.path.split("/").pop() || entry.path;
            return (
              <Link
                key={entry.path}
                to={`/view/${entry.path}`}
                className="flex items-center justify-between py-2 px-3 rounded hover:bg-neutral-900 text-sm group"
              >
                <span className="text-neutral-400 group-hover:text-white">
                  {fileName}
                </span>
                <span className="text-xs text-neutral-700">
                  {formatSize(entry.size)}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}K`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
}

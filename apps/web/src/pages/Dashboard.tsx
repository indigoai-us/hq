import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { listFiles } from "../lib/api";

interface FileEntry {
  path: string;
  size: number;
  lastModified: string;
}

export function Dashboard() {
  const { signOut, getToken } = useAuth();
  const [recentFiles, setRecentFiles] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const token = await getToken();
      if (!token) return;
      try {
        const result = await listFiles(token);
        // Sort by lastModified descending, take 10
        const sorted = result.files
          .sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime())
          .slice(0, 10);
        setRecentFiles(sorted);
      } catch (err) {
        console.error("Failed to load files:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [getToken]);

  return (
    <div className="max-w-2xl mx-auto p-6">
      <header className="flex items-center justify-between mb-8">
        <h1 className="text-xl font-bold">HQ</h1>
        <div className="flex gap-4 text-sm">
          <Link to="/files" className="text-neutral-400 hover:text-white">Files</Link>
          <Link to="/settings" className="text-neutral-400 hover:text-white">Settings</Link>
          <button onClick={signOut} className="text-neutral-500 hover:text-white">Sign Out</button>
        </div>
      </header>

      <section>
        <h2 className="text-sm font-medium text-neutral-400 mb-3">Recent Files</h2>
        {loading ? (
          <p className="text-neutral-600 text-sm">Loading...</p>
        ) : recentFiles.length === 0 ? (
          <p className="text-neutral-600 text-sm">No files synced yet. Run `hq sync start` on your machine.</p>
        ) : (
          <div className="space-y-1">
            {recentFiles.map((file) => (
              <Link
                key={file.path}
                to={`/view/${file.path}`}
                className="flex items-center justify-between py-2 px-3 rounded hover:bg-neutral-900 group"
              >
                <span className="text-sm text-neutral-300 group-hover:text-white truncate">
                  {file.path}
                </span>
                <span className="text-xs text-neutral-600 flex-shrink-0 ml-4">
                  {new Date(file.lastModified).toLocaleDateString()}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-medium text-neutral-400 mb-3">Quick Access</h2>
        <div className="grid grid-cols-2 gap-2">
          <Link to="/files/workspace/threads" className="p-3 rounded bg-neutral-900 hover:bg-neutral-800 text-sm">
            Threads
          </Link>
          <Link to="/files/workspace/social-drafts" className="p-3 rounded bg-neutral-900 hover:bg-neutral-800 text-sm">
            Social Drafts
          </Link>
          <Link to="/files/workspace/reports" className="p-3 rounded bg-neutral-900 hover:bg-neutral-800 text-sm">
            Reports
          </Link>
          <Link to="/files/knowledge" className="p-3 rounded bg-neutral-900 hover:bg-neutral-800 text-sm">
            Knowledge
          </Link>
        </div>
      </section>
    </div>
  );
}

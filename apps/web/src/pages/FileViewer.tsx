import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import { useAuth } from "../lib/auth";
import { getFile } from "../lib/api";

export function FileViewer() {
  const { getToken } = useAuth();
  const location = useLocation();
  const filePath = location.pathname.replace("/view/", "");
  const [content, setContent] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const isMarkdown = filePath.endsWith(".md");
  const isJson = filePath.endsWith(".json");
  const fileName = filePath.split("/").pop() || filePath;
  const parentPath = filePath.includes("/")
    ? filePath.split("/").slice(0, -1).join("/")
    : "";

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError("");
      const token = await getToken();
      if (!token) return;

      try {
        const data = await getFile(token, filePath);
        setContent(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load file");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [filePath, getToken]);

  return (
    <div className="max-w-3xl mx-auto p-6">
      <header className="flex items-center gap-2 mb-6 text-sm">
        <Link to="/" className="text-neutral-500 hover:text-white">HQ</Link>
        <span className="text-neutral-700">/</span>
        {parentPath && (
          <>
            <Link to={`/files/${parentPath}`} className="text-neutral-500 hover:text-white">
              {parentPath}
            </Link>
            <span className="text-neutral-700">/</span>
          </>
        )}
        <span className="text-neutral-300">{fileName}</span>
      </header>

      {loading ? (
        <p className="text-neutral-600 text-sm">Loading...</p>
      ) : error ? (
        <p className="text-red-400 text-sm">{error}</p>
      ) : isMarkdown ? (
        <article className="prose prose-invert prose-sm max-w-none">
          <ReactMarkdown>{content}</ReactMarkdown>
        </article>
      ) : isJson ? (
        <pre className="text-xs text-neutral-400 overflow-x-auto p-4 bg-neutral-900 rounded">
          {JSON.stringify(JSON.parse(content), null, 2)}
        </pre>
      ) : (
        <pre className="text-xs text-neutral-400 overflow-x-auto p-4 bg-neutral-900 rounded whitespace-pre-wrap">
          {content}
        </pre>
      )}
    </div>
  );
}

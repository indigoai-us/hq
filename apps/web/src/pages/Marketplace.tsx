import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  searchPackages,
  type Package,
  type PackageCategory,
} from "../lib/registry";

const CATEGORIES: { id: PackageCategory | null; label: string }[] = [
  { id: null, label: "All" },
  { id: "worker-packs", label: "Worker Packs" },
  { id: "knowledge-bases", label: "Knowledge Bases" },
  { id: "tools", label: "Tools" },
  { id: "skills", label: "Skills" },
];

function SkeletonCard() {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-4">
      <div className="animate-pulse space-y-3">
        <div className="h-4 w-2/3 rounded bg-neutral-800" />
        <div className="space-y-1.5">
          <div className="h-3 w-full rounded bg-neutral-800" />
          <div className="h-3 w-4/5 rounded bg-neutral-800" />
        </div>
        <div className="flex items-center gap-2 pt-1">
          <div className="h-3 w-16 rounded bg-neutral-800" />
          <div className="h-3 w-10 rounded bg-neutral-800" />
        </div>
      </div>
    </div>
  );
}

export function Marketplace() {
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [category, setCategory] = useState<PackageCategory | null>(null);

  // Debounce search input (300ms)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Fetch packages when search or category changes
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const result = await searchPackages(
          debouncedSearch || undefined,
          category ? { category } : undefined
        );
        if (!cancelled) setPackages(result.packages);
      } catch {
        if (!cancelled) setError("Failed to load packages from registry.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [debouncedSearch, category]);

  return (
    <div className="max-w-3xl mx-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-bold">Marketplace</h1>
        <input
          type="text"
          placeholder="Search packages..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-md border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm text-white placeholder-neutral-500 focus:border-neutral-500 focus:outline-none w-48"
        />
      </div>

      {/* Category filter */}
      <div className="flex items-center gap-1.5 mb-6 overflow-x-auto">
        {CATEGORIES.map(({ id, label }) => (
          <button
            key={label}
            onClick={() => setCategory(id)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors ${
              category === id
                ? "bg-neutral-700 text-white"
                : "bg-neutral-900 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-md bg-red-900/30 border border-red-800/50 px-3 py-2 text-sm text-red-400 mb-4">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : packages.length === 0 ? (
        /* Empty state */
        <p className="text-neutral-500 text-sm">
          {debouncedSearch
            ? `No packages found for "${debouncedSearch}"`
            : "No packages found. Try a different search or category."}
        </p>
      ) : (
        /* Package grid */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {packages.map((pkg) => (
            <Link
              key={pkg.name}
              to={`/marketplace/${encodeURIComponent(pkg.name)}`}
              className="rounded-lg border border-neutral-800 bg-neutral-950 p-4 hover:border-neutral-700 transition-colors block"
            >
              <div className="text-sm font-medium text-neutral-200 truncate">
                {pkg.name}
              </div>
              <p className="mt-1 text-xs text-neutral-500 line-clamp-2">
                {pkg.description}
              </p>
              <div className="mt-3 flex items-center gap-2 text-xs">
                <span className="text-neutral-400 truncate">
                  {pkg.publisher.name}
                </span>
                {pkg.trusted && (
                  <span className="flex-shrink-0 rounded bg-emerald-900/50 px-1.5 py-0.5 text-emerald-400">
                    ✓
                  </span>
                )}
                <span className="ml-auto flex-shrink-0 rounded bg-neutral-800 px-1.5 py-0.5 text-neutral-400">
                  v{pkg.version}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

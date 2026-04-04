import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import { getPackage, type Package } from "../lib/registry";
import { useAuth } from "../lib/auth";
import { getFile, putFile } from "../lib/api";

type InstallState = "idle" | "checking" | "installing" | "installed" | "already" | "uninstalling" | "error";

const MODULES_PATH = "modules/modules.yaml";

function buildModuleEntry(pkg: Package): string {
  const repo = pkg.repo || pkg.name;
  const branch = pkg.branch || "main";
  return [
    `  - name: ${pkg.name}`,
    `    repo: ${repo}`,
    `    branch: ${branch}`,
    `    strategy: link`,
  ].join("\n");
}

function moduleExists(yaml: string, pkgName: string): boolean {
  return yaml.includes(`name: ${pkgName}`);
}

function removeModuleEntry(yaml: string, pkgName: string): string {
  const lines = yaml.split("\n");
  const result: string[] = [];
  let skipping = false;

  for (const line of lines) {
    if (line.match(/^\s{2}- name:\s/) && line.includes(pkgName)) {
      skipping = true;
      continue;
    }
    if (skipping && (line.match(/^\s{2}- name:\s/) || line.match(/^\S/) || line.trim() === "")) {
      skipping = false;
    }
    if (skipping && line.match(/^\s{4}\w/)) {
      continue;
    }
    result.push(line);
  }

  return result.join("\n");
}

export function PackageDetail() {
  const { name } = useParams<{ name: string }>();
  const { getToken } = useAuth();
  const [pkg, setPkg] = useState<Package | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [copied, setCopied] = useState(false);
  const [installState, setInstallState] = useState<InstallState>("checking");
  const [installError, setInstallError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!name) return;
      setLoading(true);
      setNotFound(false);
      try {
        const data = await getPackage(name);
        if (!cancelled) setPkg(data);

        // Check if already installed
        const token = await getToken();
        if (token) {
          try {
            const yaml = await getFile(token, MODULES_PATH);
            if (!cancelled) {
              setInstallState(moduleExists(yaml, name) ? "already" : "idle");
            }
          } catch {
            if (!cancelled) setInstallState("idle");
          }
        } else {
          if (!cancelled) setInstallState("idle");
        }
      } catch (err) {
        if (!cancelled) {
          if (err instanceof Error && err.message.includes("404")) {
            setNotFound(true);
          } else {
            setNotFound(true);
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [name, getToken]);

  function copyInstallCommand() {
    if (!pkg) return;
    const cmd = `hq modules add ${pkg.repo || pkg.name}`;
    navigator.clipboard.writeText(cmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleInstall() {
    if (!pkg) return;
    setInstallState("installing");
    setInstallError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");

      let yaml = "";
      try {
        yaml = await getFile(token, MODULES_PATH);
      } catch {
        yaml = "modules:\n";
      }

      if (moduleExists(yaml, pkg.name)) {
        setInstallState("already");
        return;
      }

      const entry = buildModuleEntry(pkg);
      const updated = yaml.trimEnd() + "\n" + entry + "\n";
      await putFile(token, MODULES_PATH, updated);
      setInstallState("installed");
    } catch (err) {
      setInstallError(err instanceof Error ? err.message : "Install failed");
      setInstallState("error");
    }
  }

  async function handleUninstall() {
    if (!pkg) return;
    setInstallState("uninstalling");
    setInstallError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");

      const yaml = await getFile(token, MODULES_PATH);
      const updated = removeModuleEntry(yaml, pkg.name);
      await putFile(token, MODULES_PATH, updated);
      setInstallState("idle");
    } catch (err) {
      setInstallError(err instanceof Error ? err.message : "Uninstall failed");
      setInstallState("error");
    }
  }

  if (loading) {
    return <div className="p-6 text-neutral-500 text-sm">Loading package...</div>;
  }

  if (notFound || !pkg) {
    return (
      <div className="max-w-2xl mx-auto p-6 text-center">
        <h1 className="text-lg font-bold mb-2">Package Not Found</h1>
        <p className="text-neutral-500 text-sm mb-4">
          The package &ldquo;{name}&rdquo; could not be found in the registry.
        </p>
        <Link
          to="/marketplace"
          className="text-sm text-neutral-400 hover:text-white underline"
        >
          Back to Marketplace
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-sm mb-6">
        <Link to="/marketplace" className="text-neutral-500 hover:text-white transition-colors">
          Marketplace
        </Link>
        <span className="text-neutral-700">/</span>
        <span className="text-neutral-300">{pkg.name}</span>
      </div>

      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <h1 className="text-xl font-bold">{pkg.name}</h1>
          {pkg.trusted && (
            <span className="rounded bg-emerald-900/50 px-2 py-0.5 text-xs text-emerald-400">
              Verified
            </span>
          )}
        </div>
        <p className="text-sm text-neutral-400">{pkg.description}</p>
      </div>

      {/* Metadata row */}
      <div className="flex flex-wrap items-center gap-3 mb-6 text-xs">
        <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-neutral-400">
          v{pkg.version}
        </span>
        <span className="text-neutral-500">
          Updated {new Date(pkg.lastUpdated).toLocaleDateString()}
        </span>
        <span className="text-neutral-500">
          by{" "}
          <span className="text-neutral-300">
            {pkg.publisher.name}
            {pkg.publisher.verified && " ✓"}
          </span>
        </span>
        <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-neutral-400">
          {pkg.category}
        </span>
      </div>

      {/* Install section */}
      <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-4 mb-6">
        <div className="text-xs font-medium uppercase tracking-wider text-neutral-500 mb-2">
          Install
        </div>
        <div className="flex items-center gap-2 mb-3">
          <code className="flex-1 rounded bg-neutral-900 px-3 py-2 text-sm text-neutral-300 font-mono">
            hq modules add {pkg.repo || pkg.name}
          </code>
          <button
            onClick={copyInstallCommand}
            className="rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs text-neutral-400 hover:text-white hover:border-neutral-500 transition-colors"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
        <div className="flex items-center gap-3">
          {installState === "idle" && (
            <button
              onClick={handleInstall}
              className="rounded-md bg-white px-4 py-1.5 text-xs font-medium text-black hover:bg-neutral-200 transition-colors"
            >
              Install
            </button>
          )}
          {installState === "checking" && (
            <span className="text-xs text-neutral-500">Checking...</span>
          )}
          {installState === "installing" && (
            <button
              disabled
              className="rounded-md bg-neutral-700 px-4 py-1.5 text-xs font-medium text-neutral-400 cursor-not-allowed"
            >
              Installing...
            </button>
          )}
          {installState === "installed" && (
            <>
              <span className="text-xs text-emerald-400">
                Installed — run <code className="font-mono">hq modules sync</code> to sync locally.
              </span>
              <button
                onClick={handleUninstall}
                className="text-xs text-neutral-500 hover:text-red-400 transition-colors underline"
              >
                Uninstall
              </button>
            </>
          )}
          {installState === "already" && (
            <>
              <button
                disabled
                className="rounded-md bg-neutral-800 px-4 py-1.5 text-xs font-medium text-neutral-500 cursor-not-allowed"
              >
                Already Installed
              </button>
              <button
                onClick={handleUninstall}
                className="text-xs text-neutral-500 hover:text-red-400 transition-colors underline"
              >
                Uninstall
              </button>
            </>
          )}
          {installState === "uninstalling" && (
            <span className="text-xs text-neutral-500">Removing...</span>
          )}
          {installState === "error" && (
            <>
              <button
                onClick={handleInstall}
                className="rounded-md bg-white px-4 py-1.5 text-xs font-medium text-black hover:bg-neutral-200 transition-colors"
              >
                Retry Install
              </button>
              <span className="text-xs text-red-400">{installError}</span>
            </>
          )}
        </div>
      </div>

      {/* Dependencies */}
      {pkg.dependencies && pkg.dependencies.length > 0 && (
        <div className="mb-6">
          <div className="text-xs font-medium uppercase tracking-wider text-neutral-500 mb-2">
            Dependencies
          </div>
          <div className="flex flex-wrap gap-1.5">
            {pkg.dependencies.map((dep) => (
              <span
                key={dep}
                className="rounded bg-neutral-800 px-1.5 py-0.5 text-xs text-neutral-400"
              >
                {dep}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* README */}
      {pkg.readme && (
        <div className="mt-6 border-t border-neutral-800 pt-6">
          <div className="text-xs font-medium uppercase tracking-wider text-neutral-500 mb-4">
            README
          </div>
          <article className="prose prose-invert prose-sm max-w-none">
            <ReactMarkdown>{pkg.readme}</ReactMarkdown>
          </article>
        </div>
      )}
    </div>
  );
}

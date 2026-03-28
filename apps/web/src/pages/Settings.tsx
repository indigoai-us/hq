import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";

export function Settings() {
  const { signOut } = useAuth();

  return (
    <div className="max-w-2xl mx-auto p-6">
      <header className="flex items-center gap-4 mb-8">
        <Link to="/" className="text-neutral-500 hover:text-white text-sm">HQ</Link>
        <span className="text-neutral-700">/</span>
        <span className="text-sm text-neutral-300">Settings</span>
      </header>

      <div className="space-y-6">
        <section>
          <h2 className="text-sm font-medium text-neutral-400 mb-3">Account</h2>
          <button
            onClick={signOut}
            className="px-4 py-2 text-sm bg-neutral-900 border border-neutral-800 rounded hover:bg-neutral-800"
          >
            Sign Out
          </button>
        </section>

        <section>
          <h2 className="text-sm font-medium text-neutral-400 mb-3">About</h2>
          <div className="text-sm text-neutral-500 space-y-1">
            <p>HQ v5.0.0</p>
            <p>
              <a
                href="https://github.com/indigoai-us/hq"
                className="underline hover:text-white"
                target="_blank"
                rel="noopener"
              >
                GitHub
              </a>
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}

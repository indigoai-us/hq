import { useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";

const NAV_ITEMS = [
  { path: "/", label: "Dashboard", icon: "◫" },
  { path: "/files", label: "Files", icon: "◰" },
  { path: "/workers", label: "Workers", icon: "⚙" },
  { path: "/projects", label: "Projects", icon: "▦" },
  { path: "/team", label: "Team", icon: "◉" },
  { path: "/agents", label: "Agents", icon: "▸" },
  { path: "/marketplace", label: "Marketplace", icon: "▣" },
  { path: "/settings", label: "Settings", icon: "⚙" },
];

export function Layout() {
  const { signOut } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isActive = (path: string) => {
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  };

  return (
    <div className="flex h-screen bg-black text-white">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-56 flex-col border-r border-neutral-800 bg-neutral-950 transition-transform md:static md:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Brand */}
        <div className="flex h-14 items-center gap-2 border-b border-neutral-800 px-4">
          <span className="text-sm font-bold tracking-tight">HQ by Indigo</span>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-2 py-3">
          {NAV_ITEMS.map(({ path, label, icon }) => (
            <Link
              key={path}
              to={path}
              onClick={() => setSidebarOpen(false)}
              className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${
                isActive(path)
                  ? "bg-neutral-800 text-white font-medium"
                  : "text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200"
              }`}
            >
              <span className="w-4 text-center text-xs">{icon}</span>
              {label}
            </Link>
          ))}
        </nav>

        {/* Sign out */}
        <div className="border-t border-neutral-800 p-3">
          <button
            onClick={signOut}
            className="w-full rounded-md px-3 py-2 text-left text-sm text-neutral-500 hover:bg-neutral-900 hover:text-neutral-300 transition-colors"
          >
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Mobile header */}
        <header className="flex h-14 items-center border-b border-neutral-800 px-4 md:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="mr-3 text-neutral-400 hover:text-white"
            aria-label="Open menu"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="text-sm font-bold">HQ by Indigo</span>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

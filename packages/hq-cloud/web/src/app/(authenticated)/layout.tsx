"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { useOnboarding } from "@/hooks/useOnboarding";
import { UserButton } from "@clerk/nextjs";
import { BrandHeader } from "@/components/BrandHeader";

const navItems = [
  { href: "/agents", label: "Sessions", emoji: "\u{1F4AC}" },
  { href: "/navigator", label: "Navigator", emoji: "\u{1F4C1}" },
];

export default function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isLoading } = useAuth();
  const { isChecking, isOnboarded } = useOnboarding();
  const pathname = usePathname();
  const router = useRouter();

  // Redirect to setup if not onboarded (skip if already on /setup)
  useEffect(() => {
    if (!isLoading && !isChecking && !isOnboarded && pathname !== "/setup") {
      router.replace("/setup");
    }
  }, [isLoading, isChecking, isOnboarded, pathname, router]);

  if (isLoading || isChecking) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-bg-primary">
        <div className="text-text-secondary text-sm">Loading...</div>
      </div>
    );
  }

  // Block rendering children while redirecting to setup
  if (!isOnboarded && pathname !== "/setup") {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-bg-primary">
        <div className="text-text-secondary text-sm">Redirecting to setup...</div>
      </div>
    );
  }

  // Setup page gets a clean full-screen layout (no sidebar)
  if (pathname === "/setup") {
    return <>{children}</>;
  }

  return (
    <div className="min-h-dvh flex flex-col lg:flex-row bg-bg-primary">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-16 hover:w-64 group/sidebar transition-all border-r border-border-subtle bg-bg-secondary">
        <div className="p-3 border-b border-border-subtle">
          <span className="text-lg font-bold text-text-primary">HQ</span>
          <span className="text-lg font-bold text-text-primary hidden group-hover/sidebar:inline"> Cloud</span>
        </div>

        <nav className="flex-1 py-2">
          {navItems.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`
                  flex items-center gap-3 px-4 py-3 transition-colors
                  ${active ? "bg-overlay-light text-text-primary" : "text-text-secondary hover:text-text-primary hover:bg-overlay-light"}
                `}
              >
                <span className="text-lg">{item.emoji}</span>
                <span className="text-sm hidden group-hover/sidebar:block">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-border-subtle py-2">
          <Link
            href="/settings/account"
            className="flex items-center gap-3 px-4 py-3 text-text-secondary hover:text-text-primary hover:bg-overlay-light transition-colors"
          >
            <span className="text-lg">{"\u2699\uFE0F"}</span>
            <span className="text-sm hidden group-hover/sidebar:block">Settings</span>
          </Link>
          <div className="flex items-center gap-3 px-4 py-3">
            <UserButton
              appearance={{
                elements: {
                  avatarBox: "w-7 h-7",
                },
              }}
            />
            <span className="text-sm text-text-secondary hidden group-hover/sidebar:block">Account</span>
          </div>
        </div>
      </aside>

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Mobile header */}
        <div className="lg:hidden">
          <BrandHeader />
        </div>

        {/* Page content */}
        <main className="flex-1 overflow-auto pb-16 lg:pb-0">
          {children}
        </main>

        {/* Mobile bottom tabs */}
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 flex bg-bg-secondary border-t border-border-subtle safe-area-pb">
          {navItems.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`
                  flex-1 flex flex-col items-center py-2 gap-0.5 transition-colors
                  ${active ? "text-text-primary" : "text-text-tertiary"}
                `}
              >
                <span className="text-lg">{item.emoji}</span>
                <span className="text-[10px] font-medium">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

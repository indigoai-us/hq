"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";

const settingsTabs = [
  { href: "/settings/account", label: "Account" },
  { href: "/settings/claude-token", label: "Claude Token" },
  { href: "/settings/notifications", label: "Notifications" },
];

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div>
      {/* Sub-nav tabs */}
      <div className="border-b border-border-subtle px-4">
        <div className="flex gap-4">
          {settingsTabs.map((tab) => {
            const active = pathname === tab.href;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`
                  py-3 text-sm font-medium border-b-2 transition-colors
                  ${active
                    ? "border-accent-blue text-text-primary"
                    : "border-transparent text-text-tertiary hover:text-text-secondary"}
                `}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>
      </div>

      {children}
    </div>
  );
}

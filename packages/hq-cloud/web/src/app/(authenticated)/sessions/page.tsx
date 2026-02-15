"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Redirect /sessions to /agents for navigation consistency.
 * The session list view lives at /agents.
 */
export default function SessionsRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/agents");
  }, [router]);

  return (
    <div className="flex items-center justify-center h-64">
      <span className="text-text-secondary text-sm">Redirecting...</span>
    </div>
  );
}

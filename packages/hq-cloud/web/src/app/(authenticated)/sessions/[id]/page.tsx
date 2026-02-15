"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

/**
 * Redirect /sessions/:id to /agents/:id for navigation consistency.
 * The session detail view lives at /agents/:id.
 */
export default function SessionDetailRedirectPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.id as string;

  useEffect(() => {
    router.replace(`/agents/${sessionId}`);
  }, [router, sessionId]);

  return (
    <div className="flex items-center justify-center h-64">
      <span className="text-text-secondary text-sm">Redirecting...</span>
    </div>
  );
}

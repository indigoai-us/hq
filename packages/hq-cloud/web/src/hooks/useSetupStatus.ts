"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { checkSetupStatus } from "@/services/settings";
import { useAuth } from "@/contexts/AuthContext";
import type { SetupStatusResponse } from "@/types/settings";

interface UseSetupStatusResult {
  /** Whether the setup status check is still loading */
  isLoading: boolean;
  /** Whether initial file sync has been completed */
  setupComplete: boolean;
  /** The user's S3 prefix (null if not provisioned) */
  s3Prefix: string | null;
  /** Number of files in S3 */
  fileCount: number;
  /** The user's configured HQ root path (null if not set) */
  hqRoot: string | null;
  /** Re-check setup status (e.g., after sync completes) */
  recheck: () => Promise<void>;
}

/**
 * Hook to check whether the authenticated user has completed initial HQ file sync.
 *
 * Calls GET /api/auth/setup-status once after authentication.
 * Result is cached in React state for the session -- navigation between
 * pages does NOT trigger additional API calls.
 *
 * The banner dismissal is session-scoped via sessionStorage. It reappears
 * on next login (new session) if setup is still incomplete.
 */
export function useSetupStatus(): UseSetupStatusResult {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [status, setStatus] = useState<SetupStatusResponse>({
    setupComplete: false,
    s3Prefix: null,
    fileCount: 0,
    hqRoot: null,
  });

  // Prevent duplicate fetches (React strict mode, fast re-renders)
  const fetchedRef = useRef(false);

  const check = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const result = await checkSetupStatus();
      setStatus(result);
    } catch (err) {
      // On auth errors, leave setupComplete false (user needs to re-auth).
      // On non-auth errors (network, server), assume setup is complete
      // to avoid blocking users when the backend is temporarily down.
      const message = err instanceof Error ? err.message : "";
      const isAuthError =
        message.includes("Not authenticated") ||
        message.includes("401") ||
        message.includes("Bearer token");

      if (!isAuthError) {
        setStatus({ setupComplete: true, s3Prefix: null, fileCount: 0, hqRoot: null });
      }
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      setIsLoading(false);
      return;
    }
    // Only fetch once per mount cycle
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    void check();
  }, [authLoading, isAuthenticated, check]);

  const recheck = useCallback(async () => {
    fetchedRef.current = false;
    setIsLoading(true);
    await check();
  }, [check]);

  return {
    isLoading,
    setupComplete: status.setupComplete,
    s3Prefix: status.s3Prefix,
    fileCount: status.fileCount,
    hqRoot: status.hqRoot,
    recheck,
  };
}

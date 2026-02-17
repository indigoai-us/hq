"use client";

import { useState, useEffect, useCallback } from "react";
import { checkOnboardingStatus } from "@/services/settings";
import { useAuth } from "@/contexts/AuthContext";

interface UseOnboardingResult {
  /** Whether the onboarding check is still loading */
  isChecking: boolean;
  /** Whether the user has completed onboarding */
  isOnboarded: boolean;
  /** Re-check onboarding status (e.g., after setup completes) */
  recheck: () => Promise<void>;
}

export function useOnboarding(): UseOnboardingResult {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [isChecking, setIsChecking] = useState(true);
  const [isOnboarded, setIsOnboarded] = useState(false);

  const check = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const result = await checkOnboardingStatus();
      setIsOnboarded(result.onboarded);
    } catch (err) {
      // Auth errors should NOT default to onboarded — the user needs to
      // re-authenticate. Only assume onboarded for non-auth failures
      // (e.g., MongoDB down, network error).
      const message = err instanceof Error ? err.message : "";
      const isAuthError =
        message.includes("Not authenticated") ||
        message.includes("401") ||
        message.includes("Bearer token");
      if (isAuthError) {
        setIsOnboarded(false);
      } else {
        // Non-auth failure (MongoDB, etc.) — assume onboarded to avoid
        // blocking users when backend infra has issues
        setIsOnboarded(true);
      }
    } finally {
      setIsChecking(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      setIsChecking(false);
      return;
    }
    void check();
  }, [authLoading, isAuthenticated, check]);

  return { isChecking, isOnboarded, recheck: check };
}

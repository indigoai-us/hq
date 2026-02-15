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
    } catch {
      // If the check fails (e.g., no MongoDB), assume onboarded
      setIsOnboarded(true);
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

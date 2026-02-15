"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
} from "react";
import {
  useAuth as useClerkAuth,
  useUser as useClerkUser,
} from "@clerk/nextjs";
import { setTokenGetter } from "@/lib/api-client";

interface AuthUser {
  id: string;
  email: string | null;
  firstName: string | null;
  imageUrl: string | null;
}

interface AuthContextValue {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: AuthUser | null;
  getToken: () => Promise<string | null>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { isSignedIn, isLoaded, getToken, signOut } = useClerkAuth();
  const { user: clerkUser } = useClerkUser();

  // Set the token getter for api-client on mount / when auth state changes
  useEffect(() => {
    if (isSignedIn) {
      setTokenGetter(() => getToken());
    } else {
      setTokenGetter(null);
    }
    return () => {
      setTokenGetter(null);
    };
  }, [isSignedIn, getToken]);

  const user = useMemo<AuthUser | null>(() => {
    if (!clerkUser) return null;
    return {
      id: clerkUser.id,
      email: clerkUser.primaryEmailAddress?.emailAddress ?? null,
      firstName: clerkUser.firstName,
      imageUrl: clerkUser.imageUrl,
    };
  }, [clerkUser]);

  const logout = useCallback(async () => {
    await signOut();
  }, [signOut]);

  const value = useMemo<AuthContextValue>(
    () => ({
      isAuthenticated: isLoaded && !!isSignedIn,
      isLoading: !isLoaded,
      user,
      getToken,
      logout,
    }),
    [isLoaded, isSignedIn, user, getToken, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

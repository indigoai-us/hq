/**
 * AuthContext - Provides authentication state and actions throughout the app.
 * Handles auto-login on mount, login, logout, and error state.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { login as authLogin, logout as authLogout, tryAutoLogin } from "../services/auth";

interface AuthContextValue {
  /** Whether the user is authenticated */
  isAuthenticated: boolean;
  /** Whether auth state is being determined (initial load / auto-login) */
  isLoading: boolean;
  /** Current error message, if any */
  error: string | null;
  /** Log in with an API key */
  login: (apiKey: string) => Promise<void>;
  /** Log out and clear stored credentials */
  logout: () => Promise<void>;
  /** Clear the current error */
  clearError: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

interface AuthProviderProps {
  children: React.ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps): React.JSX.Element {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Auto-login on app launch
  useEffect(() => {
    let mounted = true;

    async function attemptAutoLogin(): Promise<void> {
      try {
        const success = await tryAutoLogin();
        if (mounted) {
          setIsAuthenticated(success);
        }
      } catch (_err: unknown) {
        // Auto-login failed silently - user will see login screen
        if (mounted) {
          setIsAuthenticated(false);
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    void attemptAutoLogin();

    return () => {
      mounted = false;
    };
  }, []);

  const login = useCallback(async (apiKey: string): Promise<void> => {
    setError(null);
    setIsLoading(true);
    try {
      await authLogin(apiKey);
      setIsAuthenticated(true);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Login failed. Please try again.";
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    setError(null);
    try {
      await authLogout();
      setIsAuthenticated(false);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Logout failed. Please try again.";
      setError(message);
    }
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      isAuthenticated,
      isLoading,
      error,
      login,
      logout,
      clearError,
    }),
    [isAuthenticated, isLoading, error, login, logout, clearError],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Hook to access auth context. Must be used within AuthProvider.
 */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

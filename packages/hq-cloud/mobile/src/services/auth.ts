/**
 * Authentication service for HQ Cloud Mobile.
 * Handles API key validation, storage, and session management.
 */
import { getApiKey, setApiKey, removeApiKey, getApiUrl } from "./api";

export interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

export interface ValidateKeyResponse {
  valid: boolean;
  user?: {
    id: string;
    name: string;
  };
}

/**
 * Check if an API key is currently stored (for auto-login).
 */
export async function hasStoredApiKey(): Promise<boolean> {
  const key = await getApiKey();
  return key !== null && key.length > 0;
}

/**
 * Validate an API key against the server.
 * Returns true if the key is valid, throws on network/server errors.
 */
export async function validateApiKey(apiKey: string): Promise<boolean> {
  if (!apiKey || apiKey.trim().length === 0) {
    throw new Error("API key cannot be empty.");
  }

  const baseUrl = await getApiUrl();

  const response = await fetch(`${baseUrl}/api/auth/validate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey.trim()}`,
    },
  });

  if (response.status === 401 || response.status === 403) {
    return false;
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Server error (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as ValidateKeyResponse;
  return data.valid === true;
}

/**
 * Log in with an API key.
 * Validates the key, then stores it securely if valid.
 */
export async function login(apiKey: string): Promise<void> {
  const isValid = await validateApiKey(apiKey);

  if (!isValid) {
    throw new Error("Invalid API key. Please check your key and try again.");
  }

  await setApiKey(apiKey.trim());
}

/**
 * Log out by removing the stored API key.
 */
export async function logout(): Promise<void> {
  await removeApiKey();
}

/**
 * Attempt auto-login by checking for a stored key and validating it.
 * Returns true if auto-login succeeded, false if no key or key is invalid.
 * Silently removes invalid stored keys.
 */
export async function tryAutoLogin(): Promise<boolean> {
  const storedKey = await getApiKey();

  if (!storedKey || storedKey.length === 0) {
    return false;
  }

  try {
    const isValid = await validateApiKey(storedKey);
    if (!isValid) {
      // Stored key is no longer valid - clean it up
      await removeApiKey();
      return false;
    }
    return true;
  } catch (_error: unknown) {
    // Network error during validation - keep the key, assume valid
    // User will get an auth error on actual API calls if key is bad
    return true;
  }
}

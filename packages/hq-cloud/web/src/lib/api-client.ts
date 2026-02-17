import { getApiUrl } from "./storage";

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  body?: unknown;
  headers?: Record<string, string>;
}

/**
 * Token getter function, set by AuthContext on mount.
 * Returns a Clerk JWT for API authentication.
 */
let tokenGetter: (() => Promise<string | null>) | null = null;

export function setTokenGetter(fn: (() => Promise<string | null>) | null): void {
  tokenGetter = fn;
}

export async function getToken(): Promise<string | null> {
  return tokenGetter ? tokenGetter() : null;
}

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const token = tokenGetter ? await tokenGetter() : null;
  const baseUrl = getApiUrl();

  if (!token) {
    throw new Error("Not authenticated. Please sign in.");
  }

  const { method = "GET", body, headers = {} } = options;

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorText = await response.text();

    // Try to parse structured error from API
    let errorMessage = `API error ${response.status}`;
    try {
      const errorBody = JSON.parse(errorText) as {
        code?: string;
        message?: string;
        error?: string;
      };

      // Redirect to setup when API says setup is required
      if (
        response.status === 403 &&
        errorBody.code === "SETUP_REQUIRED" &&
        typeof window !== "undefined"
      ) {
        window.location.href = "/setup";
        throw new Error("Setup required — redirecting...");
      }

      // Use the API's message field for cleaner display
      errorMessage = errorBody.message || errorBody.error || errorMessage;
    } catch (e) {
      if (e instanceof Error && e.message.includes("redirecting")) throw e;
      // JSON parse failed — use raw text if short enough
      if (errorText.length < 200) {
        errorMessage = errorText || errorMessage;
      }
    }

    throw new Error(errorMessage);
  }

  return response.json() as Promise<T>;
}

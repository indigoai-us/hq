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

    // Redirect to setup when API says setup is required
    if (response.status === 403) {
      try {
        const errorBody = JSON.parse(errorText);
        if (errorBody.code === "SETUP_REQUIRED" && typeof window !== "undefined") {
          window.location.href = "/setup";
          throw new Error("Setup required — redirecting...");
        }
      } catch (e) {
        if (e instanceof Error && e.message.includes("redirecting")) throw e;
        // JSON parse failed — fall through to generic error
      }
    }

    throw new Error(`API error ${response.status}: ${errorText}`);
  }

  return response.json() as Promise<T>;
}

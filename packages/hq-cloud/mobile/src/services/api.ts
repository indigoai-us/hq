/**
 * HQ Cloud API client.
 * Handles communication with the HQ Cloud API.
 */
import * as SecureStore from "expo-secure-store";

const API_KEY_STORAGE_KEY = "hq_cloud_api_key";
const API_BASE_URL_KEY = "hq_cloud_api_url";

const DEFAULT_API_URL = "http://localhost:3000";

export async function getApiKey(): Promise<string | null> {
  return SecureStore.getItemAsync(API_KEY_STORAGE_KEY);
}

export async function setApiKey(key: string): Promise<void> {
  await SecureStore.setItemAsync(API_KEY_STORAGE_KEY, key);
}

export async function removeApiKey(): Promise<void> {
  await SecureStore.deleteItemAsync(API_KEY_STORAGE_KEY);
}

export async function getApiUrl(): Promise<string> {
  const url = await SecureStore.getItemAsync(API_BASE_URL_KEY);
  return url ?? DEFAULT_API_URL;
}

export async function setApiUrl(url: string): Promise<void> {
  await SecureStore.setItemAsync(API_BASE_URL_KEY, url);
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  body?: unknown;
  headers?: Record<string, string>;
}

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const [apiKey, baseUrl] = await Promise.all([getApiKey(), getApiUrl()]);

  if (!apiKey) {
    throw new Error("Not authenticated. Please log in.");
  }

  const { method = "GET", body, headers = {} } = options;

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API error ${response.status}: ${errorText}`);
  }

  return response.json() as Promise<T>;
}

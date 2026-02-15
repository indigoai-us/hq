const API_BASE_URL_KEY = "hq_cloud_api_url";

const DEFAULT_API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export function getApiUrl(): string {
  if (typeof window === "undefined") return DEFAULT_API_URL;
  return localStorage.getItem(API_BASE_URL_KEY) ?? DEFAULT_API_URL;
}

export function setApiUrl(url: string): void {
  localStorage.setItem(API_BASE_URL_KEY, url);
}

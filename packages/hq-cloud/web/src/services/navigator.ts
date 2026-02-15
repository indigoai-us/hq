import { apiRequest } from "@/lib/api-client";
import type { NavigatorTreeResponse } from "@/types/navigator";

export async function fetchNavigatorTree(): Promise<NavigatorTreeResponse> {
  return apiRequest<NavigatorTreeResponse>("/api/navigator/tree");
}

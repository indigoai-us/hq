/**
 * Navigator service - API calls for fetching the HQ semantic tree.
 * Returns a hierarchical tree organized by Companies > Projects > Workers/Knowledge.
 */
import { apiRequest } from "./api";
import type { NavigatorTreeResponse } from "../types";

/**
 * Fetch the full navigator tree from the API.
 * The tree is pre-organized into semantic groupings (Companies, Standalone Projects).
 */
export async function fetchNavigatorTree(): Promise<NavigatorTreeResponse> {
  return apiRequest<NavigatorTreeResponse>("/api/navigator/tree");
}

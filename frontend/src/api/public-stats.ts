import { apiRequest } from "./auth";
import type { components } from "./generated";

export type PublicStats = components["schemas"]["LandingStats"];

export async function fetchPublicStats(
  signal?: AbortSignal,
): Promise<PublicStats> {
  try {
    return await apiRequest<PublicStats>("/api/v1/public/stats", { signal });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error("公开统计暂时不可用");
  }
}

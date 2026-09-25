"use client";

import { AiVisibilitySummarySchema, type AiRange } from "@seo-geo/contracts";
import { useQuery } from "@tanstack/react-query";

import { apiGet } from "@/lib/api";
import { useWorkspace } from "@/lib/workspace-context";

export type AiDays = AiRange;

export function aiBase(workspaceId: string, projectId: string): string {
  return `/workspaces/${workspaceId}/projects/${projectId}/ai-visibility`;
}

/** The AI visibility summary; refreshed while answers are being collected. */
export function useAiSummary(projectId: string | null, days: AiDays) {
  const { workspace } = useWorkspace();
  return useQuery({
    queryKey: ["ai-visibility", projectId, "summary", days],
    queryFn: ({ signal }) =>
      apiGet(`${aiBase(workspace.id, projectId ?? "")}?days=${days}`, AiVisibilitySummarySchema, {
        signal,
      }),
    enabled: projectId !== null,
    refetchInterval: (query) => (query.state.data?.pendingRuns ? 20_000 : false),
  });
}

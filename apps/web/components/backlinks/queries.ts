/** A project's backlink profile (state and report). */
export function backlinksKey(projectId: string) {
  return ["backlinks", projectId] as const;
}

/** Its comparison with competitors; invalidating {@link backlinksKey} refreshes both. */
export function backlinkCompetitorsKey(projectId: string) {
  return ["backlinks", projectId, "competitors"] as const;
}

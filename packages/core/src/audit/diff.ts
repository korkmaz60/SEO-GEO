export interface IssueRef {
  code: string;
  /** `null` for site-wide issues. */
  url: string | null;
}

export interface IssueChange {
  /** In this run but not the previous one. */
  new: number;
  /** In the previous run but not this one. */
  fixed: number;
  persisting: number;
}

/** Compares the issues of two runs by code and page, per issue code. */
export function diffIssues(
  previous: readonly IssueRef[],
  current: readonly IssueRef[],
): Map<string, IssueChange> {
  const key = (issue: IssueRef) => `${issue.code}\u0000${issue.url ?? ""}`;
  const before = new Set(previous.map(key));
  const after = new Set(current.map(key));
  const changes = new Map<string, IssueChange>();
  const entry = (code: string) => {
    let change = changes.get(code);
    if (!change) {
      change = { new: 0, fixed: 0, persisting: 0 };
      changes.set(code, change);
    }
    return change;
  };
  for (const issue of current) {
    if (before.has(key(issue))) entry(issue.code).persisting++;
    else entry(issue.code).new++;
  }
  for (const issue of previous) {
    if (!after.has(key(issue))) entry(issue.code).fixed++;
  }
  return changes;
}

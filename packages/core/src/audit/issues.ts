export {
  ISSUE_CATALOG,
  ISSUE_CODES,
  isIssueCode,
  issueSeverity,
  type IssueCategory,
  type IssueCode,
  type IssueSeverity,
} from "@seo-geo/contracts";

import type { IssueCode } from "@seo-geo/contracts";

export type IssueData = Record<string, string | number | boolean | string[]>;

export interface AuditIssue {
  code: IssueCode;
  /** The affected page; `null` for site-wide issues. */
  url: string | null;
  data?: IssueData;
}

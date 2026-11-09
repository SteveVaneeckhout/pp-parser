export type IssueLevel = "error" | "warning";

export type IssueCode =
  // Errors: browsers ignore the whole header, a feature or an allowlist member.
  | "empty-input"
  | "invalid-characters"
  | "syntax-error"
  | "empty-member"
  | "quoted-keyword"
  | "feature-policy-syntax"
  | "semicolon-separator"
  | "missing-comma"
  | "header-name-in-value"
  | "quoted-value"
  | "missing-equals"
  | "whitespace-around-equals"
  | "invalid-feature-name"
  | "unquoted-origin"
  | "missing-parentheses"
  | "unknown-feature"
  | "invalid-allowlist-member"
  | "invalid-origin"
  | "src-in-header"
  // Warnings: the header works, but probably not as intended.
  | "obsolete-feature"
  | "duplicate-feature"
  | "missing-allowlist"
  | "wildcard-allowlist"
  | "redundant-allowlist-member"
  | "origin-has-path"
  | "insecure-origin"
  | "unknown-parameter"
  | "invalid-report-to";

export type FeatureStatus =
  | "standard"
  | "proposed"
  | "experimental"
  | "client-hint"
  | "obsolete"
  | "unknown";

export interface Issue {
  readonly code: IssueCode;
  readonly level: IssueLevel;
  readonly message: string;
  readonly feature?: string;
  readonly member?: string;
  /** Offset into the input where the problem starts. */
  readonly position?: number;
}

export type AllowlistMemberKind = "all" | "self" | "src" | "origin" | "invalid";

export interface ParsedAllowlistMember {
  /** The member as written, including any parameters. */
  readonly raw: string;
  readonly kind: AllowlistMemberKind;
  /** For kind "origin": the serialized origin a browser matches, e.g. "https://example.com" or "https://*.example.com". */
  readonly origin?: string;
  /** For kind "origin": true for a wildcard-subdomain origin ("https://*.example.com"). */
  readonly wildcard?: boolean;
}

/** What a browser ends up with: nobody, every origin, or the listed origins (and/or self). */
export type Allowlist = "none" | "all" | "list";

export interface ParsedFeature {
  readonly name: string;
  readonly status: FeatureStatus;
  /** The dictionary member as written, e.g. `camera=(self "https://example.com")`. */
  readonly raw: string;
  readonly position: number;
  readonly allowlist: Allowlist;
  readonly self: boolean;
  /** Serialized origins a browser allows besides self (deduplicated, in order). */
  readonly origins: readonly string[];
  readonly members: readonly ParsedAllowlistMember[];
  /** The `report-to` parameter: the reporting endpoint for violations. */
  readonly reportTo?: string;
}

export interface ParseResult {
  /** One entry per feature in header order; for a repeated feature the last value wins. */
  readonly features: readonly ParsedFeature[];
  /** True when the header is not a valid Structured Field dictionary, so browsers ignore all of it. */
  readonly ignoredByBrowsers: boolean;
  readonly errors: readonly Issue[];
  readonly warnings: readonly Issue[];
}

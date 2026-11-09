import type { Item } from "./structured-field.js";
import type { Issue, ParsedAllowlistMember } from "./types.js";

export interface ClassifiedMember {
  readonly member: ParsedAllowlistMember;
  readonly issues: readonly Issue[];
}

const WILDCARD_RE = /^([a-z][a-z0-9+.-]*:\/\/)\*\.(.+)$/i;
const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;

// Keywords written as strings: "self", "'none'" … Maps the lowercased string to a fix.
const STRING_KEYWORD_FIXES: ReadonlyMap<string, string> = new Map([
  ["self", "write the token self without quotes"],
  ["'self'", "write the token self without quotes"],
  ["*", "write the token * without quotes"],
  ["'*'", "write the token * without quotes"],
  ["none", "write an empty list () to disable the feature"],
  ["'none'", "write an empty list () to disable the feature"],
  ["src", "src only applies to an iframe allow attribute"],
  ["'src'", "src only applies to an iframe allow attribute"],
]);

function issue(
  code: Issue["code"],
  level: Issue["level"],
  message: string,
  feature: string,
  item: Item,
  raw: string,
): Issue {
  return { code, level, message, feature, member: raw, position: item.start };
}

function classifyOrigin(value: string, feature: string, item: Item, raw: string): ClassifiedMember {
  const invalid = (reason: string): ClassifiedMember => ({
    member: { raw, kind: "invalid" },
    issues: [
      issue(
        "invalid-origin",
        "error",
        `Allowlist member ${raw} in "${feature}" ${reason}; browsers skip it.`,
        feature,
        item,
        raw,
      ),
    ],
  });

  const keywordFix = STRING_KEYWORD_FIXES.get(value.toLowerCase());
  if (keywordFix !== undefined) {
    return invalid(`is a quoted string, not a keyword (${keywordFix})`);
  }

  const wildcard = WILDCARD_RE.exec(value);
  const candidate = wildcard ? `${wildcard[1]}${wildcard[2]}` : value;
  if (!URL.canParse(candidate)) {
    return invalid(
      SCHEME_RE.test(value)
        ? "is not a valid URL"
        : 'is not a valid origin; it needs a scheme, as in "https://example.com"',
    );
  }
  const url = new URL(candidate);
  if (url.origin === "null") {
    return invalid(`has an opaque origin (${url.protocol} URLs), which matches nothing`);
  }
  if (url.hostname.includes("*")) {
    return invalid(
      'puts the wildcard in the wrong place; only a leading "*." label is allowed, as in "https://*.example.com"',
    );
  }

  const origin = wildcard ? `${url.protocol}//*.${url.host}` : url.origin;
  const issues: Issue[] = [];
  if (url.pathname !== "/" || url.search !== "" || url.hash !== "") {
    issues.push(
      issue(
        "origin-has-path",
        "warning",
        `Allowlist member ${raw} in "${feature}" has a path, query or fragment; browsers only use its origin, ${origin}.`,
        feature,
        item,
        raw,
      ),
    );
  }
  if (url.protocol === "http:") {
    issues.push(
      issue(
        "insecure-origin",
        "warning",
        `Allowlist member ${raw} in "${feature}" is a plain-HTTP origin.`,
        feature,
        item,
        raw,
      ),
    );
  }
  const member: ParsedAllowlistMember = wildcard
    ? { raw, kind: "origin", origin, wildcard: true }
    : { raw, kind: "origin", origin };
  return { member, issues };
}

/** Classifies one allowlist member: `*`, `self`, `src`, an origin string, or something invalid. */
export function classifyMember(item: Item, input: string, feature: string): ClassifiedMember {
  const raw = input.slice(item.start, item.end);
  const value = item.value;

  if (value.type === "string") {
    return classifyOrigin(value.value, feature, item, raw);
  }

  if (value.type === "token") {
    if (value.value === "*") {
      return { member: { raw, kind: "all" }, issues: [] };
    }
    if (value.value === "self") {
      return { member: { raw, kind: "self" }, issues: [] };
    }
    if (value.value === "src") {
      return {
        member: { raw, kind: "src" },
        issues: [
          issue(
            "src-in-header",
            "error",
            `"src" in "${feature}" only applies to an iframe allow attribute; the header ignores it.`,
            feature,
            item,
            raw,
          ),
        ],
      };
    }
  }

  let hint = 'use *, self or a quoted origin such as "https://example.com"';
  if (value.type === "token") {
    const lower = value.value.toLowerCase();
    if (lower === "none") {
      hint = "write an empty list () to disable the feature";
    } else if (lower === "self" || lower === "src") {
      hint = `tokens are case-sensitive; write ${lower}`;
    }
  }
  return {
    member: { raw, kind: "invalid" },
    issues: [
      issue(
        "invalid-allowlist-member",
        "error",
        `Allowlist member ${raw} in "${feature}" is not valid (${hint}); browsers skip it.`,
        feature,
        item,
        raw,
      ),
    ],
  };
}

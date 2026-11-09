import { parseDictionary, type DictionaryEntry } from "./structured-field.js";
import type { Issue } from "./types.js";

export interface Diagnosis {
  /** Members recovered by parsing each top-level member on its own. */
  readonly entries: readonly DictionaryEntry[];
  /** Hints that explain why the header failed to parse. */
  readonly issues: readonly Issue[];
}

export interface Range {
  readonly start: number;
  readonly end: number;
}

const STRING_RE = /"(?:[^"\\]|\\.)*"?/g;
const FEATURE_POLICY_RE = /^[A-Za-z][\w-]*\s+(?:'|\*|https?:|self\b|none\b)/;
const QUOTED_KEYWORD_RE = /'(self|none|src|\*)'/gi;
const SEMICOLON_RE = /;\s*(?!report-to\s*=)[A-Za-z][\w-]*\s*=/;
const TRAILING_SEMICOLON_RE = /;\s*$/;
const KEY_RE = /^([^=\s;(,]+)\s*=/;
const VALID_KEY_RE = /^[a-z*][a-z0-9_\-.*]*$/;
const UNQUOTED_ORIGIN_RE = /(?:^|[\s(=])(?:https?:\/\/|\*\.)/i;
const SINGLE_QUOTED_ORIGIN_RE = /'(?:https?:\/\/|\*\.)/i;
const MISSING_COMMA_RE = /[)\w*"]\s+[A-Za-z][\w-]*\s*=/;
const MISSING_COMMA_SPLIT_RE = /\s+(?=[A-Za-z][\w-]*\s*=)/g;
const MISSING_PARENS_RE = /=\s*[^\s(,;][^\s,;]*\s+[^\s,;]/;
const MISSING_EQUALS_RE = /^[A-Za-z][\w-]*\s*\(/;
const WHITESPACE_EQUALS_RE = /^[A-Za-z][\w-]*(?:\s+=|=\s+)/;
const HEADER_NAME_RE = /^permissions-policy\s*:\s*/i;
const OWS = new Set([" ", "\t"]);

/** Replaces the contents of every quoted string with "x", keeping offsets, so patterns don't match inside strings. */
export function maskStrings(text: string): string {
  return text.replace(STRING_RE, (m) => `"${"x".repeat(m.length - 1)}`);
}

/**
 * Splits masked text (see maskStrings) at `separator` characters outside parentheses. The ranges
 * are offsets into the original input, in which the masked text starts at `offset`.
 */
export function splitMasked(masked: string, offset: number, separator: string): Range[] {
  const ranges: Range[] = [];
  let depth = 0;
  let from = offset;
  for (let i = 0; i < masked.length; i++) {
    const c = masked[i];
    if (c === "(") {
      depth++;
    } else if (c === ")") {
      depth = Math.max(0, depth - 1);
    } else if (c === separator && depth === 0) {
      ranges.push({ start: from, end: offset + i });
      from = offset + i + 1;
    }
  }
  ranges.push({ start: from, end: offset + masked.length });
  return ranges;
}

function trim(input: string, range: Range): Range {
  let { start, end } = range;
  while (start < end && OWS.has(input[start]!)) {
    start++;
  }
  while (end > start && OWS.has(input[end - 1]!)) {
    end--;
  }
  return { start, end };
}

/** Explains why one top-level member doesn't parse. Returns no hints when no known mistake fits. */
export function hintsFor(segment: string, position: number): Issue[] {
  const masked = maskStrings(segment);
  const feature = /^[^=\s;(,]+/.exec(masked)?.[0];
  const base = feature === undefined ? { position } : { feature, position };

  if (FEATURE_POLICY_RE.test(masked) && !KEY_RE.test(masked)) {
    return [
      {
        code: "feature-policy-syntax",
        level: "error",
        message: `"${segment}" is Feature-Policy syntax. Permissions-Policy is written as name=(allowlist), for example camera=() or camera=(self "https://example.com"), with "," between features.`,
        ...base,
      },
    ];
  }

  const hints: Issue[] = [];
  const keywords = new Set([...masked.matchAll(QUOTED_KEYWORD_RE)].map((m) => m[0]));
  for (const keyword of keywords) {
    const fix =
      keyword.toLowerCase() === "'none'"
        ? "write an empty list () instead"
        : `write ${keyword.slice(1, -1).toLowerCase()} without quotes`;
    hints.push({
      code: "quoted-keyword",
      level: "error",
      message: `${keyword} is CSP / Feature-Policy syntax and not valid here; ${fix}.`,
      ...base,
    });
  }

  if (SEMICOLON_RE.test(masked)) {
    hints.push({
      code: "semicolon-separator",
      level: "error",
      message: 'Features are separated by ";"; Permissions-Policy separates them with ",".',
      ...base,
    });
  } else if (TRAILING_SEMICOLON_RE.test(masked)) {
    hints.push({
      code: "semicolon-separator",
      level: "error",
      message: 'Remove the trailing ";": it starts a parameter that has no name.',
      ...base,
    });
  }

  if (MISSING_COMMA_RE.test(masked)) {
    hints.push({
      code: "missing-comma",
      level: "error",
      message: 'Features must be separated by ",".',
      ...base,
    });
  } else if (MISSING_PARENS_RE.test(masked)) {
    hints.push({
      code: "missing-parentheses",
      level: "error",
      message: `An allowlist with more than one member must be in parentheses, as in ${feature}=(self "https://example.com").`,
      ...base,
    });
  }

  if (MISSING_EQUALS_RE.test(masked)) {
    hints.push({
      code: "missing-equals",
      level: "error",
      message: `The feature name and its allowlist must be joined by "=", as in ${feature}=().`,
      ...base,
    });
  } else if (WHITESPACE_EQUALS_RE.test(masked)) {
    hints.push({
      code: "whitespace-around-equals",
      level: "error",
      message: `Whitespace is not allowed around "=", as in ${feature}=().`,
      ...base,
    });
  }

  const key = KEY_RE.exec(masked)?.[1];
  if (key !== undefined && !VALID_KEY_RE.test(key)) {
    const lower = key.toLowerCase();
    const suggestion = VALID_KEY_RE.test(lower) ? `; write "${lower}"` : "";
    hints.push({
      code: "invalid-feature-name",
      level: "error",
      message: `Feature name "${key}" is not valid: names use lowercase letters, digits, "_", "-", "." and "*"${suggestion}.`,
      ...base,
    });
  }

  if (UNQUOTED_ORIGIN_RE.test(masked) || SINGLE_QUOTED_ORIGIN_RE.test(masked)) {
    hints.push({
      code: "unquoted-origin",
      level: "error",
      message: 'Origins must be strings in double quotes, as in (self "https://example.com").',
      ...base,
    });
  }

  return hints;
}

/** Re-reads a member that failed because of a ";" or a missing "," between features as several members. */
function recover(input: string, segment: Range, hints: readonly Issue[]): DictionaryEntry[] {
  let masked = maskStrings(input.slice(segment.start, segment.end));
  if (hints.some((h) => h.code === "semicolon-separator")) {
    masked = masked.replaceAll(";", ",");
  }
  if (hints.some((h) => h.code === "missing-comma")) {
    masked = masked.replace(MISSING_COMMA_SPLIT_RE, (m) => `,${" ".repeat(m.length - 1)}`);
  }
  const entries: DictionaryEntry[] = [];
  for (const piece of splitMasked(masked, segment.start, ",")) {
    const trimmed = trim(input, piece);
    const result = parseDictionary(input, trimmed.start, trimmed.end);
    if (result.ok) {
      entries.push(...result.entries);
    }
  }
  return entries;
}

/**
 * Called when the whole header fails to parse. Parses each top-level member on its own so the
 * features can still be reported, and explains each member that fails.
 */
export function diagnose(input: string, start: number, end: number): Diagnosis {
  const entries: DictionaryEntry[] = [];
  const issues: Issue[] = [];

  const headerName = HEADER_NAME_RE.exec(input.slice(start, end));
  if (headerName) {
    issues.push({
      code: "header-name-in-value",
      level: "error",
      message: 'The value starts with the header name "Permissions-Policy:"; send only the policy.',
      position: start,
    });
    start += headerName[0].length;
  }

  if (end - start >= 2 && input[start] === '"' && input[end - 1] === '"') {
    issues.push({
      code: "quoted-value",
      level: "error",
      message: "The whole value is wrapped in double quotes; send the policy without them.",
      position: start,
    });
    start++;
    end--;
  }

  for (const range of splitMasked(maskStrings(input.slice(start, end)), start, ",")) {
    const segment = trim(input, range);
    if (segment.start === segment.end) {
      issues.push({
        code: "empty-member",
        level: "error",
        message: 'Empty member: a "," with nothing before or after it.',
        position: range.start,
      });
      continue;
    }
    const result = parseDictionary(input, segment.start, segment.end);
    if (result.ok) {
      entries.push(...result.entries);
      continue;
    }
    const hints = hintsFor(input.slice(segment.start, segment.end), segment.start);
    issues.push(...hints);
    entries.push(...recover(input, segment, hints));
  }

  return { entries, issues };
}

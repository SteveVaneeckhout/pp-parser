import { classifyMember } from "./allowlist.js";
import type { BareItem, DictionaryEntry, Parameters } from "./structured-field.js";
import type { Allowlist, Issue, ParsedAllowlistMember, ParsedFeature } from "./types.js";
import { FEATURES } from "./vocabulary.js";

export interface ClassifiedFeature {
  readonly feature: ParsedFeature;
  readonly issues: readonly Issue[];
}

function memberKey(member: ParsedAllowlistMember): string {
  switch (member.kind) {
    case "all":
      return "*";
    case "self":
      return "self";
    case "origin":
      return member.origin!;
    default:
      return member.raw;
  }
}

function paramIssues(
  params: Parameters,
  feature: string,
  position: number,
  where: string,
): { issues: Issue[]; reportTo?: BareItem } {
  const issues: Issue[] = [];
  let reportTo: BareItem | undefined;
  for (const [name, value] of params) {
    if (name === "report-to" && where === "feature") {
      reportTo = value;
    } else if (where === "feature" && FEATURES.has(name)) {
      issues.push({
        code: "semicolon-separator",
        level: "error",
        message: `"${name}" after ";" is read as a parameter of "${feature}", not as a feature; separate features with ",".`,
        feature,
        position,
      });
    } else {
      issues.push({
        code: "unknown-parameter",
        level: "warning",
        message: `Parameter "${name}" on ${where === "feature" ? `"${feature}"` : `an allowlist member of "${feature}"`} has no meaning; browsers ignore it.`,
        feature,
        position,
      });
    }
  }
  return reportTo === undefined ? { issues } : { issues, reportTo };
}

/** Turns one dictionary member into a feature: its allowlist, report-to parameter and issues. */
export function classifyEntry(entry: DictionaryEntry, input: string): ClassifiedFeature {
  const name = entry.key;
  const issues: Issue[] = [];
  const members: ParsedAllowlistMember[] = [];

  if (!entry.hasValue) {
    issues.push({
      code: "missing-allowlist",
      level: "warning",
      message: `"${name}" has no value, which leaves its allowlist empty and disables the feature. Write ${name}=() to disable it on purpose, or ${name}=(self) to allow it.`,
      feature: name,
      position: entry.start,
    });
  } else {
    const items = entry.value.kind === "inner-list" ? entry.value.items : [entry.value];
    for (const item of items) {
      const classified = classifyMember(item, input, name);
      members.push(classified.member);
      issues.push(...classified.issues);
      if (entry.value.kind === "inner-list") {
        issues.push(...paramIssues(item.params, name, item.start, "member").issues);
      }
    }
  }

  const params = paramIssues(entry.value.params, name, entry.start, "feature");
  issues.push(...params.issues);
  let reportTo: string | undefined;
  if (params.reportTo !== undefined) {
    if (params.reportTo.type === "token" || params.reportTo.type === "string") {
      reportTo = params.reportTo.value;
    } else {
      issues.push({
        code: "invalid-report-to",
        level: "warning",
        message: `The report-to parameter of "${name}" must name a reporting endpoint (a token such as report-to=default); browsers ignore it.`,
        feature: name,
        position: entry.start,
      });
    }
  }

  const all = members.some((m) => m.kind === "all");
  const self = members.some((m) => m.kind === "self");
  const origins = [...new Set(members.flatMap((m) => (m.kind === "origin" ? [m.origin!] : [])))];
  const allowlist: Allowlist = all ? "all" : self || origins.length > 0 ? "list" : "none";

  if (all && members.length > 1) {
    issues.push({
      code: "redundant-allowlist-member",
      level: "warning",
      message: `"*" already allows every origin; the other members of "${name}" have no effect.`,
      feature: name,
      position: entry.start,
    });
  }
  const seen = new Set<string>();
  const reported = new Set<string>();
  for (const m of members) {
    const key = memberKey(m);
    if (seen.has(key) && !reported.has(key)) {
      reported.add(key);
      issues.push({
        code: "redundant-allowlist-member",
        level: "warning",
        message: `${key} is listed more than once in "${name}".`,
        feature: name,
        member: m.raw,
        position: entry.start,
      });
    }
    seen.add(key);
  }

  const feature: ParsedFeature = {
    name,
    status: FEATURES.get(name)?.status ?? "unknown",
    raw: input.slice(entry.start, entry.end),
    position: entry.start,
    allowlist,
    self,
    origins,
    members,
    ...(reportTo === undefined ? {} : { reportTo }),
  };
  return { feature, issues };
}

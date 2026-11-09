import { ALIASES, FEATURES, NOT_FEATURES, POWERFUL_FEATURES } from "./vocabulary.js";
export function editDistance(a, b) {
    let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
        const current = [i];
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            current.push(Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost));
        }
        previous = current;
    }
    return previous[b.length];
}
/** Suggests the feature an unknown name probably means, or undefined. */
export function suggestFeature(name) {
    const normalized = name.toLowerCase().replaceAll("_", "-").replace(/^sec-/, "");
    if (FEATURES.has(normalized)) {
        return normalized;
    }
    const alias = ALIASES.get(normalized);
    if (alias !== undefined) {
        return alias;
    }
    // A client hint named after its header without the "Sec-CH-" prefix: "dpr", "viewport-width".
    if (FEATURES.has(`ch-${normalized}`)) {
        return `ch-${normalized}`;
    }
    const limit = normalized.length <= 4 ? 1 : 2;
    let best;
    let bestDistance = limit + 1;
    for (const candidate of FEATURES.keys()) {
        const distance = editDistance(normalized, candidate);
        if (distance < bestDistance) {
            best = candidate;
            bestDistance = distance;
        }
    }
    return best;
}
export const ruleDuplicateFeature = ({ names }) => {
    const issues = [];
    const seen = new Set();
    const reported = new Set();
    for (const name of names) {
        if (seen.has(name) && !reported.has(name)) {
            reported.add(name);
            issues.push({
                code: "duplicate-feature",
                level: "warning",
                message: `Feature "${name}" appears more than once; the last occurrence wins.`,
                feature: name,
            });
        }
        seen.add(name);
    }
    return issues;
};
export const ruleUnknownFeature = ({ features }) => features
    .filter((f) => f.status === "unknown")
    .map((f) => {
    let hint = "";
    if (NOT_FEATURES.has(f.name)) {
        hint =
            " A Permissions-Policy lists features with their allowlists, such as camera=(), geolocation=(self).";
    }
    else {
        const suggestion = suggestFeature(f.name);
        hint = suggestion === undefined ? "" : ` Did you mean "${suggestion}"?`;
    }
    return {
        code: "unknown-feature",
        level: "error",
        message: `Unknown feature "${f.name}"; browsers ignore it.${hint}`,
        feature: f.name,
        position: f.position,
    };
});
export const ruleObsoleteFeature = ({ features }) => features
    .filter((f) => f.status === "obsolete")
    .map((f) => {
    const info = FEATURES.get(f.name);
    const why = info.replacement === undefined ? `${info.note}` : `it was renamed to "${info.replacement}"`;
    return {
        code: "obsolete-feature",
        level: "warning",
        message: `Feature "${f.name}" is obsolete: ${why}.`,
        feature: f.name,
        position: f.position,
    };
});
export const ruleWildcardAllowlist = ({ features }) => features
    .filter((f) => f.allowlist === "all" && POWERFUL_FEATURES.has(f.name))
    .map((f) => ({
    code: "wildcard-allowlist",
    level: "warning",
    message: `"${f.name}" is allowed for every origin (*), so any embedded frame can ask for it. List the origins that need it instead.`,
    feature: f.name,
    position: f.position,
}));
export const ALL_RULES = [
    ruleDuplicateFeature,
    ruleUnknownFeature,
    ruleObsoleteFeature,
    ruleWildcardAllowlist,
];
export function runRules(input) {
    return ALL_RULES.flatMap((rule) => rule(input));
}

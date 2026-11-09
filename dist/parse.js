import { diagnose } from "./diagnose.js";
import { classifyEntry } from "./feature.js";
import { runRules } from "./rules.js";
import { parseDictionary } from "./structured-field.js";
const PRINTABLE_RE = /^[\t\x20-\x7e]*$/;
const LINE_BREAK_RE = /[\r\n]/;
const OWS = new Set([" ", "\t"]);
/**
 * Parses and checks a Permissions-Policy header value. Join multiple Permissions-Policy headers
 * with ", " first, as HTTP does.
 */
export function parse(input) {
    const issues = [];
    let start = 0;
    let end = input.length;
    while (start < end && OWS.has(input[start])) {
        start++;
    }
    while (end > start && OWS.has(input[end - 1])) {
        end--;
    }
    if (start === end) {
        return {
            features: [],
            ignoredByBrowsers: false,
            errors: [
                { code: "empty-input", level: "error", message: "Permissions-Policy header is empty." },
            ],
            warnings: [],
        };
    }
    if (!PRINTABLE_RE.test(input)) {
        issues.push({
            code: "invalid-characters",
            level: "error",
            message: LINE_BREAK_RE.test(input)
                ? "Permissions-Policy header contains a line break. HTTP header values can't contain CR or LF."
                : "Permissions-Policy header contains non-ASCII or control characters.",
        });
    }
    let entries;
    const result = parseDictionary(input, start, end);
    if (result.ok) {
        entries = result.entries;
    }
    else {
        issues.push({
            code: "syntax-error",
            level: "error",
            message: `Not a valid Structured Field dictionary (${result.reason} at position ${result.position}), so browsers ignore the whole header.`,
            position: result.position,
        });
        const diagnosis = diagnose(input, start, end);
        issues.push(...diagnosis.issues);
        entries = diagnosis.entries;
    }
    // RFC 9651: a repeated key keeps its first position and takes the last value.
    const latest = new Map();
    for (const entry of entries) {
        latest.set(entry.key, entry);
    }
    const features = [];
    for (const entry of latest.values()) {
        const classified = classifyEntry(entry, input);
        features.push(classified.feature);
        issues.push(...classified.issues);
    }
    issues.push(...runRules({ features, names: entries.map((e) => e.key) }));
    return {
        features,
        ignoredByBrowsers: !result.ok,
        errors: issues.filter((i) => i.level === "error"),
        warnings: issues.filter((i) => i.level === "warning"),
    };
}

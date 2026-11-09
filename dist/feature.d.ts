import type { DictionaryEntry } from "./structured-field.js";
import type { Issue, ParsedFeature } from "./types.js";
export interface ClassifiedFeature {
    readonly feature: ParsedFeature;
    readonly issues: readonly Issue[];
}
/** Turns one dictionary member into a feature: its allowlist, report-to parameter and issues. */
export declare function classifyEntry(entry: DictionaryEntry, input: string): ClassifiedFeature;

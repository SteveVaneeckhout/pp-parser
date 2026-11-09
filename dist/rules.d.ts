import type { Issue, ParsedFeature } from "./types.js";
export interface RuleInput {
    /** One per feature, after duplicates are merged (last value wins). */
    readonly features: readonly ParsedFeature[];
    /** Every member name in header order, duplicates included. */
    readonly names: readonly string[];
}
export type Rule = (input: RuleInput) => readonly Issue[];
export declare function editDistance(a: string, b: string): number;
/** Suggests the feature an unknown name probably means, or undefined. */
export declare function suggestFeature(name: string): string | undefined;
export declare const ruleDuplicateFeature: Rule;
export declare const ruleUnknownFeature: Rule;
export declare const ruleObsoleteFeature: Rule;
export declare const ruleWildcardAllowlist: Rule;
export declare const ALL_RULES: readonly Rule[];
export declare function runRules(input: RuleInput): readonly Issue[];

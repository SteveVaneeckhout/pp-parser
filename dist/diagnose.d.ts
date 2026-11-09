import { type DictionaryEntry } from "./structured-field.js";
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
/** Replaces the contents of every quoted string with "x", keeping offsets, so patterns don't match inside strings. */
export declare function maskStrings(text: string): string;
/**
 * Splits masked text (see maskStrings) at `separator` characters outside parentheses. The ranges
 * are offsets into the original input, in which the masked text starts at `offset`.
 */
export declare function splitMasked(masked: string, offset: number, separator: string): Range[];
/** Explains why one top-level member doesn't parse. Returns no hints when no known mistake fits. */
export declare function hintsFor(segment: string, position: number): Issue[];
/**
 * Called when the whole header fails to parse. Parses each top-level member on its own so the
 * features can still be reported, and explains each member that fails.
 */
export declare function diagnose(input: string, start: number, end: number): Diagnosis;

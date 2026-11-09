import type { FeatureStatus } from "./types.js";
export interface FeatureInfo {
    readonly status: Exclude<FeatureStatus, "unknown">;
    /** For an obsolete feature that was renamed: the name to use instead. */
    readonly replacement?: string;
    /** For an obsolete feature: why it is obsolete. */
    readonly note?: string;
}
export declare const FEATURES: ReadonlyMap<string, FeatureInfo>;
export declare const ALIASES: ReadonlyMap<string, string>;
export declare const NOT_FEATURES: ReadonlySet<string>;
export declare const POWERFUL_FEATURES: ReadonlySet<string>;

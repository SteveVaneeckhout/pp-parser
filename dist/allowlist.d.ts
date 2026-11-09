import type { Item } from "./structured-field.js";
import type { Issue, ParsedAllowlistMember } from "./types.js";
export interface ClassifiedMember {
    readonly member: ParsedAllowlistMember;
    readonly issues: readonly Issue[];
}
/** Classifies one allowlist member: `*`, `self`, `src`, an origin string, or something invalid. */
export declare function classifyMember(item: Item, input: string, feature: string): ClassifiedMember;

export type BareItem = {
    readonly type: "token";
    readonly value: string;
} | {
    readonly type: "string";
    readonly value: string;
} | {
    readonly type: "integer";
    readonly value: number;
} | {
    readonly type: "decimal";
    readonly value: number;
} | {
    readonly type: "boolean";
    readonly value: boolean;
} | {
    readonly type: "byte-sequence";
    readonly value: string;
} | {
    readonly type: "date";
    readonly value: number;
} | {
    readonly type: "display-string";
    readonly value: string;
};
/** Parameters in order of first appearance; a repeated key keeps its first position and last value. */
export type Parameters = ReadonlyMap<string, BareItem>;
export interface Item {
    readonly kind: "item";
    readonly value: BareItem;
    readonly params: Parameters;
    /** Offsets into the input, end exclusive. */
    readonly start: number;
    readonly end: number;
}
export interface InnerList {
    readonly kind: "inner-list";
    readonly items: readonly Item[];
    readonly params: Parameters;
    readonly start: number;
    readonly end: number;
}
export interface DictionaryEntry {
    readonly key: string;
    readonly value: Item | InnerList;
    /** False for a bare key (`camera`), which RFC 9651 reads as the Boolean true. */
    readonly hasValue: boolean;
    readonly start: number;
    readonly end: number;
}
export type DictionaryResult = {
    readonly ok: true;
    readonly entries: readonly DictionaryEntry[];
} | {
    readonly ok: false;
    readonly position: number;
    readonly reason: string;
};
/**
 * Parses `input.slice(start, end)` as an RFC 9651 dictionary. Every member is returned in order,
 * duplicates included; positions are offsets into `input`.
 */
export declare function parseDictionary(input: string, start?: number, end?: number): DictionaryResult;

import type { ParseResult } from "./types.js";
/**
 * Parses and checks a Permissions-Policy header value. Join multiple Permissions-Policy headers
 * with ", " first, as HTTP does.
 */
export declare function parse(input: string): ParseResult;

// A strict parser for RFC 9651 (Structured Field Values for HTTP) dictionaries, the format of the
// Permissions-Policy header. It follows the parsing algorithms of RFC 9651 §4.2 step by step. It
// reports the offset of the first failure, because a header that fails to parse is ignored as a
// whole.

export type BareItem =
  | { readonly type: "token"; readonly value: string }
  | { readonly type: "string"; readonly value: string }
  | { readonly type: "integer"; readonly value: number }
  | { readonly type: "decimal"; readonly value: number }
  | { readonly type: "boolean"; readonly value: boolean }
  | { readonly type: "byte-sequence"; readonly value: string }
  | { readonly type: "date"; readonly value: number }
  | { readonly type: "display-string"; readonly value: string };

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

export type DictionaryResult =
  | { readonly ok: true; readonly entries: readonly DictionaryEntry[] }
  | { readonly ok: false; readonly position: number; readonly reason: string };

class SyntaxFailure extends Error {
  constructor(
    readonly position: number,
    message: string,
  ) {
    super(message);
  }
}

const DIGIT_RE = /^[0-9]$/;
const KEY_START_RE = /^[a-z*]$/;
const KEY_CHAR_RE = /^[a-z0-9_\-.*]$/;
const TOKEN_START_RE = /^[A-Za-z*]$/;
// tchar (RFC 9110) plus ":" and "/".
const TOKEN_CHAR_RE = /^[!#$%&'*+\-.^_`|~0-9A-Za-z:/]$/;
const BASE64_RE = /^[A-Za-z0-9+/=]*$/;
const HEX_RE = /^[0-9a-f]{2}$/;

function describe(c: string): string {
  return c === "" ? "the end of the header" : JSON.stringify(c);
}

function isPrintable(c: string): boolean {
  return c >= " " && c <= "~";
}

class Parser {
  pos: number;

  constructor(
    private readonly input: string,
    start: number,
    private readonly end: number,
  ) {
    this.pos = start;
  }

  done(): boolean {
    return this.pos >= this.end;
  }

  peek(): string {
    return this.done() ? "" : this.input[this.pos]!;
  }

  fail(message: string, at: number = this.pos): never {
    throw new SyntaxFailure(at, message);
  }

  skipSP(): void {
    while (this.peek() === " ") {
      this.pos++;
    }
  }

  skipOWS(): void {
    while (this.peek() === " " || this.peek() === "\t") {
      this.pos++;
    }
  }

  // RFC 9651 §4.2.2
  dictionary(): DictionaryEntry[] {
    const entries: DictionaryEntry[] = [];
    this.skipSP();
    while (!this.done()) {
      const start = this.pos;
      const key = this.key();
      let value: Item | InnerList;
      const hasValue = this.peek() === "=";
      if (hasValue) {
        this.pos++;
        value = this.itemOrInnerList();
      } else {
        const params = this.params();
        value = {
          kind: "item",
          value: { type: "boolean", value: true },
          params,
          start,
          end: this.pos,
        };
      }
      entries.push({ key, value, hasValue, start, end: this.pos });
      this.skipOWS();
      if (this.done()) {
        break;
      }
      if (this.peek() !== ",") {
        this.fail(`Expected "," between members, found ${describe(this.peek())}`);
      }
      this.pos++;
      this.skipOWS();
      if (this.done()) {
        this.fail("Trailing comma after the last member");
      }
    }
    return entries;
  }

  itemOrInnerList(): Item | InnerList {
    return this.peek() === "(" ? this.innerList() : this.item();
  }

  // RFC 9651 §4.2.1.2
  innerList(): InnerList {
    const start = this.pos;
    this.pos++;
    const items: Item[] = [];
    for (;;) {
      this.skipSP();
      if (this.peek() === ")") {
        this.pos++;
        const params = this.params();
        return { kind: "inner-list", items, params, start, end: this.pos };
      }
      if (this.done()) {
        this.fail('Inner list is not closed with ")"');
      }
      items.push(this.item());
      const c = this.peek();
      if (c !== " " && c !== ")") {
        this.fail(
          c === ""
            ? 'Inner list is not closed with ")"'
            : `Expected a space or ")" after an inner-list member, found ${describe(c)}`,
        );
      }
    }
  }

  // RFC 9651 §4.2.3
  item(): Item {
    const start = this.pos;
    const value = this.bareItem();
    const params = this.params();
    return { kind: "item", value, params, start, end: this.pos };
  }

  // RFC 9651 §4.2.3.1
  bareItem(): BareItem {
    const c = this.peek();
    if (c === "-" || DIGIT_RE.test(c)) {
      return this.number();
    }
    if (c === '"') {
      return this.string();
    }
    if (TOKEN_START_RE.test(c)) {
      return this.token();
    }
    if (c === ":") {
      return this.byteSequence();
    }
    if (c === "?") {
      return this.boolean();
    }
    if (c === "@") {
      return this.date();
    }
    if (c === "%") {
      return this.displayString();
    }
    return this.fail(`Expected a value, found ${describe(c)}`);
  }

  // RFC 9651 §4.2.3.2
  params(): Map<string, BareItem> {
    const params = new Map<string, BareItem>();
    while (this.peek() === ";") {
      this.pos++;
      this.skipSP();
      const key = this.key();
      let value: BareItem = { type: "boolean", value: true };
      if (this.peek() === "=") {
        this.pos++;
        value = this.bareItem();
      }
      params.set(key, value);
    }
    return params;
  }

  // RFC 9651 §4.2.3.3
  key(): string {
    const start = this.pos;
    if (!KEY_START_RE.test(this.peek())) {
      this.fail(`Expected a key (a lowercase letter or "*"), found ${describe(this.peek())}`);
    }
    this.pos++;
    while (KEY_CHAR_RE.test(this.peek())) {
      this.pos++;
    }
    return this.input.slice(start, this.pos);
  }

  // RFC 9651 §4.2.4
  number(): BareItem {
    let sign = 1;
    if (this.peek() === "-") {
      this.pos++;
      sign = -1;
    }
    if (!DIGIT_RE.test(this.peek())) {
      this.fail(`Expected a digit, found ${describe(this.peek())}`);
    }
    const start = this.pos;
    let isDecimal = false;
    let digits = "";
    for (;;) {
      const c = this.peek();
      if (DIGIT_RE.test(c)) {
        digits += c;
      } else if (!isDecimal && c === ".") {
        if (digits.length > 12) {
          this.fail("Decimal has more than 12 integer digits", start);
        }
        digits += c;
        isDecimal = true;
      } else {
        break;
      }
      this.pos++;
      if (digits.length > (isDecimal ? 16 : 15)) {
        this.fail(isDecimal ? "Decimal is too long" : "Integer has more than 15 digits", start);
      }
    }
    if (!isDecimal) {
      return { type: "integer", value: sign * Number(digits) };
    }
    const fraction = digits.length - digits.indexOf(".") - 1;
    if (fraction === 0 || fraction > 3) {
      this.fail("Decimal must have 1 to 3 fractional digits", start);
    }
    return { type: "decimal", value: sign * Number(digits) };
  }

  // RFC 9651 §4.2.5
  string(): BareItem {
    const start = this.pos;
    this.pos++;
    let value = "";
    for (;;) {
      if (this.done()) {
        this.fail("String is not closed with '\"'", start);
      }
      const c = this.input[this.pos]!;
      if (c === "\\") {
        const next = this.input[this.pos + 1];
        if (next !== '"' && next !== "\\") {
          this.fail('Only \\" and \\\\ escapes are allowed in a string');
        }
        value += next;
        this.pos += 2;
      } else if (c === '"') {
        this.pos++;
        return { type: "string", value };
      } else if (!isPrintable(c)) {
        this.fail(`String contains a control or non-ASCII character ${describe(c)}`);
      } else {
        value += c;
        this.pos++;
      }
    }
  }

  // RFC 9651 §4.2.6
  token(): BareItem {
    const start = this.pos;
    this.pos++;
    while (TOKEN_CHAR_RE.test(this.peek())) {
      this.pos++;
    }
    return { type: "token", value: this.input.slice(start, this.pos) };
  }

  // RFC 9651 §4.2.7
  byteSequence(): BareItem {
    const start = this.pos;
    const close = this.input.indexOf(":", start + 1);
    if (close === -1 || close >= this.end) {
      this.fail('Byte sequence is not closed with ":"', start);
    }
    const value = this.input.slice(start + 1, close);
    if (!BASE64_RE.test(value)) {
      this.fail("Byte sequence contains a character that is not base64", start);
    }
    this.pos = close + 1;
    return { type: "byte-sequence", value };
  }

  // RFC 9651 §4.2.8
  boolean(): BareItem {
    this.pos++;
    const c = this.peek();
    if (c !== "0" && c !== "1") {
      this.fail(`Boolean must be ?0 or ?1, found ${describe(c)}`);
    }
    this.pos++;
    return { type: "boolean", value: c === "1" };
  }

  // RFC 9651 §4.2.9
  date(): BareItem {
    this.pos++;
    const start = this.pos;
    const n = this.number();
    if (n.type !== "integer") {
      this.fail("Date must be an integer", start);
    }
    return { type: "date", value: n.value };
  }

  // RFC 9651 §4.2.10
  displayString(): BareItem {
    const start = this.pos;
    this.pos++;
    if (this.peek() !== '"') {
      this.fail(`Expected '"' after "%", found ${describe(this.peek())}`);
    }
    this.pos++;
    const bytes: number[] = [];
    for (;;) {
      if (this.done()) {
        this.fail("Display string is not closed with '\"'", start);
      }
      const c = this.input[this.pos]!;
      if (!isPrintable(c)) {
        this.fail(`Display string contains a control or non-ASCII character ${describe(c)}`);
      }
      this.pos++;
      if (c === '"') {
        try {
          const value = new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(bytes));
          return { type: "display-string", value };
        } catch {
          return this.fail("Display string is not valid UTF-8", start);
        }
      }
      if (c === "%") {
        const hex = this.input.slice(this.pos, this.pos + 2);
        if (!HEX_RE.test(hex)) {
          this.fail(
            "Display string has an invalid %-escape (two lowercase hex digits)",
            this.pos - 1,
          );
        }
        bytes.push(Number.parseInt(hex, 16));
        this.pos += 2;
      } else {
        bytes.push(c.charCodeAt(0));
      }
    }
  }
}

/**
 * Parses `input.slice(start, end)` as an RFC 9651 dictionary. Every member is returned in order,
 * duplicates included; positions are offsets into `input`.
 */
export function parseDictionary(
  input: string,
  start = 0,
  end: number = input.length,
): DictionaryResult {
  const parser = new Parser(input, start, end);
  try {
    return { ok: true, entries: parser.dictionary() };
  } catch (error) {
    /* v8 ignore next 3 */
    if (!(error instanceof SyntaxFailure)) {
      throw error;
    }
    return { ok: false, position: error.position, reason: error.message };
  }
}

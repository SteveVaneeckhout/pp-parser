import { describe, expect, it } from "vitest";
import { parseDictionary, type DictionaryEntry, type Item } from "../src/structured-field.js";

function entries(input: string): readonly DictionaryEntry[] {
  const result = parseDictionary(input);
  if (!result.ok) {
    throw new Error(`expected ${input} to parse: ${result.reason} at ${result.position}`);
  }
  return result.entries;
}

function value(input: string): unknown {
  const entry = entries(`a=${input}`)[0]!;
  return (entry.value as Item).value;
}

function failure(input: string): { position: number; reason: string } {
  const result = parseDictionary(input);
  if (result.ok) {
    throw new Error(`expected ${input} to fail`);
  }
  return { position: result.position, reason: result.reason };
}

describe("parseDictionary: dictionaries", () => {
  it("parses an empty input as an empty dictionary", () => {
    expect(entries("")).toEqual([]);
    expect(entries("   ")).toEqual([]);
  });

  it("parses members with offsets", () => {
    const result = entries(" a=1, b=(x y)");
    expect(result.map((e) => [e.key, e.start, e.end, e.hasValue])).toEqual([
      ["a", 1, 4, true],
      ["b", 6, 13, true],
    ]);
  });

  it("reads a bare key as the Boolean true, with parameters", () => {
    const [entry] = entries("a;x=1");
    expect(entry!.hasValue).toBe(false);
    expect(entry!.value).toMatchObject({ kind: "item", value: { type: "boolean", value: true } });
    expect([...entry!.value.params]).toEqual([["x", { type: "integer", value: 1 }]]);
  });

  it("returns repeated keys in order", () => {
    expect(entries("a=1, b=2, a=3").map((e) => e.key)).toEqual(["a", "b", "a"]);
  });

  it("allows tabs and spaces around commas", () => {
    expect(entries("a=1\t,\t b=2").map((e) => e.key)).toEqual(["a", "b"]);
  });

  it("accepts every key character", () => {
    expect(entries("*a_b-c.d*0=1")[0]!.key).toBe("*a_b-c.d*0");
  });

  it("only parses the given range", () => {
    expect(entries("a=1").length).toBe(1);
    const result = parseDictionary("xx a=1, b=2 yy", 3, 11);
    expect(result.ok && result.entries.map((e) => e.key)).toEqual(["a", "b"]);
  });

  it("fails on a missing comma", () => {
    expect(failure("a=1 b=2")).toEqual({
      position: 4,
      reason: 'Expected "," between members, found "b"',
    });
  });

  it("fails on a trailing comma", () => {
    expect(failure("a=1, ").reason).toBe("Trailing comma after the last member");
  });

  it("fails on a key that does not start with a lowercase letter or *", () => {
    expect(failure("A=1")).toEqual({
      position: 0,
      reason: 'Expected a key (a lowercase letter or "*"), found "A"',
    });
    expect(failure("a=1;").reason).toBe(
      'Expected a key (a lowercase letter or "*"), found the end of the header',
    );
  });
});

describe("parseDictionary: inner lists", () => {
  it("parses inner lists with parameters", () => {
    const entry = entries("a=( 1  2 );p=?0")[0]!;
    expect(entry.value.kind).toBe("inner-list");
    if (entry.value.kind === "inner-list") {
      expect(entry.value.items.map((i) => i.value)).toEqual([
        { type: "integer", value: 1 },
        { type: "integer", value: 2 },
      ]);
      expect([...entry.value.params]).toEqual([["p", { type: "boolean", value: false }]]);
    }
  });

  it("parses an empty inner list", () => {
    expect(entries("a=()")[0]!.value).toMatchObject({ kind: "inner-list", items: [] });
  });

  it("keeps the first position and last value of a repeated parameter", () => {
    const params = entries("a=1;x=1;y=2;x=3")[0]!.value.params;
    expect([...params]).toEqual([
      ["x", { type: "integer", value: 3 }],
      ["y", { type: "integer", value: 2 }],
    ]);
  });

  it("allows spaces after the ; of a parameter", () => {
    expect([...entries("a=1; x")[0]!.value.params.keys()]).toEqual(["x"]);
  });

  it("fails on an unclosed inner list", () => {
    expect(failure("a=(").reason).toBe('Inner list is not closed with ")"');
    expect(failure("a=(1 ").reason).toBe('Inner list is not closed with ")"');
    expect(failure("a=(1").reason).toBe('Inner list is not closed with ")"');
  });

  it("fails on a comma inside an inner list", () => {
    expect(failure("a=(1,2)")).toEqual({
      position: 4,
      reason: 'Expected a space or ")" after an inner-list member, found ","',
    });
  });
});

describe("parseDictionary: bare items", () => {
  it("parses integers and decimals", () => {
    expect(value("42")).toEqual({ type: "integer", value: 42 });
    expect(value("-7")).toEqual({ type: "integer", value: -7 });
    expect(value("1.5")).toEqual({ type: "decimal", value: 1.5 });
    expect(value("-0.125")).toEqual({ type: "decimal", value: -0.125 });
    expect(value("123456789012345")).toEqual({ type: "integer", value: 123456789012345 });
    expect(value("123456789012.123")).toEqual({ type: "decimal", value: 123456789012.123 });
  });

  it("fails on numbers out of range", () => {
    expect(failure("a=-x").reason).toBe('Expected a digit, found "x"');
    expect(failure("a=1234567890123456").reason).toBe("Integer has more than 15 digits");
    expect(failure("a=1234567890123.5").reason).toBe("Decimal has more than 12 integer digits");
    expect(failure("a=123456789012.1234").reason).toBe("Decimal is too long");
    expect(failure("a=1.").reason).toBe("Decimal must have 1 to 3 fractional digits");
    expect(failure("a=1.2345").reason).toBe("Decimal must have 1 to 3 fractional digits");
  });

  it("parses strings with escapes", () => {
    expect(value(String.raw`"a\"b\\c"`)).toEqual({ type: "string", value: 'a"b\\c' });
  });

  it("fails on bad strings", () => {
    expect(failure('a="abc')).toEqual({ position: 2, reason: "String is not closed with '\"'" });
    expect(failure(String.raw`a="a\x"`).reason).toBe(
      String.raw`Only \" and \\ escapes are allowed in a string`,
    );
    expect(failure('a="a\u0001"').reason).toBe(
      String.raw`String contains a control or non-ASCII character "\u0001"`,
    );
    expect(failure('a="é"').reason).toBe('String contains a control or non-ASCII character "é"');
  });

  it("parses tokens", () => {
    expect(value("*")).toEqual({ type: "token", value: "*" });
    expect(value("Foo:bar/baz'!")).toEqual({ type: "token", value: "Foo:bar/baz'!" });
  });

  it("parses byte sequences", () => {
    expect(value(":aGk=:")).toEqual({ type: "byte-sequence", value: "aGk=" });
  });

  it("fails on bad byte sequences", () => {
    expect(failure("a=:abc").reason).toBe('Byte sequence is not closed with ":"');
    expect(failure("a=:a!b:").reason).toBe("Byte sequence contains a character that is not base64");
    const outside = parseDictionary("a=:abc:", 0, 6);
    expect(outside.ok).toBe(false);
  });

  it("parses booleans", () => {
    expect(value("?1")).toEqual({ type: "boolean", value: true });
    expect(value("?0")).toEqual({ type: "boolean", value: false });
    expect(failure("a=?2").reason).toBe('Boolean must be ?0 or ?1, found "2"');
  });

  it("parses dates", () => {
    expect(value("@1659578233")).toEqual({ type: "date", value: 1659578233 });
    expect(failure("a=@1.5").reason).toBe("Date must be an integer");
  });

  it("parses display strings", () => {
    expect(value('%"caf%c3%a9"')).toEqual({ type: "display-string", value: "café" });
  });

  it("fails on bad display strings", () => {
    expect(failure("a=%x").reason).toBe('Expected \'"\' after "%", found "x"');
    expect(failure('a=%"abc').reason).toBe("Display string is not closed with '\"'");
    expect(failure('a=%"%zz"').reason).toBe(
      "Display string has an invalid %-escape (two lowercase hex digits)",
    );
    expect(failure('a=%"%ff"').reason).toBe("Display string is not valid UTF-8");
    expect(failure('a=%"\u0001"').reason).toBe(
      String.raw`Display string contains a control or non-ASCII character "\u0001"`,
    );
  });

  it("fails on a character that starts no value", () => {
    expect(failure("a='self'")).toEqual({ position: 2, reason: `Expected a value, found "'"` });
    expect(failure("a=").reason).toBe("Expected a value, found the end of the header");
  });
});

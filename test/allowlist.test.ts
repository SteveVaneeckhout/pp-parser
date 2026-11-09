import { describe, expect, it } from "vitest";
import { classifyMember } from "../src/allowlist.js";
import { parseDictionary, type Item } from "../src/structured-field.js";

function classify(member: string) {
  const input = `camera=${member}`;
  const result = parseDictionary(input);
  if (!result.ok) {
    throw new Error(result.reason);
  }
  return classifyMember(result.entries[0]!.value as Item, input, "camera");
}

const codes = (member: string) => classify(member).issues.map((i) => i.code);

describe("classifyMember: tokens", () => {
  it("classifies *, self and src", () => {
    expect(classify("*").member).toEqual({ raw: "*", kind: "all" });
    expect(classify("self").member).toEqual({ raw: "self", kind: "self" });
    expect(classify("self").issues).toEqual([]);
    expect(classify("src").member.kind).toBe("src");
    expect(codes("src")).toEqual(["src-in-header"]);
  });

  it("rejects other tokens with a hint", () => {
    expect(classify("none").issues[0]).toMatchObject({
      code: "invalid-allowlist-member",
      level: "error",
      feature: "camera",
      member: "none",
      position: 7,
    });
    expect(classify("none").issues[0]!.message).toContain("empty list ()");
    expect(classify("Self").issues[0]!.message).toContain("tokens are case-sensitive; write self");
    expect(classify("SRC").issues[0]!.message).toContain("write src");
    expect(classify("all").issues[0]!.message).toContain("use *, self or a quoted origin");
  });

  it("rejects non-token, non-string items", () => {
    expect(classify("1").member).toEqual({ raw: "1", kind: "invalid" });
    expect(codes("?1")).toEqual(["invalid-allowlist-member"]);
  });

  it("keeps parameters in raw", () => {
    expect(classify("self;x=1").member.raw).toBe("self;x=1");
  });
});

describe("classifyMember: origins", () => {
  it("classifies an origin", () => {
    expect(classify('"https://Example.com"')).toEqual({
      member: { raw: '"https://Example.com"', kind: "origin", origin: "https://example.com" },
      issues: [],
    });
    expect(classify('"https://example.com:8443/"').member.origin).toBe("https://example.com:8443");
  });

  it("classifies a wildcard-subdomain origin", () => {
    expect(classify('"https://*.example.com"').member).toEqual({
      raw: '"https://*.example.com"',
      kind: "origin",
      origin: "https://*.example.com",
      wildcard: true,
    });
    expect(classify('"https://*.example.com:443"').member.origin).toBe("https://*.example.com");
    expect(classify('"https://*.example.com:8443"').member.origin).toBe(
      "https://*.example.com:8443",
    );
  });

  it("rejects keywords written as strings", () => {
    expect(classify('"self"').issues[0]!.message).toContain("write the token self without quotes");
    expect(classify(`"'none'"`).issues[0]!.message).toContain("write an empty list ()");
    expect(classify('"*"').issues[0]!.message).toContain("write the token * without quotes");
    expect(classify('"src"').issues[0]!.message).toContain("iframe allow attribute");
  });

  it("rejects strings that are not origins", () => {
    expect(classify('"example.com"').issues[0]!.message).toContain("it needs a scheme");
    expect(classify('"*.example.com"').issues[0]!.message).toContain("it needs a scheme");
    expect(classify('"https://exa mple.com"').issues[0]!.message).toContain("is not a valid URL");
    expect(classify('"data:text/plain,hi"').issues[0]!.message).toContain("opaque origin (data:");
    expect(classify('"https://*"').issues[0]!.message).toContain("wildcard in the wrong place");
    expect(classify('"https://a.*.com"').member.kind).toBe("invalid");
    expect(codes('"example.com"')).toEqual(["invalid-origin"]);
  });

  it("warns when only the origin of a URL is used", () => {
    expect(codes('"https://example.com/path"')).toEqual(["origin-has-path"]);
    expect(codes('"https://example.com?q=1"')).toEqual(["origin-has-path"]);
    expect(codes('"https://example.com#x"')).toEqual(["origin-has-path"]);
    expect(classify('"https://example.com/path"').issues[0]!.message).toContain(
      "browsers only use its origin, https://example.com",
    );
  });

  it("warns about plain-HTTP origins", () => {
    expect(codes('"http://example.com"')).toEqual(["insecure-origin"]);
    expect(codes('"http://example.com/x"')).toEqual(["origin-has-path", "insecure-origin"]);
  });
});

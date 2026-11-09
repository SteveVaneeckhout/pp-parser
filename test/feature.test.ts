import { describe, expect, it } from "vitest";
import { classifyEntry } from "../src/feature.js";
import { parseDictionary } from "../src/structured-field.js";

function classify(input: string) {
  const result = parseDictionary(input);
  if (!result.ok) {
    throw new Error(result.reason);
  }
  return classifyEntry(result.entries[0]!, input);
}

const codes = (input: string) => classify(input).issues.map((i) => i.code);

describe("classifyEntry", () => {
  it("builds a feature with an empty allowlist", () => {
    expect(classify("camera=()").feature).toEqual({
      name: "camera",
      status: "standard",
      raw: "camera=()",
      position: 0,
      allowlist: "none",
      self: false,
      origins: [],
      members: [],
    });
  });

  it("builds a feature with self and origins", () => {
    const { feature, issues } = classify('geolocation=(self "https://a.com" "https://b.com/")');
    expect(feature.allowlist).toBe("list");
    expect(feature.self).toBe(true);
    expect(feature.origins).toEqual(["https://a.com", "https://b.com"]);
    expect(issues).toEqual([]);
  });

  it("reads a single item as a one-member list", () => {
    expect(classify("geolocation=self").feature).toMatchObject({ allowlist: "list", self: true });
    expect(classify('geolocation="https://a.com"').feature.origins).toEqual(["https://a.com"]);
    expect(classify("fullscreen=*").feature.allowlist).toBe("all");
  });

  it("gives an unknown feature the unknown status", () => {
    expect(classify("frobnicate=()").feature.status).toBe("unknown");
  });

  it("warns about a bare feature name", () => {
    const { feature, issues } = classify("camera");
    expect(feature.allowlist).toBe("none");
    expect(issues[0]).toMatchObject({
      code: "missing-allowlist",
      level: "warning",
      feature: "camera",
    });
    expect(issues[0]!.message).toContain("camera=()");
  });

  it("reads the report-to parameter", () => {
    expect(classify("camera=();report-to=main").feature.reportTo).toBe("main");
    expect(classify('camera=self;report-to="main"').feature.reportTo).toBe("main");
    expect(classify("camera;report-to=main").feature.reportTo).toBe("main");
    expect(codes("camera=();report-to=1")).toEqual(["invalid-report-to"]);
    expect(classify("camera=();report-to=1").feature.reportTo).toBeUndefined();
  });

  it("reports a feature read as a parameter after ;", () => {
    const { issues } = classify("camera=();microphone");
    expect(issues.map((i) => i.code)).toEqual(["semicolon-separator"]);
    expect(issues[0]!.message).toContain('"microphone" after ";"');
  });

  it("warns about unknown parameters", () => {
    expect(codes("camera=();foo")).toEqual(["unknown-parameter"]);
    expect(classify("camera=();foo").issues[0]!.message).toContain('on "camera"');
  });

  it("warns about parameters on allowlist members", () => {
    expect(codes("camera=(self;report-to=x self;microphone)")).toEqual([
      "unknown-parameter",
      "unknown-parameter",
      "redundant-allowlist-member",
    ]);
    expect(classify("camera=(self;x)").issues[0]!.message).toContain(
      'an allowlist member of "camera"',
    );
  });

  it("warns about * next to other members", () => {
    const { feature, issues } = classify('camera=(* self "https://a.com")');
    expect(feature.allowlist).toBe("all");
    expect(issues.map((i) => i.code)).toEqual(["redundant-allowlist-member"]);
    expect(issues[0]!.message).toContain('"*" already allows every origin');
  });

  it("warns about repeated members, once per member", () => {
    const issues = classify(
      'camera=(self self self "https://a.com" "https://A.com/" * * src src none none)',
    ).issues.filter((i) => i.code === "redundant-allowlist-member");
    expect(issues.map((i) => i.member)).toEqual([
      undefined,
      "self",
      '"https://A.com/"',
      "*",
      "src",
      "none",
    ]);
  });
});

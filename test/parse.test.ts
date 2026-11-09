import { describe, expect, it } from "vitest";
import { parse } from "../src/index.js";

const codes = (input: string) => {
  const r = parse(input);
  return [...r.errors, ...r.warnings].map((i) => i.code);
};

describe("parse: valid headers", () => {
  it("parses the most common header in the wild without issues", () => {
    const input =
      "accelerometer=(),camera=(),clipboard-read=(),clipboard-write=(),geolocation=(),gyroscope=(),hid=(),magnetometer=(),microphone=(),payment=(),publickey-credentials-get=(),screen-wake-lock=(),serial=(),sync-xhr=(),usb=(),xr-spatial-tracking=()";
    const result = parse(input);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.ignoredByBrowsers).toBe(false);
    expect(result.features).toHaveLength(16);
    expect(result.features.every((f) => f.allowlist === "none")).toBe(true);
  });

  it("returns features with their allowlists", () => {
    const result = parse(
      'geolocation=self, fullscreen=*, camera=(self "https://*.example.com");report-to=main',
    );
    expect(result.errors).toEqual([]);
    expect(result.features.map((f) => [f.name, f.allowlist, f.self, f.origins])).toEqual([
      ["geolocation", "list", true, []],
      ["fullscreen", "all", false, []],
      ["camera", "list", true, ["https://*.example.com"]],
    ]);
    expect(result.features[2]).toMatchObject({ reportTo: "main", position: 32 });
  });

  it("trims optional whitespace around the value, keeping positions in the input", () => {
    const result = parse(" \tcamera=() ");
    expect(result.errors).toEqual([]);
    expect(result.features[0]!.position).toBe(2);
  });

  it("lets the last occurrence of a repeated feature win, at its first position", () => {
    const result = parse("camera=(), microphone=(), camera=(self)");
    expect(result.features.map((f) => [f.name, f.self])).toEqual([
      ["camera", true],
      ["microphone", false],
    ]);
    expect(result.warnings.map((w) => w.code)).toEqual(["duplicate-feature"]);
  });
});

describe("parse: headers browsers ignore", () => {
  it("reports an empty header", () => {
    expect(parse("")).toEqual({
      features: [],
      ignoredByBrowsers: false,
      errors: [
        { code: "empty-input", level: "error", message: "Permissions-Policy header is empty." },
      ],
      warnings: [],
    });
    expect(codes(" \t ")).toEqual(["empty-input"]);
  });

  it("reports a syntax error with its position and recovers the rest", () => {
    const result = parse("camera=(), geolocation=('self'), microphone=()");
    expect(result.ignoredByBrowsers).toBe(true);
    expect(result.errors.map((e) => e.code)).toEqual(["syntax-error", "quoted-keyword"]);
    expect(result.errors[0]).toMatchObject({ position: 24 });
    expect(result.errors[0]!.message).toBe(
      `Not a valid Structured Field dictionary (Expected a value, found "'" at position 24), so browsers ignore the whole header.`,
    );
    expect(result.features.map((f) => f.name)).toEqual(["camera", "microphone"]);
  });

  it("reports Feature-Policy syntax", () => {
    expect(codes("camera 'none'; microphone 'none'")).toEqual([
      "syntax-error",
      "feature-policy-syntax",
    ]);
  });

  it("reports control and non-ASCII characters", () => {
    const lineBreak = parse("camera=(),\n microphone=()");
    expect(lineBreak.errors[0]!.message).toContain("line break");
    const nonAscii = parse("camera=()‚ microphone=()");
    expect(nonAscii.errors.map((e) => e.code)).toEqual(["invalid-characters", "syntax-error"]);
    expect(nonAscii.errors[0]!.message).toContain("non-ASCII");
  });
});

describe("parse: features and allowlists", () => {
  it("reports unknown and obsolete features", () => {
    const result = parse("xr_spatial_tracking=(), interest-cohort=()");
    expect(result.errors.map((e) => [e.code, e.feature])).toEqual([
      ["unknown-feature", "xr_spatial_tracking"],
    ]);
    expect(result.warnings.map((w) => [w.code, w.feature])).toEqual([
      ["obsolete-feature", "interest-cohort"],
    ]);
    expect(result.features.map((f) => f.status)).toEqual(["unknown", "obsolete"]);
  });

  it("warns about * on a powerful feature", () => {
    expect(codes("camera=(*), fullscreen=(*)")).toEqual(["wildcard-allowlist"]);
  });

  it("reports a feature swallowed as a parameter after ;", () => {
    expect(codes("camera=(); microphone=*")).toEqual(["semicolon-separator"]);
  });

  it("reports allowlist problems", () => {
    expect(codes('camera=(none "example.com" src "http://a.com/x")')).toEqual([
      "invalid-allowlist-member",
      "invalid-origin",
      "src-in-header",
      "origin-has-path",
      "insecure-origin",
    ]);
  });
});

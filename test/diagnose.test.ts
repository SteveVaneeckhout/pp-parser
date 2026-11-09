import { describe, expect, it } from "vitest";
import { diagnose, hintsFor, maskStrings, splitMasked } from "../src/diagnose.js";

const hintCodes = (segment: string) => hintsFor(segment, 0).map((i) => i.code);

function run(input: string) {
  const d = diagnose(input, 0, input.length);
  return {
    keys: d.entries.map((e) => e.key),
    codes: d.issues.map((i) => i.code),
    issues: d.issues,
  };
}

describe("maskStrings", () => {
  it("masks string contents and keeps offsets", () => {
    expect(maskStrings('a=("x, y" self)')).toBe('a=("xxxxx self)');
    expect(maskStrings(String.raw`a="\"" b`)).toBe('a="xxx b');
    expect(maskStrings('a="open')).toBe('a="xxxx');
  });
});

describe("splitMasked", () => {
  it("splits outside parentheses", () => {
    expect(splitMasked("a=(x,y), b", 10, ",")).toEqual([
      { start: 10, end: 17 },
      { start: 18, end: 20 },
    ]);
  });

  it("tolerates unbalanced parentheses", () => {
    expect(splitMasked("a=), b", 0, ",")).toEqual([
      { start: 0, end: 3 },
      { start: 4, end: 6 },
    ]);
  });
});

describe("hintsFor", () => {
  it("detects Feature-Policy syntax", () => {
    expect(hintCodes("camera 'none'; microphone 'none'")).toEqual(["feature-policy-syntax"]);
    expect(hintCodes("autoplay *")).toEqual(["feature-policy-syntax"]);
    expect(hintCodes("geolocation self https://a.com")).toEqual(["feature-policy-syntax"]);
    expect(hintsFor("autoplay *", 5)[0]).toMatchObject({ feature: "autoplay", position: 5 });
  });

  it("detects quoted keywords, once each", () => {
    const hints = hintsFor("geolocation=('self' 'self' 'none' 'SRC')", 0);
    expect(hints.map((h) => h.code)).toEqual([
      "quoted-keyword",
      "quoted-keyword",
      "quoted-keyword",
    ]);
    expect(hints.map((h) => h.message)).toEqual([
      "'self' is CSP / Feature-Policy syntax and not valid here; write self without quotes.",
      "'none' is CSP / Feature-Policy syntax and not valid here; write an empty list () instead.",
      "'SRC' is CSP / Feature-Policy syntax and not valid here; write src without quotes.",
    ]);
  });

  it("ignores keywords inside double-quoted strings", () => {
    expect(hintCodes(`camera=("'self'" x,)`)).toEqual([]);
  });

  it("detects ; between features and a trailing ;", () => {
    expect(hintCodes("camera=(); microphone=(")).toEqual(["semicolon-separator"]);
    expect(hintsFor("camera=();", 0)[0]!.message).toContain("trailing");
    expect(hintCodes("camera=(;report-to=x")).toEqual([]);
  });

  it("detects a missing comma or missing parentheses", () => {
    expect(hintCodes('geolocation=(self "x") camera=()')).toEqual(["missing-comma"]);
    expect(hintCodes("geolocation=self camera=()")).toEqual(["missing-comma"]);
    expect(hintCodes('camera=self "https://a.com"')).toEqual(["missing-parentheses"]);
  });

  it("detects a missing = and whitespace around =", () => {
    expect(hintCodes("camera()")).toEqual(["missing-equals"]);
    expect(hintCodes("camera =()")).toEqual(["whitespace-around-equals"]);
    expect(hintCodes("camera= ()")).toEqual(["whitespace-around-equals"]);
  });

  it("detects invalid feature names", () => {
    const [hint] = hintsFor("Camera=()", 0);
    expect(hint).toMatchObject({ code: "invalid-feature-name", feature: "Camera" });
    expect(hint!.message).toContain('write "camera"');
    expect(hintsFor("ca%mera=()", 0)[0]!.message).not.toContain("write");
  });

  it("detects unquoted and single-quoted origins", () => {
    expect(hintCodes("camera=(self https://a.com)")).toEqual(["unquoted-origin"]);
    expect(hintCodes("camera=(*.a.com)")).toEqual(["unquoted-origin"]);
    expect(hintCodes("camera=(self 'https://a.com')")).toEqual(["unquoted-origin"]);
  });

  it("returns no hints when nothing fits, and no feature when there is no name", () => {
    expect(hintCodes("camera=Origin()")).toEqual([]);
    expect(hintsFor("=(self 'self')", 3)[0]).toEqual({
      code: "quoted-keyword",
      level: "error",
      message: expect.any(String),
      position: 3,
    });
  });
});

describe("diagnose", () => {
  it("recovers the members that parse on their own", () => {
    const result = run("camera=(), geolocation=('self'), microphone=()");
    expect(result.keys).toEqual(["camera", "microphone"]);
    expect(result.codes).toEqual(["quoted-keyword"]);
    expect(result.issues[0]!.position).toBe(11);
  });

  it("trims whitespace around each member", () => {
    const result = run("geolocation=('self') \t, camera=()");
    expect(result.keys).toEqual(["camera"]);
    expect(result.issues[0]!.position).toBe(0);
  });

  it("reports empty members", () => {
    expect(run("camera=(),, microphone=(),").codes).toEqual(["empty-member", "empty-member"]);
  });

  it("recovers features separated by ;", () => {
    expect(run("camera=(); microphone=(); geolocation=(self)").keys).toEqual([
      "camera",
      "microphone",
      "geolocation",
    ]);
    expect(run("fullscreen=*;").keys).toEqual(["fullscreen"]);
  });

  it("recovers features with a missing comma", () => {
    expect(run('geolocation=(self "https://a.com") microphone=() camera=()').keys).toEqual([
      "geolocation",
      "microphone",
      "camera",
    ]);
  });

  it("strips a header name pasted into the value", () => {
    const result = run("Permissions-Policy: camera=(), microphone=()");
    expect(result.codes).toEqual(["header-name-in-value"]);
    expect(result.keys).toEqual(["camera", "microphone"]);
  });

  it("strips double quotes around the whole value", () => {
    const result = run('"camera=(), geolocation=self"');
    expect(result.codes).toEqual(["quoted-value"]);
    expect(result.keys).toEqual(["camera", "geolocation"]);
    expect(run('"').codes).toEqual([]);
  });
});

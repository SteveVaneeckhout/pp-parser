import { describe, expect, it } from "vitest";
import {
  editDistance,
  ruleDuplicateFeature,
  ruleObsoleteFeature,
  ruleUnknownFeature,
  ruleWildcardAllowlist,
  runRules,
  suggestFeature,
} from "../src/rules.js";
import type { Allowlist, FeatureStatus, ParsedFeature } from "../src/types.js";

function feature(
  name: string,
  status: FeatureStatus,
  allowlist: Allowlist = "none",
): ParsedFeature {
  return {
    name,
    status,
    raw: `${name}=()`,
    position: 0,
    allowlist,
    self: false,
    origins: [],
    members: [],
  };
}

describe("editDistance", () => {
  it("counts insertions, deletions and substitutions", () => {
    expect(editDistance("camera", "camera")).toBe(0);
    expect(editDistance("camara", "camera")).toBe(1);
    expect(editDistance("gyro", "gyroscope")).toBe(5);
    expect(editDistance("", "abc")).toBe(3);
  });
});

describe("suggestFeature", () => {
  it("normalizes underscores, case and a Sec- prefix", () => {
    expect(suggestFeature("xr_spatial_tracking")).toBe("xr-spatial-tracking");
    expect(suggestFeature("sec-ch-ua-model")).toBe("ch-ua-model");
  });

  it("knows aliases and client hints named after their header", () => {
    expect(suggestFeature("xr")).toBe("xr-spatial-tracking");
    expect(suggestFeature("dpr")).toBe("ch-dpr");
    expect(suggestFeature("viewport-width")).toBe("ch-viewport-width");
  });

  it("suggests the closest feature for a typo", () => {
    expect(suggestFeature("camara")).toBe("camera");
    expect(suggestFeature("magentometer")).toBe("magnetometer");
    expect(suggestFeature("ch-ua-form-factor")).toBe("ch-ua-form-factors");
  });

  it("is stricter for short names and gives up on far names", () => {
    expect(suggestFeature("usbb")).toBe("usb");
    expect(suggestFeature("gyro")).toBeUndefined();
    expect(suggestFeature("frobnicate")).toBeUndefined();
  });
});

describe("rules", () => {
  it("warns about repeated features, once each", () => {
    const issues = ruleDuplicateFeature({ features: [], names: ["a", "b", "a", "a"] });
    expect(issues).toEqual([
      {
        code: "duplicate-feature",
        level: "warning",
        message: 'Feature "a" appears more than once; the last occurrence wins.',
        feature: "a",
      },
    ]);
  });

  it("reports unknown features with a suggestion", () => {
    const issues = ruleUnknownFeature({
      features: [
        feature("camara", "unknown"),
        feature("frobnicate", "unknown"),
        feature("camera", "standard"),
      ],
      names: [],
    });
    expect(issues.map((i) => i.message)).toEqual([
      'Unknown feature "camara"; browsers ignore it. Did you mean "camera"?',
      'Unknown feature "frobnicate"; browsers ignore it.',
    ]);
    expect(issues[0]!.level).toBe("error");
  });

  it("explains a whole-policy word used as a feature", () => {
    const [issue] = ruleUnknownFeature({ features: [feature("none", "unknown")], names: [] });
    expect(issue!.message).toContain("lists features with their allowlists");
  });

  it("warns about obsolete features", () => {
    const issues = ruleObsoleteFeature({
      features: [feature("vr", "obsolete"), feature("interest-cohort", "obsolete")],
      names: [],
    });
    expect(issues.map((i) => i.message)).toEqual([
      'Feature "vr" is obsolete: it was renamed to "xr-spatial-tracking".',
      'Feature "interest-cohort" is obsolete: FLoC was abandoned and removed from Chrome.',
    ]);
  });

  it("warns about * on powerful features only", () => {
    const issues = ruleWildcardAllowlist({
      features: [
        feature("camera", "standard", "all"),
        feature("fullscreen", "standard", "all"),
        feature("microphone", "standard", "list"),
      ],
      names: [],
    });
    expect(issues.map((i) => i.feature)).toEqual(["camera"]);
  });

  it("runs every rule", () => {
    const codes = runRules({
      features: [
        feature("vr", "obsolete"),
        feature("camara", "unknown"),
        feature("camera", "standard", "all"),
      ],
      names: ["vr", "vr"],
    }).map((i) => i.code);
    expect(codes).toEqual([
      "duplicate-feature",
      "unknown-feature",
      "obsolete-feature",
      "wildcard-allowlist",
    ]);
  });
});

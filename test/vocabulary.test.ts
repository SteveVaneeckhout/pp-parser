import { describe, expect, it } from "vitest";
import { ALIASES, FEATURES, NOT_FEATURES, POWERFUL_FEATURES } from "../src/vocabulary.js";

const KEY_RE = /^[a-z*][a-z0-9_\-.*]*$/;

describe("vocabulary", () => {
  it("only has names that are valid Structured Field keys", () => {
    for (const name of [...FEATURES.keys(), ...ALIASES.keys(), ...ALIASES.values()]) {
      expect(name).toMatch(KEY_RE);
    }
  });

  it("knows the features in the W3C registry and Chromium", () => {
    for (const name of [
      "camera",
      "geolocation",
      "xr-spatial-tracking",
      "ch-ua-model",
      "summarizer",
    ]) {
      expect(FEATURES.has(name)).toBe(true);
    }
    expect(FEATURES.get("clipboard-read")?.status).toBe("proposed");
    expect(FEATURES.get("local-fonts")?.status).toBe("experimental");
    expect(FEATURES.get("ch-dpr")?.status).toBe("client-hint");
  });

  it("gives every obsolete feature a replacement or a note, and replacements are current", () => {
    const obsolete = [...FEATURES].filter(([, info]) => info.status === "obsolete");
    expect(obsolete.length).toBeGreaterThan(0);
    for (const [, info] of obsolete) {
      expect(info.replacement !== undefined || info.note !== undefined).toBe(true);
      if (info.replacement !== undefined) {
        expect(FEATURES.get(info.replacement)?.status).not.toBe("obsolete");
      }
    }
  });

  it("points aliases at features, and powerful features are known and current", () => {
    for (const target of ALIASES.values()) {
      expect(FEATURES.has(target)).toBe(true);
    }
    for (const name of POWERFUL_FEATURES) {
      expect(FEATURES.get(name)?.status).not.toBe("obsolete");
      expect(FEATURES.has(name)).toBe(true);
    }
  });

  it("does not list a real feature as a non-feature", () => {
    for (const name of NOT_FEATURES) {
      expect(FEATURES.has(name)).toBe(false);
    }
  });
});

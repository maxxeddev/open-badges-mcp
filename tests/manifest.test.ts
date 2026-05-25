import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Property 10: Manifest completeness
 *
 * Assert `manifest.json` contains `version` (string), `fetchDate` (ISO 8601),
 * `sources` array with `url` and `filename`.
 *
 * **Validates: Requirements 4.4**
 */

const manifestPath = join("data", "snapshots", "3.0.3", "manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));

describe("Property 10: Manifest completeness", () => {
  it("version is a non-empty string", () => {
    expect(typeof manifest.version).toBe("string");
    expect(manifest.version.length).toBeGreaterThan(0);
  });

  it("fetchDate is a valid ISO 8601 string", () => {
    expect(typeof manifest.fetchDate).toBe("string");
    expect(manifest.fetchDate).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it("sources is a non-empty array", () => {
    expect(Array.isArray(manifest.sources)).toBe(true);
    expect(manifest.sources.length).toBeGreaterThan(0);
  });

  it("each source entry has url (non-empty string) and filename (non-empty string)", () => {
    for (const source of manifest.sources) {
      expect(typeof source.url).toBe("string");
      expect(source.url.length).toBeGreaterThan(0);

      expect(typeof source.filename).toBe("string");
      expect(source.filename.length).toBeGreaterThan(0);
    }
  });
});

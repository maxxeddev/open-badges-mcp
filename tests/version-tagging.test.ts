import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getVocab } from "../src/vocab/index.js";
import type { Manifest } from "../src/vocab/types.js";

/**
 * Property 9: Version tagging invariant
 *
 * For any ClassRecord or PropertyRecord in the Vocab_Store, the record's
 * `version` field SHALL equal the version string from the loaded `manifest.json`.
 *
 * **Validates: Requirements 10.1**
 */

const manifestPath = join(import.meta.dirname, "..", "data", "snapshots", "3.0.3", "manifest.json");
const manifest: Manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));

describe("Property 9: Version tagging invariant", () => {
  const vocab = getVocab();

  it("vocab.version equals the manifest version", () => {
    expect(vocab.version).toBe(manifest.version);
  });

  it("every ClassRecord has version equal to manifest version", () => {
    for (const [name, classRecord] of vocab.classesByName) {
      expect(classRecord.version, `ClassRecord "${name}" version mismatch`).toBe(manifest.version);
    }
  });

  it("every PropertyRecord has version equal to manifest version", () => {
    for (const [name, propertyRecord] of vocab.propertiesByName) {
      expect(propertyRecord.version, `PropertyRecord "${name}" version mismatch`).toBe(
        manifest.version,
      );
    }
  });
});

import { describe, expect, it } from "vitest";
import { loadSources, sourcesByKind } from "../src/sources.js";

describe("sources.json", () => {
  it("loads and validates", () => {
    const sources = loadSources();
    expect(sources.schemaVersion).toBe(1);
    expect(sources.sources.length).toBeGreaterThanOrEqual(6);
  });

  it("has every kind we expect", () => {
    expect(sourcesByKind("vocab-ttl")).toHaveLength(1);
    expect(sourcesByKind("json-ld-context")).toHaveLength(1);
    expect(sourcesByKind("html-spec").length).toBeGreaterThanOrEqual(2);
    expect(sourcesByKind("json-schema").length).toBeGreaterThanOrEqual(2);
  });

  it("html-spec entries have a parser", () => {
    for (const src of sourcesByKind("html-spec")) {
      expect(src.parser, `${src.id} should have a parser`).toBeDefined();
    }
  });

  it("ids are unique", () => {
    const ids = loadSources().sources.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

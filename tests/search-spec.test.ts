import { describe, expect, it } from "vitest";
import { handler } from "../src/tools/search_spec.js";

/**
 * Unit tests for search_spec tool
 *
 * **Validates: Requirements 25.6**
 */

describe("search_spec", () => {
  describe("returns ranked results with section anchors for a known query", () => {
    it('returns results for query "achievement"', async () => {
      const result = await handler({ query: "achievement" });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.results).toBeDefined();
      expect(Array.isArray(parsed.results)).toBe(true);
      expect(parsed.results.length).toBeGreaterThan(0);
    });

    it("each result includes a section anchor and deep-link URL", async () => {
      const result = await handler({ query: "achievement" });
      const parsed = JSON.parse(result.content[0].text);

      for (const r of parsed.results) {
        expect(r.anchor).toBeTruthy();
        expect(r.url).toContain("#");
      }
    });

    it("results are ranked (ascending rank values)", async () => {
      const result = await handler({ query: "achievement" });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.results.length).toBeGreaterThan(1);
      for (let i = 1; i < parsed.results.length; i++) {
        expect(parsed.results[i].rank).toBeGreaterThan(parsed.results[i - 1].rank);
      }
    });
  });

  describe("spec filtering works correctly", () => {
    it('spec="ob3" returns only ob3 results', async () => {
      const result = await handler({ query: "credential", spec: "ob3" });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.results.length).toBeGreaterThan(0);
      for (const r of parsed.results) {
        expect(r.spec).toBe("ob3");
      }
    });

    it('spec="vc" returns only vc results', async () => {
      const result = await handler({ query: "credential", spec: "vc" });
      const parsed = JSON.parse(result.content[0].text);

      for (const r of parsed.results) {
        expect(r.spec).toBe("vc");
      }
    });
  });

  describe("limit parameter is respected", () => {
    it("limit=2 returns at most 2 results", async () => {
      const result = await handler({ query: "credential", limit: 2 });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.results.length).toBeLessThanOrEqual(2);
      expect(parsed.results.length).toBeGreaterThan(0);
    });

    it("limit=1 returns exactly 1 result", async () => {
      const result = await handler({ query: "credential", limit: 1 });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.results.length).toBe(1);
    });
  });

  describe("results include sources array", () => {
    it("response contains sources array matching results length", async () => {
      const result = await handler({ query: "achievement" });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.sources).toBeDefined();
      expect(Array.isArray(parsed.sources)).toBe(true);
      expect(parsed.sources.length).toBe(parsed.results.length);
    });

    it("each source has url and anchor fields", async () => {
      const result = await handler({ query: "achievement" });
      const parsed = JSON.parse(result.content[0].text);

      for (const source of parsed.sources) {
        expect(source).toHaveProperty("url");
        expect(source).toHaveProperty("anchor");
        expect(source.url).toBeTruthy();
        expect(source.anchor).toBeTruthy();
      }
    });
  });
});

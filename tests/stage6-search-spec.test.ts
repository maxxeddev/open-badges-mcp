import { describe, expect, it } from "vitest";
import { handler } from "../src/tools/search_spec.js";

/**
 * Unit tests for Stage 6 tool: search_spec
 *
 * **Validates: Requirements 25.6**
 */

describe("search_spec unit tests", () => {
  describe("returns ranked results with section anchors for a known query", () => {
    it('returns results for query "credential"', async () => {
      const result = await handler({ query: "credential" });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.results).toBeDefined();
      expect(Array.isArray(parsed.results)).toBe(true);
      expect(parsed.results.length).toBeGreaterThan(0);
    });

    it("each result has section anchor and URL", async () => {
      const result = await handler({ query: "achievement" });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.results.length).toBeGreaterThan(0);
      for (const r of parsed.results) {
        expect(r).toHaveProperty("anchor");
        expect(r.anchor).toBeTruthy();
        expect(r).toHaveProperty("url");
        expect(r.url).toContain("#");
      }
    });

    it("results have rank fields in ascending order", async () => {
      const result = await handler({ query: "badge" });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.results.length).toBeGreaterThan(1);
      for (let i = 1; i < parsed.results.length; i++) {
        expect(parsed.results[i].rank).toBeGreaterThan(parsed.results[i - 1].rank);
      }
    });

    it("includes sources array with URLs for each result", async () => {
      const result = await handler({ query: "credential" });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.sources).toBeDefined();
      expect(Array.isArray(parsed.sources)).toBe(true);
      expect(parsed.sources.length).toBe(parsed.results.length);
      for (const source of parsed.sources) {
        expect(source).toHaveProperty("url");
        expect(source).toHaveProperty("anchor");
      }
    });
  });

  describe("spec filtering works correctly", () => {
    it('when spec="ob3" is passed, all results have spec="ob3"', async () => {
      const result = await handler({ query: "credential", spec: "ob3" });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.results.length).toBeGreaterThan(0);
      for (const r of parsed.results) {
        expect(r.spec).toBe("ob3");
      }
    });

    it('when spec="vc" is passed, all results have spec="vc"', async () => {
      const result = await handler({ query: "credential", spec: "vc" });
      const parsed = JSON.parse(result.content[0].text);

      // vc results may or may not exist depending on data, but if they do they should all be vc
      for (const r of parsed.results) {
        expect(r.spec).toBe("vc");
      }
    });
  });

  describe("limit parameter is respected", () => {
    it("when limit=3 is passed, at most 3 results are returned", async () => {
      const result = await handler({ query: "credential", limit: 3 });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.results.length).toBeLessThanOrEqual(3);
      expect(parsed.results.length).toBeGreaterThan(0);
    });

    it("when limit=1 is passed, exactly 1 result is returned", async () => {
      const result = await handler({ query: "credential", limit: 1 });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.results.length).toBe(1);
    });
  });
});

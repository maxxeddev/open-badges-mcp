import { describe, expect, it } from "vitest";
import { handler } from "../src/tools/find_conformance_requirements.js";

/**
 * Unit tests for find_conformance_requirements tool
 *
 * **Validates: Requirements 25.9**
 */

describe("find_conformance_requirements unit tests", () => {
  describe("searching for a topic returns normative sentences", () => {
    it('searching for "credential" returns results with normative sentences', async () => {
      const result = await handler({ topic: "credential" });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.results).toBeDefined();
      expect(Array.isArray(parsed.results)).toBe(true);
      expect(parsed.results.length).toBeGreaterThan(0);

      // Each result should have a sentence containing normative language
      for (const r of parsed.results) {
        expect(r).toHaveProperty("sentence");
        expect(r.sentence).toBeTruthy();
        expect(r).toHaveProperty("modal");
        expect(["MUST", "SHOULD", "MAY"]).toContain(r.modal);
      }
    });
  });

  describe("filtering by modal verb", () => {
    it('filtering by modal="MUST" returns only MUST results', async () => {
      const result = await handler({ topic: "credential", modal: "MUST" });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.results.length).toBeGreaterThan(0);
      for (const r of parsed.results) {
        expect(r.modal).toBe("MUST");
      }
    });

    it('filtering by modal="SHOULD" returns only SHOULD results', async () => {
      const result = await handler({ topic: "credential", modal: "SHOULD" });
      const parsed = JSON.parse(result.content[0].text);

      // SHOULD results may or may not exist, but if they do they must all be SHOULD
      for (const r of parsed.results) {
        expect(r.modal).toBe("SHOULD");
      }
    });

    it('filtering by modal="MAY" returns only MAY results', async () => {
      const result = await handler({ topic: "credential", modal: "MAY" });
      const parsed = JSON.parse(result.content[0].text);

      for (const r of parsed.results) {
        expect(r.modal).toBe("MAY");
      }
    });
  });

  describe("results include section URLs and topic tags", () => {
    it("each result has a sectionUrl with a deep-link", async () => {
      const result = await handler({ topic: "credential" });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.results.length).toBeGreaterThan(0);
      for (const r of parsed.results) {
        expect(r).toHaveProperty("sectionUrl");
        expect(r.sectionUrl).toContain("#");
        expect(r.sectionUrl).toMatch(/^https?:\/\//);
      }
    });

    it("each result has topicTags as an array", async () => {
      const result = await handler({ topic: "credential" });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.results.length).toBeGreaterThan(0);
      for (const r of parsed.results) {
        expect(r).toHaveProperty("topicTags");
        expect(Array.isArray(r.topicTags)).toBe(true);
      }
    });
  });

  describe("response includes sources array", () => {
    it("sources array is present with url and anchor fields", async () => {
      const result = await handler({ topic: "credential" });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.sources).toBeDefined();
      expect(Array.isArray(parsed.sources)).toBe(true);
      expect(parsed.sources.length).toBe(parsed.results.length);
      for (const source of parsed.sources) {
        expect(source).toHaveProperty("url");
        expect(source).toHaveProperty("anchor");
        expect(source.url).toMatch(/^https?:\/\//);
      }
    });
  });
});

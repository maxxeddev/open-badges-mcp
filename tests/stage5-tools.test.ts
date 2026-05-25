import { describe, expect, it } from "vitest";
import { handler as getContextHandler } from "../src/tools/get_context.js";
import { handler as resolveTermHandler } from "../src/tools/resolve_term.js";

/**
 * Unit tests for Stage 5 tools: resolve_term and get_context
 *
 * **Validates: Requirements 25.4, 25.5**
 */

describe("resolve_term unit tests", () => {
  describe('resolve_term("Achievement") returns corresponding IRI', () => {
    it("resolves Achievement to its OB IRI", async () => {
      const result = await resolveTermHandler({ term_or_iri: "Achievement" });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed).not.toHaveProperty("error");
      expect(parsed.kind).toBe("term");
      expect(parsed.term).toBe("Achievement");
      expect(parsed.iri).toBe("https://purl.imsglobal.org/spec/vc/ob/vocab.html#Achievement");
      expect(parsed.definedIn).toBe("ob");
    });

    it("includes sources array", async () => {
      const result = await resolveTermHandler({ term_or_iri: "Achievement" });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.sources).toBeDefined();
      expect(Array.isArray(parsed.sources)).toBe(true);
      expect(parsed.sources.length).toBeGreaterThan(0);
      expect(parsed.sources[0]).toHaveProperty("url");
      expect(parsed.sources[0]).toHaveProperty("anchor");
    });
  });

  describe("resolve_term with an IRI resolves back to its term and identifies origin", () => {
    it("resolves a schema.org IRI back to its term with schema origin", async () => {
      const result = await resolveTermHandler({
        term_or_iri: "https://schema.org/description",
      });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed).not.toHaveProperty("error");
      expect(parsed.kind).toBe("iri");
      expect(parsed.term).toBe("description");
      expect(parsed.iri).toBe("https://schema.org/description");
      expect(parsed.definedIn).toBe("schema");
    });

    it("resolves an OB IRI back to its term with ob origin", async () => {
      const result = await resolveTermHandler({
        term_or_iri: "https://purl.imsglobal.org/spec/vc/ob/vocab.html#Achievement",
      });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed).not.toHaveProperty("error");
      expect(parsed.kind).toBe("iri");
      expect(parsed.term).toBe("Achievement");
      expect(parsed.iri).toBe("https://purl.imsglobal.org/spec/vc/ob/vocab.html#Achievement");
      expect(parsed.definedIn).toBe("ob");
    });
  });

  describe("resolve_term error handling", () => {
    it("returns error for unknown term", async () => {
      const result = await resolveTermHandler({
        term_or_iri: "nonExistentTerm",
      });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed).toHaveProperty("error");
      expect(parsed.error).toContain("not found");
    });

    it("returns error for unknown IRI", async () => {
      const result = await resolveTermHandler({
        term_or_iri: "https://example.org/unknown#term",
      });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed).toHaveProperty("error");
      expect(parsed.error).toContain("not found");
    });
  });
});

describe("get_context unit tests", () => {
  describe("get_context returns structured table with raw context", () => {
    it("returns termToIri mapping as an object", async () => {
      const result = await getContextHandler({});
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed).toHaveProperty("termToIri");
      expect(typeof parsed.termToIri).toBe("object");
      expect(Object.keys(parsed.termToIri).length).toBeGreaterThan(0);
    });

    it("termToIri contains known terms", async () => {
      const result = await getContextHandler({});
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.termToIri).toHaveProperty("Achievement");
      expect(parsed.termToIri).toHaveProperty("description");
      expect(parsed.termToIri).toHaveProperty("name");
    });

    it("returns raw context JSON", async () => {
      const result = await getContextHandler({});
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed).toHaveProperty("rawContext");
      expect(parsed.rawContext).toHaveProperty("@context");
    });

    it("includes sources array with canonical context URL", async () => {
      const result = await getContextHandler({});
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed).toHaveProperty("sources");
      expect(Array.isArray(parsed.sources)).toBe(true);
      expect(parsed.sources.length).toBeGreaterThan(0);
      expect(parsed.sources[0].url).toContain("context");
    });
  });
});

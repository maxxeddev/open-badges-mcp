import { describe, expect, it } from "vitest";
import { handler as crossReferenceHandler } from "../src/tools/cross_reference.js";
import { handler as getSectionHandler } from "../src/tools/get_section.js";
import { handler as listSectionsHandler } from "../src/tools/list_sections.js";

/**
 * Unit tests for Stage 7 tools: get_section, list_sections, cross_reference
 *
 * **Validates: Requirements 11.4, 12.3, 13.3**
 */

describe("get_section unit tests", () => {
  it("returns body and breadcrumbs for a known section", async () => {
    const result = await getSectionHandler({
      spec: "ob3",
      section_id: "abstract",
    });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.error).toBeUndefined();
    expect(parsed.body).toBeDefined();
    expect(typeof parsed.body).toBe("string");
    expect(parsed.body.length).toBeGreaterThan(0);
    expect(parsed.breadcrumbs).toBeDefined();
    expect(Array.isArray(parsed.breadcrumbs)).toBe(true);
  });

  it("returns sectionId, title, anchor, and spec fields", async () => {
    const result = await getSectionHandler({
      spec: "ob3",
      section_id: "abstract",
    });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.sectionId).toBe("abstract");
    expect(parsed.spec).toBe("ob3");
    expect(parsed.title).toBeDefined();
    expect(typeof parsed.title).toBe("string");
    expect(parsed.anchor).toBeDefined();
  });

  it("includes sources array with deep-link URL", async () => {
    const result = await getSectionHandler({
      spec: "ob3",
      section_id: "abstract",
    });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.sources).toBeDefined();
    expect(Array.isArray(parsed.sources)).toBe(true);
    expect(parsed.sources.length).toBeGreaterThan(0);
    expect(parsed.sources[0].url).toContain("#abstract");
    expect(parsed.sources[0].anchor).toBe("abstract");
  });

  it("returns structured error for unknown section ID", async () => {
    const result = await getSectionHandler({
      spec: "ob3",
      section_id: "nonexistent-section-xyz",
    });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.error).toBeDefined();
    expect(parsed.error).toContain("not found");
  });
});

describe("list_sections unit tests", () => {
  it("returns a nested structure for ob3 spec", async () => {
    const result = await listSectionsHandler({ spec: "ob3" });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.toc).toBeDefined();
    expect(Array.isArray(parsed.toc)).toBe(true);
    expect(parsed.toc.length).toBeGreaterThan(0);
  });

  it("each TOC entry has sectionId, title, and children fields", async () => {
    const result = await listSectionsHandler({ spec: "ob3" });
    const parsed = JSON.parse(result.content[0].text);

    for (const entry of parsed.toc) {
      expect(entry).toHaveProperty("sectionId");
      expect(entry).toHaveProperty("title");
      expect(entry).toHaveProperty("children");
      expect(typeof entry.sectionId).toBe("string");
      expect(typeof entry.title).toBe("string");
      expect(Array.isArray(entry.children)).toBe(true);
    }
  });

  it("contains nested children reflecting parent-child relationships", async () => {
    const result = await listSectionsHandler({ spec: "ob3" });
    const parsed = JSON.parse(result.content[0].text);

    // Find at least one entry with children to confirm nesting works
    const hasNested = parsed.toc.some(
      (entry: { children: unknown[] }) => entry.children.length > 0,
    );
    expect(hasNested).toBe(true);
  });

  it("includes sources array", async () => {
    const result = await listSectionsHandler({ spec: "ob3" });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.sources).toBeDefined();
    expect(Array.isArray(parsed.sources)).toBe(true);
    expect(parsed.sources.length).toBeGreaterThan(0);
    expect(parsed.sources[0]).toHaveProperty("url");
    expect(parsed.sources[0]).toHaveProperty("anchor");
  });
});

describe("cross_reference unit tests", () => {
  it("finds term across multiple sources for 'Achievement'", async () => {
    const result = await crossReferenceHandler({ term: "Achievement" });
    const parsed = JSON.parse(result.content[0].text);

    // Should find in vocab (it's a class)
    expect(parsed.vocab).toBeDefined();
    expect(Array.isArray(parsed.vocab)).toBe(true);
    expect(parsed.vocab.length).toBeGreaterThan(0);
    expect(parsed.vocab[0].name).toBe("Achievement");
    expect(parsed.vocab[0].kind).toBe("class");

    // Should find in prose (FTS)
    expect(parsed.prose).toBeDefined();
    expect(Array.isArray(parsed.prose)).toBe(true);
    expect(parsed.prose.length).toBeGreaterThan(0);

    // Should find in context
    expect(parsed.context).toBeDefined();
    expect(Array.isArray(parsed.context)).toBe(true);
    expect(parsed.context.length).toBeGreaterThan(0);
    expect(parsed.context[0].term).toBe("Achievement");
    expect(parsed.context[0].iri).toBeDefined();
  });

  it("groups results by source type: vocab, prose, context, examples", async () => {
    const result = await crossReferenceHandler({ term: "Achievement" });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed).toHaveProperty("vocab");
    expect(parsed).toHaveProperty("prose");
    expect(parsed).toHaveProperty("context");
    expect(parsed).toHaveProperty("examples");
  });

  it("includes sources array with URLs for matched items", async () => {
    const result = await crossReferenceHandler({ term: "Achievement" });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.sources).toBeDefined();
    expect(Array.isArray(parsed.sources)).toBe(true);
    expect(parsed.sources.length).toBeGreaterThan(0);
    for (const source of parsed.sources) {
      expect(source).toHaveProperty("url");
      expect(source).toHaveProperty("anchor");
    }
  });

  it("returns empty arrays for unknown terms", async () => {
    const result = await crossReferenceHandler({
      term: "CompletelyUnknownTermXYZ123",
    });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.vocab).toEqual([]);
    expect(parsed.context).toEqual([]);
  });
});

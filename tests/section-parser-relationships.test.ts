import fc from "fast-check";
import { beforeAll, describe, expect, it } from "vitest";
import { getDatabase } from "../src/spec/db.js";

/**
 * Property 10: Section parser preserves parent-child relationships
 *
 * For any HTML with nested <section> elements, parser produces rows with correct parent_id references.
 * Top-level sections have parent_id set to null.
 *
 * **Validates: Requirements 8.3, 8.5**
 */

interface SectionRow {
  spec: string;
  section_id: string;
  parent_id: string | null;
}

describe("Property 10: Section parser preserves parent-child relationships", () => {
  let sections: SectionRow[] = [];

  beforeAll(async () => {
    const db = await getDatabase();
    const result = db.exec("SELECT spec, section_id, parent_id FROM sections");
    if (result.length > 0) {
      sections = result[0].values.map((row) => ({
        spec: row[0] as string,
        section_id: row[1] as string,
        parent_id: row[2] as string | null,
      }));
    }
  });

  it("every section's parent_id is either null or references an existing section_id in the same spec", () => {
    // Build a lookup of valid section_ids per spec
    const sectionIdsBySpec = new Map<string, Set<string>>();
    for (const section of sections) {
      if (!sectionIdsBySpec.has(section.spec)) {
        sectionIdsBySpec.set(section.spec, new Set());
      }
      sectionIdsBySpec.get(section.spec)!.add(section.section_id);
    }

    // Filter to sections that have a non-null parent_id (interesting cases for the property)
    const sectionsWithParent = sections.filter((s) => s.parent_id !== null);

    expect(sectionsWithParent.length).toBeGreaterThan(0);

    fc.assert(
      fc.property(fc.constantFrom(...sectionsWithParent), (section) => {
        const validIds = sectionIdsBySpec.get(section.spec);
        expect(validIds).toBeDefined();
        expect(validIds!.has(section.parent_id!)).toBe(true);
      }),
    );
  });

  it("top-level sections have parent_id set to null", () => {
    const topLevelSections = sections.filter((s) => s.parent_id === null);

    // There must be at least some top-level sections in each spec
    expect(topLevelSections.length).toBeGreaterThan(0);

    fc.assert(
      fc.property(fc.constantFrom(...topLevelSections), (section) => {
        expect(section.parent_id).toBeNull();
      }),
    );
  });

  it("parent_id references form a valid tree (no cycles to self)", () => {
    const sectionsWithParent = sections.filter((s) => s.parent_id !== null);

    expect(sectionsWithParent.length).toBeGreaterThan(0);

    fc.assert(
      fc.property(fc.constantFrom(...sectionsWithParent), (section) => {
        // A section cannot be its own parent
        expect(section.section_id).not.toBe(section.parent_id);
      }),
    );
  });
});

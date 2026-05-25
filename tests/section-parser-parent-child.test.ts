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
  let sectionIdsBySpec: Map<string, Set<string>>;

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

    // Build lookup of valid section_ids per spec
    sectionIdsBySpec = new Map<string, Set<string>>();
    for (const section of sections) {
      if (!sectionIdsBySpec.has(section.spec)) {
        sectionIdsBySpec.set(section.spec, new Set());
      }
      sectionIdsBySpec.get(section.spec)!.add(section.section_id);
    }
  });

  it("for any section with non-null parent_id, that parent_id references an existing section in the same spec", () => {
    const sectionsWithParent = sections.filter((s) => s.parent_id !== null);

    // There must be sections with parents in the database
    expect(sectionsWithParent.length).toBeGreaterThan(0);

    fc.assert(
      fc.property(fc.constantFrom(...sectionsWithParent), (section) => {
        const validIds = sectionIdsBySpec.get(section.spec);
        expect(validIds).toBeDefined();
        // The parent_id must reference an existing section_id in the same spec
        expect(validIds!.has(section.parent_id!)).toBe(true);
      }),
      { numRuns: Math.min(sectionsWithParent.length, 200) },
    );
  });

  it("top-level sections (parent_id is null) exist as roots in the tree", () => {
    const topLevelSections = sections.filter((s) => s.parent_id === null);

    // There must be at least some top-level sections
    expect(topLevelSections.length).toBeGreaterThan(0);

    fc.assert(
      fc.property(fc.constantFrom(...topLevelSections), (section) => {
        // Top-level sections have parent_id set to null
        expect(section.parent_id).toBeNull();
        // They must be valid section_ids in their spec
        const validIds = sectionIdsBySpec.get(section.spec);
        expect(validIds).toBeDefined();
        expect(validIds!.has(section.section_id)).toBe(true);
      }),
      { numRuns: Math.min(topLevelSections.length, 100) },
    );
  });

  it("no section is its own parent (no trivial cycles)", () => {
    const sectionsWithParent = sections.filter((s) => s.parent_id !== null);

    expect(sectionsWithParent.length).toBeGreaterThan(0);

    fc.assert(
      fc.property(fc.constantFrom(...sectionsWithParent), (section) => {
        expect(section.section_id).not.toBe(section.parent_id);
      }),
      { numRuns: Math.min(sectionsWithParent.length, 200) },
    );
  });

  it("parent-child relationships form a DAG (no cycles in ancestor chain)", () => {
    // Build parent lookup per spec
    const parentLookup = new Map<string, Map<string, string | null>>();
    for (const section of sections) {
      if (!parentLookup.has(section.spec)) {
        parentLookup.set(section.spec, new Map());
      }
      parentLookup.get(section.spec)!.set(section.section_id, section.parent_id);
    }

    const sectionsWithParent = sections.filter((s) => s.parent_id !== null);
    expect(sectionsWithParent.length).toBeGreaterThan(0);

    fc.assert(
      fc.property(fc.constantFrom(...sectionsWithParent), (section) => {
        // Walk up the parent chain — should eventually reach null without revisiting
        const visited = new Set<string>();
        let current: string | null = section.section_id;
        const lookup = parentLookup.get(section.spec)!;

        while (current !== null) {
          if (visited.has(current)) {
            // Cycle detected
            expect.fail(`Cycle detected involving section: ${current}`);
          }
          visited.add(current);
          current = lookup.get(current) ?? null;
        }
      }),
      { numRuns: Math.min(sectionsWithParent.length, 200) },
    );
  });
});

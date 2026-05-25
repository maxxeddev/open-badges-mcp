import fc from "fast-check";
import { beforeAll, describe, expect, it } from "vitest";
import { getDatabase } from "../src/spec/db.js";
import { getSection } from "../src/spec/index.js";

/**
 * Property 19: get_section returns correct breadcrumb chain
 *
 * For any valid section_id, `get_section` returns breadcrumbs from root to parent in correct order.
 *
 * **Validates: Requirements 11.4**
 */

interface SectionRow {
  spec: string;
  section_id: string;
  parent_id: string | null;
  title: string;
}

describe("Property 19: get_section returns correct breadcrumb chain", () => {
  let allSections: SectionRow[] = [];
  let sectionsWithParent: SectionRow[] = [];
  const parentLookup: Map<
    string,
    Map<string, { parentId: string | null; title: string }>
  > = new Map();

  beforeAll(async () => {
    const db = await getDatabase();
    const result = db.exec("SELECT spec, section_id, parent_id, title FROM sections");
    if (result.length > 0) {
      allSections = result[0].values.map((row) => ({
        spec: row[0] as string,
        section_id: row[1] as string,
        parent_id: row[2] as string | null,
        title: row[3] as string,
      }));
    }

    sectionsWithParent = allSections.filter((s) => s.parent_id !== null);

    // Build parent lookup per spec: section_id -> { parentId, title }
    for (const section of allSections) {
      if (!parentLookup.has(section.spec)) {
        parentLookup.set(section.spec, new Map());
      }
      parentLookup.get(section.spec)!.set(section.section_id, {
        parentId: section.parent_id,
        title: section.title,
      });
    }
  });

  it("breadcrumbs is an array of strings representing the parent chain from root to immediate parent", async () => {
    expect(sectionsWithParent.length).toBeGreaterThan(0);

    await fc.assert(
      fc.asyncProperty(fc.constantFrom(...sectionsWithParent), async (section) => {
        const result = await getSection(section.spec, section.section_id);
        expect(result).not.toBeNull();
        expect(Array.isArray(result!.breadcrumbs)).toBe(true);

        // Every breadcrumb entry should be a string (title)
        for (const crumb of result!.breadcrumbs) {
          expect(typeof crumb).toBe("string");
          expect(crumb.length).toBeGreaterThan(0);
        }

        // The breadcrumbs should represent the parent chain from root to immediate parent
        // Manually walk the parent chain to compute expected breadcrumbs
        const specLookup = parentLookup.get(section.spec)!;
        const expectedBreadcrumbs: string[] = [];
        let currentId: string | null = section.parent_id;

        while (currentId !== null) {
          const parentInfo = specLookup.get(currentId);
          if (!parentInfo) break;
          expectedBreadcrumbs.unshift(parentInfo.title);
          currentId = parentInfo.parentId;
        }

        expect(result!.breadcrumbs).toEqual(expectedBreadcrumbs);
      }),
      { numRuns: Math.min(sectionsWithParent.length, 100) },
    );
  });

  it("breadcrumb chain length matches the depth of the section in the tree", async () => {
    expect(sectionsWithParent.length).toBeGreaterThan(0);

    await fc.assert(
      fc.asyncProperty(fc.constantFrom(...sectionsWithParent), async (section) => {
        const result = await getSection(section.spec, section.section_id);
        expect(result).not.toBeNull();

        // Compute depth by walking parent chain
        const specLookup = parentLookup.get(section.spec)!;
        let depth = 0;
        let currentId: string | null = section.parent_id;

        while (currentId !== null) {
          depth++;
          const parentInfo = specLookup.get(currentId);
          if (!parentInfo) break;
          currentId = parentInfo.parentId;
        }

        // Breadcrumb length should equal the depth (number of ancestors)
        expect(result!.breadcrumbs.length).toBe(depth);
      }),
      { numRuns: Math.min(sectionsWithParent.length, 100) },
    );
  });

  it("sections at root level have empty breadcrumbs", async () => {
    const rootSections = allSections.filter((s) => s.parent_id === null);
    expect(rootSections.length).toBeGreaterThan(0);

    await fc.assert(
      fc.asyncProperty(fc.constantFrom(...rootSections), async (section) => {
        const result = await getSection(section.spec, section.section_id);
        expect(result).not.toBeNull();
        expect(result!.breadcrumbs).toEqual([]);
      }),
      { numRuns: Math.min(rootSections.length, 50) },
    );
  });
});

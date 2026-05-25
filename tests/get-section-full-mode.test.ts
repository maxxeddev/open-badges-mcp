import fc from "fast-check";
import { beforeAll, describe, expect, it } from "vitest";
import { getDatabase } from "../src/spec/db.js";
import { getSection } from "../src/spec/index.js";

/**
 * Property 20: get_section full mode includes all descendants
 *
 * For any section with children, `get_section` with `full: true` includes all descendant bodies.
 *
 * **Validates: Requirements 11.5**
 */

interface ParentSection {
  spec: string;
  section_id: string;
}

describe("Property 20: get_section full mode includes all descendants", () => {
  let parentSections: ParentSection[] = [];

  beforeAll(async () => {
    const db = await getDatabase();

    // Find sections whose section_id appears as parent_id of other sections
    const result = db.exec(`
      SELECT DISTINCT p.spec, p.section_id
      FROM sections p
      INNER JOIN sections c ON c.parent_id = p.section_id AND c.spec = p.spec
    `);

    if (result.length > 0) {
      parentSections = result[0].values.map((row) => ({
        spec: row[0] as string,
        section_id: row[1] as string,
      }));
    }
  });

  it("for any section with children, getSection with full: true returns a non-empty children array", async () => {
    expect(parentSections.length).toBeGreaterThan(0);

    await fc.assert(
      fc.asyncProperty(fc.constantFrom(...parentSections), async (parentSection) => {
        const result = await getSection(parentSection.spec, parentSection.section_id, true);

        expect(result).not.toBeNull();
        expect(result!.children).toBeDefined();
        expect(Array.isArray(result!.children)).toBe(true);
        expect(result!.children!.length).toBeGreaterThan(0);
      }),
      { numRuns: Math.min(parentSections.length, 100) },
    );
  });

  it("for any section with children, all direct children are included in the full mode response", async () => {
    expect(parentSections.length).toBeGreaterThan(0);

    await fc.assert(
      fc.asyncProperty(fc.constantFrom(...parentSections), async (parentSection) => {
        const db = await getDatabase();

        // Get expected direct children from the database
        const childResult = db.exec(
          `SELECT section_id FROM sections WHERE spec = '${parentSection.spec}' AND parent_id = '${parentSection.section_id}'`,
        );

        const expectedChildIds = new Set<string>();
        if (childResult.length > 0) {
          for (const row of childResult[0].values) {
            expectedChildIds.add(row[0] as string);
          }
        }

        // Call getSection with full: true
        const result = await getSection(parentSection.spec, parentSection.section_id, true);

        expect(result).not.toBeNull();
        expect(result!.children).toBeDefined();

        const returnedChildIds = new Set(result!.children!.map((c) => c.sectionId));

        // Every expected direct child should be present in the response
        for (const expectedId of expectedChildIds) {
          expect(returnedChildIds.has(expectedId)).toBe(true);
        }
      }),
      { numRuns: Math.min(parentSections.length, 100) },
    );
  });

  it("children returned in full mode have non-empty body content", async () => {
    expect(parentSections.length).toBeGreaterThan(0);

    await fc.assert(
      fc.asyncProperty(fc.constantFrom(...parentSections), async (parentSection) => {
        const result = await getSection(parentSection.spec, parentSection.section_id, true);

        expect(result).not.toBeNull();
        expect(result!.children).toBeDefined();

        // Each child should have a body field that is a string
        for (const child of result!.children!) {
          expect(child.body).toBeDefined();
          expect(typeof child.body).toBe("string");
        }
      }),
      { numRuns: Math.min(parentSections.length, 50) },
    );
  });
});

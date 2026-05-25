import fc from "fast-check";
import { beforeAll, describe, expect, it } from "vitest";
import { getDatabase } from "../src/spec/db.js";
import { listSections } from "../src/spec/index.js";
import type { SectionTocEntry } from "../src/spec/types.js";

/**
 * Property 21: list_sections produces complete nested TOC
 *
 * For any spec corpus, every section appears exactly once in the tree.
 * Parent-child relationships match parent_id foreign keys.
 *
 * **Validates: Requirements 12.3, 12.4**
 */

/** Flatten a TOC tree into a list of all entries. */
function flattenToc(entries: SectionTocEntry[]): SectionTocEntry[] {
  const result: SectionTocEntry[] = [];
  function walk(nodes: SectionTocEntry[]) {
    for (const node of nodes) {
      result.push(node);
      walk(node.children);
    }
  }
  walk(entries);
  return result;
}

/** Collect parent-child pairs from the TOC tree. */
function collectParentChildPairs(
  entries: SectionTocEntry[],
  parentId: string | null = null,
): Array<{ childId: string; parentId: string | null }> {
  const pairs: Array<{ childId: string; parentId: string | null }> = [];
  for (const entry of entries) {
    pairs.push({ childId: entry.sectionId, parentId });
    pairs.push(...collectParentChildPairs(entry.children, entry.sectionId));
  }
  return pairs;
}

interface DbSection {
  spec: string;
  section_id: string;
  parent_id: string | null;
}

describe("Property 21: list_sections produces complete nested TOC", () => {
  const specs = ["ob3", "vc"] as const;
  const tocBySpec: Record<string, SectionTocEntry[]> = {};
  const dbSectionsBySpec: Record<string, DbSection[]> = {};

  beforeAll(async () => {
    const db = await getDatabase();

    for (const spec of specs) {
      tocBySpec[spec] = await listSections(spec);

      const result = db.exec(
        `SELECT spec, section_id, parent_id FROM sections WHERE spec = '${spec}'`,
      );
      if (result.length > 0) {
        dbSectionsBySpec[spec] = result[0].values.map((row) => ({
          spec: row[0] as string,
          section_id: row[1] as string,
          parent_id: row[2] as string | null,
        }));
      } else {
        dbSectionsBySpec[spec] = [];
      }
    }
  });

  it("every section from the database appears exactly once in the TOC tree", () => {
    for (const spec of specs) {
      const toc = tocBySpec[spec];
      const dbSections = dbSectionsBySpec[spec];

      // Skip if no sections for this spec
      if (dbSections.length === 0) continue;

      const flatEntries = flattenToc(toc);
      const tocSectionIds = flatEntries.map((e) => e.sectionId);

      // Every section appears exactly once (no duplicates)
      const idSet = new Set(tocSectionIds);
      expect(idSet.size).toBe(tocSectionIds.length);

      // Total count matches database
      expect(tocSectionIds.length).toBe(dbSections.length);

      // Every DB section is present in the TOC
      fc.assert(
        fc.property(fc.constantFrom(...dbSections), (dbSection) => {
          expect(idSet.has(dbSection.section_id)).toBe(true);
        }),
        { numRuns: Math.min(dbSections.length, 300) },
      );
    }
  });

  it("TOC section count matches database section count per spec", () => {
    for (const spec of specs) {
      const toc = tocBySpec[spec];
      const dbSections = dbSectionsBySpec[spec];

      if (dbSections.length === 0) continue;

      const flatEntries = flattenToc(toc);
      expect(flatEntries.length).toBe(dbSections.length);
    }
  });

  it("parent-child relationships in the tree match parent_id foreign keys in the database", () => {
    for (const spec of specs) {
      const toc = tocBySpec[spec];
      const dbSections = dbSectionsBySpec[spec];

      if (dbSections.length === 0) continue;

      // Build a lookup from section_id -> parent_id from the database
      const dbParentMap = new Map<string, string | null>();
      for (const s of dbSections) {
        dbParentMap.set(s.section_id, s.parent_id);
      }

      // Collect parent-child pairs from the TOC tree
      const tocPairs = collectParentChildPairs(toc);

      // For sections that have a parent in the DB that also exists in the DB,
      // the TOC tree should reflect the same relationship
      const tocPairsWithParent = tocPairs.filter((p) => p.parentId !== null);

      if (tocPairsWithParent.length === 0) continue;

      fc.assert(
        fc.property(fc.constantFrom(...tocPairsWithParent), (pair) => {
          // The child's parent_id in the DB should match the tree parent
          const dbParentId = dbParentMap.get(pair.childId);
          expect(dbParentId).toBe(pair.parentId);
        }),
        { numRuns: Math.min(tocPairsWithParent.length, 300) },
      );
    }
  });

  it("root nodes in the TOC have null parent_id in the database", () => {
    for (const spec of specs) {
      const toc = tocBySpec[spec];
      const dbSections = dbSectionsBySpec[spec];

      if (dbSections.length === 0) continue;

      // Build DB parent lookup
      const dbParentMap = new Map<string, string | null>();
      for (const s of dbSections) {
        dbParentMap.set(s.section_id, s.parent_id);
      }

      // Root nodes are the top-level entries in the TOC
      const rootNodes = toc;

      if (rootNodes.length === 0) continue;

      fc.assert(
        fc.property(fc.constantFrom(...rootNodes), (rootEntry) => {
          const dbParentId = dbParentMap.get(rootEntry.sectionId);
          // Root nodes should have null parent_id OR their parent_id
          // doesn't exist in the section set (orphaned to root)
          const allSectionIds = new Set(dbSections.map((s) => s.section_id));
          const isNullParent = dbParentId === null || dbParentId === undefined;
          const isOrphanedParent =
            dbParentId !== null && dbParentId !== undefined && !allSectionIds.has(dbParentId);
          expect(isNullParent || isOrphanedParent).toBe(true);
        }),
        { numRuns: Math.min(rootNodes.length, 100) },
      );
    }
  });
});

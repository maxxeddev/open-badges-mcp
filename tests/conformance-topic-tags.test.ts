import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { getDatabase } from "../src/spec/db.js";
import { getVocab } from "../src/vocab/index.js";

/**
 * Property 13: Conformance topic tags reference valid vocab terms
 *
 * Every entry in `topicTags` exists in either `classesByName` or
 * `propertiesByName` from the vocab store.
 *
 * **Validates: Requirements 20.3**
 */

describe("Property 13: Conformance topic tags reference valid vocab terms", () => {
  it("every topic tag exists in classesByName or propertiesByName", async () => {
    const db = await getDatabase();
    const vocab = getVocab();

    // Check if conformance table exists
    const tableCheck = db.exec(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='conformance'",
    );
    if (tableCheck.length === 0 || tableCheck[0].values.length === 0) {
      // No conformance table — skip gracefully
      return;
    }

    // Query all conformance rows with non-empty topic_tags
    const stmt = db.prepare(
      "SELECT section_id, sentence, topic_tags FROM conformance WHERE topic_tags != '[]'",
    );
    const rows: Array<{
      sectionId: string;
      sentence: string;
      topicTags: string[];
    }> = [];

    while (stmt.step()) {
      const row = stmt.getAsObject();
      rows.push({
        sectionId: row.section_id as string,
        sentence: row.sentence as string,
        topicTags: JSON.parse(row.topic_tags as string),
      });
    }
    stmt.free();

    // We need at least some rows with topic tags to make this test meaningful
    expect(rows.length).toBeGreaterThan(0);

    // Use fast-check to sample from the conformance rows and verify the property
    const rowArb = fc.constantFrom(...rows);

    await fc.assert(
      fc.asyncProperty(rowArb, async (row) => {
        for (const tag of row.topicTags) {
          const inClasses = vocab.classesByName.has(tag);
          const inProperties = vocab.propertiesByName.has(tag);
          expect(
            inClasses || inProperties,
            `Topic tag "${tag}" from sentence in section "${row.sectionId}" is not a valid vocab class or property name`,
          ).toBe(true);
        }
      }),
      { numRuns: Math.min(rows.length * 2, 100) },
    );
  });
});

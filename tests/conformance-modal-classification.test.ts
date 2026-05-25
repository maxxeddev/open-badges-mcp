import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { getDatabase } from "../src/spec/db.js";

/**
 * Property 12: Conformance extractor modal classification
 *
 * For any sentence with RFC 2119 modal verb, extractor produces correctly
 * normalized `modal` field. If modal is "MUST", the sentence should contain
 * "MUST", "MUST NOT", or "REQUIRED". If modal is "SHOULD", the sentence
 * should contain "SHOULD" or "SHOULD NOT". If modal is "MAY", the sentence
 * should contain "MAY" or "OPTIONAL".
 *
 * **Validates: Requirements 20.1, 20.4**
 */

/**
 * Maps each normalized modal to the set of raw RFC 2119 verbs that produce it.
 */
const MODAL_SOURCES: Record<string, string[]> = {
  MUST: ["MUST", "MUST NOT", "REQUIRED"],
  SHOULD: ["SHOULD", "SHOULD NOT"],
  MAY: ["MAY", "OPTIONAL"],
};

describe("Property 12: Conformance extractor modal classification", () => {
  it("every stored conformance sentence contains a modal verb matching its normalized modal field", async () => {
    const db = await getDatabase();

    // Fetch all conformance rows
    const stmt = db.prepare("SELECT sentence, modal FROM conformance");
    const rows: Array<{ sentence: string; modal: string }> = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      rows.push({
        sentence: row.sentence as string,
        modal: row.modal as string,
      });
    }
    stmt.free();

    // Ensure we have data to test against
    expect(rows.length).toBeGreaterThan(0);

    // Use fast-check to sample from the conformance rows
    const rowArb = fc.constantFrom(...rows);

    await fc.assert(
      fc.asyncProperty(rowArb, async (row) => {
        const { sentence, modal } = row;

        // The normalized modal must be one of the valid values
        expect(["MUST", "SHOULD", "MAY"]).toContain(modal);

        // The sentence must contain at least one of the raw modal verbs
        // that map to the normalized modal value
        const expectedVerbs = MODAL_SOURCES[modal];
        const containsExpectedVerb = expectedVerbs.some((verb) => {
          // Use word boundary matching to avoid false positives
          const regex = new RegExp(`\\b${verb}\\b`);
          return regex.test(sentence);
        });

        expect(containsExpectedVerb).toBe(true);
      }),
      { numRuns: 200 },
    );
  });
});

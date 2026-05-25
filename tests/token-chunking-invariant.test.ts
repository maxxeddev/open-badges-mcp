import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { getDatabase } from "../src/spec/db.js";

/**
 * Property 11: Token chunking size invariant
 *
 * For any section body, each chunk contains at most 800 whitespace-delimited tokens.
 *
 * **Validates: Requirements 8.4**
 */

describe("Property 11: Token chunking size invariant", () => {
  it("every section body in the database contains at most 800 whitespace-delimited tokens", async () => {
    const db = await getDatabase();
    const results = db.exec("SELECT section_id, body FROM sections");

    expect(results.length).toBeGreaterThan(0);

    const rows = results[0].values as [string, string][];
    expect(rows.length).toBeGreaterThan(0);

    fc.assert(
      fc.property(fc.constantFrom(...rows), ([_sectionId, body]) => {
        const tokens = body.split(/\s+/).filter((t) => t.length > 0);
        expect(tokens.length).toBeLessThanOrEqual(800);
      }),
    );
  });
});

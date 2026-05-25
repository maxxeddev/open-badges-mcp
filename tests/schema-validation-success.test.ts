import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { getDatabase } from "../src/spec/db.js";
import { validateSchema } from "../src/validate/schema.js";

/**
 * Property 16: Schema validation returns empty errors for valid documents
 *
 * For any document conforming to OB3 schema, validator returns empty error array.
 *
 * **Validates: Requirements 17.4, 19.7**
 */

/**
 * Checks whether a parsed document is a well-formed OB3 credential
 * that should pass AchievementCredential schema validation.
 * The OB3 schema accepts both "AchievementCredential" and "OpenBadgeCredential"
 * as valid type values.
 */
function isValidOb3Credential(doc: Record<string, unknown>): boolean {
  // Must have @context as an array with VC v2 first and OB3 context second
  const ctx = doc["@context"];
  if (!Array.isArray(ctx) || ctx.length < 2) return false;
  if (ctx[0] !== "https://www.w3.org/ns/credentials/v2") return false;
  // Second entry must be an OB3 context URL
  if (typeof ctx[1] !== "string") return false;
  if (!ctx[1].includes("purl.imsglobal.org/spec/ob/v3p0/context")) return false;

  // Must have type array containing VerifiableCredential and one of the accepted types
  const types = doc.type;
  if (!Array.isArray(types)) return false;
  if (!types.includes("VerifiableCredential")) return false;
  if (!types.includes("AchievementCredential") && !types.includes("OpenBadgeCredential"))
    return false;

  // Must have required top-level fields per schema
  if (!doc.id || !doc.credentialSubject || !doc.issuer || !doc.validFrom) return false;

  return true;
}

describe("Property 16: Schema validation returns empty errors for valid documents", () => {
  it("validateSchema returns empty error array for valid OB3 credential examples from the spec", async () => {
    const db = await getDatabase();

    // Check if examples table exists
    const tableCheck = db.exec(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='examples'",
    );
    if (tableCheck.length === 0 || tableCheck[0].values.length === 0) {
      throw new Error("Examples table not found — run pnpm data:ingest first");
    }

    // Query OB3 examples that include OpenBadgeCredential or AchievementCredential
    const stmt = db.prepare(
      "SELECT example_id, code FROM examples WHERE spec = 'ob3' AND (classes_used LIKE '%OpenBadgeCredential%' OR classes_used LIKE '%AchievementCredential%')",
    );
    const examples: Array<{
      exampleId: string;
      code: string;
    }> = [];

    while (stmt.step()) {
      const row = stmt.getAsObject();
      const code = row.code as string;

      try {
        const parsed = JSON.parse(code) as Record<string, unknown>;
        if (isValidOb3Credential(parsed)) {
          examples.push({
            exampleId: row.example_id as string,
            code,
          });
        }
      } catch {
        // Skip non-parseable entries
      }
    }
    stmt.free();

    // We need at least one valid example to make this test meaningful
    expect(examples.length).toBeGreaterThan(0);

    // Use fast-check to sample from the valid examples and verify the property
    const exampleArb = fc.constantFrom(...examples);

    await fc.assert(
      fc.asyncProperty(exampleArb, async (example) => {
        const doc = JSON.parse(example.code) as Record<string, unknown>;
        const errors = validateSchema(doc);

        // Property: valid documents produce empty error array
        expect(errors).toEqual([]);
      }),
      { numRuns: Math.min(examples.length * 3, 100) },
    );
  });
});

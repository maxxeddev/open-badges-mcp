import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { getDatabase } from "../src/spec/db.js";

/**
 * Property 14: Example classes_used derived from type values
 *
 * For any extracted example, `classesUsed` contains exactly the class names
 * from `@type`/`type` fields found recursively in the JSON-LD code.
 *
 * **Validates: Requirements 14.3**
 */

/**
 * Recursively walk a parsed JSON object and extract all class names
 * from `@type` and `type` fields, stripping IRI prefixes.
 */
function extractClassNames(node: unknown): string[] {
  const classes = new Set<string>();
  walkForTypes(node, classes);
  return Array.from(classes).sort();
}

function walkForTypes(node: unknown, classes: Set<string>): void {
  if (!node || typeof node !== "object") return;

  if (Array.isArray(node)) {
    for (const item of node) {
      walkForTypes(item, classes);
    }
    return;
  }

  const obj = node as Record<string, unknown>;

  const typeVal = obj["@type"] ?? obj.type;
  if (typeVal) {
    const types = Array.isArray(typeVal) ? typeVal : [typeVal];
    for (const t of types) {
      if (typeof t === "string") {
        // Strip IRI prefix — take everything after the last # or /
        classes.add(t.replace(/.*[#/]/, ""));
      }
    }
  }

  for (const value of Object.values(obj)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        walkForTypes(item, classes);
      }
    } else if (typeof value === "object" && value !== null) {
      walkForTypes(value, classes);
    }
  }
}

describe("Property 14: Example classes_used derived from type values", () => {
  it("classesUsed matches exactly the class names derived from @type/type fields in code", async () => {
    const db = await getDatabase();

    // Check if examples table exists
    const tableCheck = db.exec(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='examples'",
    );
    if (tableCheck.length === 0 || tableCheck[0].values.length === 0) {
      // No examples table — skip gracefully
      return;
    }

    // Query all examples from the database
    const stmt = db.prepare("SELECT example_id, code, classes_used FROM examples");
    const examples: Array<{
      exampleId: string;
      code: string;
      classesUsed: string[];
    }> = [];

    while (stmt.step()) {
      const row = stmt.getAsObject();
      examples.push({
        exampleId: row.example_id as string,
        code: row.code as string,
        classesUsed: JSON.parse(row.classes_used as string),
      });
    }
    stmt.free();

    // We need at least some examples to make this test meaningful
    expect(examples.length).toBeGreaterThan(0);

    // Use fast-check to sample from the examples and verify the property
    const exampleArb = fc.constantFrom(...examples);

    await fc.assert(
      fc.asyncProperty(exampleArb, async (example) => {
        const parsed = JSON.parse(example.code);
        const derivedClasses = extractClassNames(parsed);
        const storedClasses = [...example.classesUsed].sort();

        expect(derivedClasses).toEqual(storedClasses);
      }),
      { numRuns: Math.min(examples.length * 2, 100) },
    );
  });
});

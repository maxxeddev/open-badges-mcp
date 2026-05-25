import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { handler } from "../src/tools/list_properties.js";
import { getVocab } from "../src/vocab/index.js";

/**
 * Property 1: list_properties returns complete structured entries for valid classes
 *
 * For any class in the Vocab_Store, calling `list_properties` with that class name
 * SHALL return an array of property entries where each entry contains `name`, `range`,
 * and `description` fields, and the array length equals the number of properties
 * associated with that class.
 *
 * **Validates: Requirements 1.4, 1.5**
 */

describe("Property 1: list_properties returns complete structured entries for valid classes", () => {
  const vocab = getVocab();
  const classNames = Array.from(vocab.classesByName.keys());

  // Arbitrary that picks any valid class name from the vocab store
  const classNameArb = fc.constantFrom(...classNames);

  it("returned array length equals number of properties for the class", async () => {
    await fc.assert(
      fc.asyncProperty(classNameArb, async (className) => {
        const result = await handler({ class_name: className });
        const parsed = JSON.parse(result.content[0].text);
        const classRecord = vocab.classesByName.get(className)!;

        expect(parsed.properties.length).toBe(classRecord.properties.length);
      }),
    );
  });

  it("each entry has a non-empty string `name` field", async () => {
    await fc.assert(
      fc.asyncProperty(classNameArb, async (className) => {
        const result = await handler({ class_name: className });
        const parsed = JSON.parse(result.content[0].text);

        for (const entry of parsed.properties) {
          expect(typeof entry.name).toBe("string");
          expect(entry.name.length).toBeGreaterThan(0);
        }
      }),
    );
  });

  it("each entry has an object `range` field with a `kind` discriminator", async () => {
    await fc.assert(
      fc.asyncProperty(classNameArb, async (className) => {
        const result = await handler({ class_name: className });
        const parsed = JSON.parse(result.content[0].text);

        for (const entry of parsed.properties) {
          expect(typeof entry.range).toBe("object");
          expect(entry.range).toHaveProperty("kind");
        }
      }),
    );
  });

  it("each entry has a string `description` field", async () => {
    await fc.assert(
      fc.asyncProperty(classNameArb, async (className) => {
        const result = await handler({ class_name: className });
        const parsed = JSON.parse(result.content[0].text);

        for (const entry of parsed.properties) {
          expect(typeof entry.description).toBe("string");
        }
      }),
    );
  });
});

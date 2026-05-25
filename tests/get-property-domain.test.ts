import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { handler } from "../src/tools/get_property.js";
import { getVocab } from "../src/vocab/index.js";

/**
 * Property 2: get_property returns complete record with all domain entries
 *
 * For any property in the Vocab_Store, calling `get_property` without `on_class`
 * SHALL return a response containing `name` (string), `iri` (string), `range` (string),
 * `description` (string), and `domain` (array). The `domain` array length SHALL equal
 * the number of domain entries for that property in the Vocab_Store.
 *
 * **Validates: Requirements 2.4, 2.6**
 */

describe("Property 2: get_property returns complete record with all domain entries", () => {
  const vocab = getVocab();
  const propertyNames = Array.from(vocab.propertiesByName.keys());

  // Arbitrary that picks a random property name from the vocab store
  const propertyNameArb = fc.constantFrom(...propertyNames);

  it("response contains name, iri, range, description, and domain fields", async () => {
    await fc.assert(
      fc.asyncProperty(propertyNameArb, async (propName) => {
        const result = await handler({ name: propName });
        const parsed = JSON.parse(result.content[0].text);

        expect(typeof parsed.name).toBe("string");
        expect(parsed.name.length).toBeGreaterThan(0);
        expect(typeof parsed.iri).toBe("string");
        expect(parsed.iri.length).toBeGreaterThan(0);
        expect(typeof parsed.range).toBe("string");
        expect(typeof parsed.description).toBe("string");
        expect(Array.isArray(parsed.domain)).toBe(true);
      }),
      { numRuns: propertyNames.length },
    );
  });

  it("domain array length equals number of domain entries in Vocab_Store", async () => {
    await fc.assert(
      fc.asyncProperty(propertyNameArb, async (propName) => {
        const result = await handler({ name: propName });
        const parsed = JSON.parse(result.content[0].text);

        const expectedProperty = vocab.propertiesByName.get(propName)!;
        expect(parsed.domain.length).toBe(expectedProperty.domain.length);
      }),
      { numRuns: propertyNames.length },
    );
  });

  it("each domain entry contains className and description fields", async () => {
    await fc.assert(
      fc.asyncProperty(propertyNameArb, async (propName) => {
        const result = await handler({ name: propName });
        const parsed = JSON.parse(result.content[0].text);

        for (const entry of parsed.domain) {
          expect(typeof entry.className).toBe("string");
          expect(entry.className.length).toBeGreaterThan(0);
          expect(typeof entry.description).toBe("string");
        }
      }),
      { numRuns: propertyNames.length },
    );
  });

  it("returned name matches the queried property name", async () => {
    await fc.assert(
      fc.asyncProperty(propertyNameArb, async (propName) => {
        const result = await handler({ name: propName });
        const parsed = JSON.parse(result.content[0].text);

        expect(parsed.name).toBe(propName);
      }),
      { numRuns: propertyNames.length },
    );
  });
});

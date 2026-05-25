import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { handler } from "../src/tools/get_property.js";
import { getVocab } from "../src/vocab/index.js";

/**
 * Property 3: get_property on_class filters to single domain entry
 *
 * For any valid property and class in its domain, assert `on_class` returns
 * exactly one domain entry matching that class.
 *
 * **Validates: Requirements 2.5**
 */

describe("Property 3: get_property on_class filters to single domain entry", () => {
  const vocab = getVocab();

  // Build an array of [propertyName, className] pairs from all properties and their domain entries
  const propertyClassPairs: [string, string][] = [];
  for (const [propertyName, propertyRecord] of vocab.propertiesByName) {
    for (const domainEntry of propertyRecord.domain) {
      propertyClassPairs.push([propertyName, domainEntry.className]);
    }
  }

  it("has at least one property-class pair to test", () => {
    expect(propertyClassPairs.length).toBeGreaterThan(0);
  });

  it("for any valid property and class in its domain, on_class returns exactly one domain entry matching that class", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...propertyClassPairs),
        async ([propertyName, className]) => {
          const result = await handler({ name: propertyName, on_class: className });
          const parsed = JSON.parse(result.content[0].text);

          // Should not be an error response
          expect(parsed.error).toBeUndefined();

          // Should have a domain array with exactly one entry
          expect(Array.isArray(parsed.domain)).toBe(true);
          expect(parsed.domain).toHaveLength(1);

          // The single domain entry should match the requested class
          expect(parsed.domain[0].className).toBe(className);
        },
      ),
      { numRuns: propertyClassPairs.length },
    );
  });
});

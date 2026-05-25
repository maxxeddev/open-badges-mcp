import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { searchSpec } from "../src/spec/index.js";

/**
 * Property 8: Search result spec filtering
 *
 * For any `search_spec` call with `spec` parameter, all results have matching
 * `spec` field.
 *
 * **Validates: Requirements 10.8**
 */

describe("Property 8: Search result spec filtering", () => {
  // Known search terms that are likely to produce results in the spec corpus
  const searchTerms = [
    "credential",
    "achievement",
    "issuer",
    "badge",
    "verification",
    "profile",
    "alignment",
    "evidence",
    "endorsement",
    "criteria",
    "result",
    "identity",
    "assertion",
    "recipient",
    "type",
    "name",
    "description",
    "image",
    "url",
  ];

  const specValues = ["ob3", "vc"] as const;

  const queryArb = fc.constantFrom(...searchTerms);
  const specArb = fc.constantFrom(...specValues);

  it("all results have spec field matching the spec filter parameter", async () => {
    await fc.assert(
      fc.asyncProperty(queryArb, specArb, async (query, spec) => {
        const results = await searchSpec(query, spec, 10);

        for (const result of results) {
          expect(result.spec).toBe(spec);
        }
      }),
      { numRuns: 50 },
    );
  });
});

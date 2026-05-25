import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { searchSpec } from "../src/spec/index.js";

/**
 * Property 9: Search result excerpt length invariant
 *
 * For any result from `search_spec`, the excerpt field contains at most
 * 300 whitespace-delimited tokens.
 *
 * **Validates: Requirements 10.6**
 */

describe("Property 9: Search result excerpt length invariant", () => {
  // Known search terms that are likely to produce results from the OB3/VC spec corpus
  const searchTerms = [
    "credential",
    "achievement",
    "issuer",
    "badge",
    "alignment",
    "evidence",
    "endorsement",
    "profile",
    "verification",
    "assertion",
    "criteria",
    "recipient",
    "identity",
    "revocation",
    "status",
    "type",
    "name",
    "description",
    "image",
    "url",
  ];

  // Arbitrary that picks a random search term
  const searchTermArb = fc.constantFrom(...searchTerms);

  // Arbitrary for the optional spec filter
  const specArb = fc.constantFrom(undefined, "ob3" as const, "vc" as const);

  // Arbitrary for limit (1 to 20)
  const limitArb = fc.integer({ min: 1, max: 20 });

  it("every excerpt has at most 300 whitespace-delimited tokens", async () => {
    await fc.assert(
      fc.asyncProperty(searchTermArb, specArb, limitArb, async (query, spec, limit) => {
        const results = await searchSpec(query, spec, limit);

        for (const result of results) {
          const tokenCount = result.excerpt.split(/\s+/).filter(Boolean).length;
          expect(tokenCount).toBeLessThanOrEqual(300);
        }
      }),
      { numRuns: 50 },
    );
  });
});

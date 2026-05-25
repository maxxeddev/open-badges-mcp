import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { searchSpec } from "../src/spec/index.js";

/**
 * Property 9: Search result excerpt length invariant
 *
 * For any result from `search_spec`, excerpt contains at most 300
 * whitespace-delimited tokens.
 *
 * **Validates: Requirements 10.6**
 */
describe("Property 9: Search result excerpt length invariant", () => {
  const searchTermArb = fc.constantFrom(
    "credential",
    "achievement",
    "issuer",
    "badge",
    "verification",
  );

  const specArb = fc.constantFrom(undefined, "ob3" as const, "vc" as const);
  const limitArb = fc.integer({ min: 1, max: 20 });

  it("every excerpt has at most 300 whitespace-delimited tokens", async () => {
    await fc.assert(
      fc.asyncProperty(searchTermArb, specArb, limitArb, async (query, spec, limit) => {
        const results = await searchSpec(query, spec, limit);

        for (const result of results) {
          const tokens = result.excerpt.split(/\s+/).filter(Boolean);
          expect(tokens.length).toBeLessThanOrEqual(300);
        }
      }),
      { numRuns: 50 },
    );
  });
});

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { validateJsonLd } from "../src/validate/jsonld.js";

/**
 * Property 18: JSON-LD validator uses local context (no network)
 *
 * Custom document loader resolves all context URLs from local snapshots.
 * Unknown context URLs cause error rather than remote fetch.
 *
 * **Validates: Requirements 18.3**
 */

describe("Property 18: JSON-LD validator uses local context (no network)", () => {
  /**
   * Generate random domain names and use them as unknown context URLs.
   * The validator should return an error about refusing to fetch remote contexts
   * rather than making network requests.
   */
  it("unknown context URLs cause error rather than remote fetch", async () => {
    // Generate random domain names for context URLs
    const domainArb = fc
      .tuple(
        fc.stringMatching(/^[a-z][a-z0-9]{2,10}$/),
        fc.constantFrom(".com", ".org", ".net", ".io", ".dev", ".xyz"),
      )
      .map(([name, tld]) => `${name}${tld}`);

    const unknownContextUrlArb = domainArb.map((domain) => `https://${domain}/context/v1`);

    await fc.assert(
      fc.asyncProperty(unknownContextUrlArb, async (unknownUrl) => {
        const doc = {
          "@context": [unknownUrl],
          type: "VerifiableCredential",
          credentialSubject: { id: "urn:example:subject:1" },
        };

        const result = await validateJsonLd(doc);

        // Should have at least one error about refusing to fetch remote context
        expect(result.errors.length).toBeGreaterThan(0);

        const hasRefusalError = result.errors.some(
          (e) =>
            e.message.includes("Refused to fetch remote context") ||
            e.message.includes("JSON-LD expansion failed"),
        );
        expect(hasRefusalError).toBe(true);
      }),
      { numRuns: 50 },
    );
  });

  it("known context URLs resolve successfully from local snapshots", async () => {
    // A document using the known OB3 context should NOT produce a "refused to fetch" error
    const doc = {
      "@context": [
        "https://www.w3.org/ns/credentials/v2",
        "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json",
      ],
      type: ["VerifiableCredential", "OpenBadgeCredential"],
      issuer: { id: "https://example.org/issuer", type: "Profile" },
      credentialSubject: {
        id: "urn:example:subject:1",
        type: "AchievementSubject",
        achievement: {
          id: "urn:example:achievement:1",
          type: "Achievement",
          name: "Test Achievement",
          criteria: { narrative: "Did something" },
        },
      },
    };

    const result = await validateJsonLd(doc);

    // Should NOT have any "refused to fetch" errors
    const hasRefusalError = result.errors.some(
      (e) =>
        e.message.includes("Refused to fetch remote context") ||
        e.message.includes("JSON-LD expansion failed"),
    );
    expect(hasRefusalError).toBe(false);
  });
});

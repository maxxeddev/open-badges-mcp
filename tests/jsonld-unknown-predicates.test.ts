import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { validateJsonLd } from "../src/validate/jsonld.js";

/**
 * Property 17: JSON-LD validator flags unknown predicates
 *
 * For any document with a predicate IRI not in local vocab graph,
 * validator includes it in errors.
 *
 * **Validates: Requirements 18.4, 18.5**
 */

describe("Property 17: JSON-LD validator flags unknown predicates", () => {
  // Generate a random field name that won't collide with known OB3/VC terms
  const fieldNameArb = fc.stringMatching(/^[a-z][a-z0-9]{4,12}$/).filter(
    (name) =>
      // Exclude terms that might collide with known context terms
      !["type", "id", "name", "image", "description", "proof"].includes(name),
  );

  // Generate a random IRI namespace that won't match known vocab namespaces
  const iriNamespaceArb = fc
    .stringMatching(/^[a-z]{3,8}$/)
    .map((ns) => `https://example.org/unknown-ns/${ns}#`);

  it("flags unknown predicates defined via inline context with random IRIs", async () => {
    await fc.assert(
      fc.asyncProperty(fieldNameArb, iriNamespaceArb, async (fieldName, iriNamespace) => {
        const unknownIri = `${iriNamespace}${fieldName}`;

        // Build a minimal credential with an inline context that defines
        // an unknown predicate mapping to a random IRI.
        // The unknown field is placed at the top level so JSON-LD expansion
        // resolves it (nested fields under @protected contexts get dropped).
        const doc = {
          "@context": [
            "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json",
            {
              [fieldName]: unknownIri,
            },
          ],
          type: ["VerifiableCredential", "OpenBadgeCredential"],
          [fieldName]: "some-value",
        };

        const { errors } = await validateJsonLd(doc as unknown as Record<string, unknown>);

        // The unknown predicate IRI should appear in at least one error message
        const matchingError = errors.find((e) => e.message.includes(unknownIri));
        expect(matchingError).toBeDefined();
        expect(matchingError!.message).toContain("Unknown predicate");
        expect(matchingError!.severity).toBe("warning");
      }),
      { numRuns: 20 },
    );
  });

  it("flags multiple unknown predicates in the same document", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fieldNameArb, { minLength: 2, maxLength: 4 }),
        iriNamespaceArb,
        async (fieldNames, iriNamespace) => {
          // Ensure unique field names
          const uniqueFields = [...new Set(fieldNames)];
          if (uniqueFields.length < 2) return; // skip if deduplication reduced below 2

          // Build inline context with multiple unknown predicates
          const inlineContext: Record<string, string> = {};
          const expectedIris: string[] = [];
          for (const name of uniqueFields) {
            const iri = `${iriNamespace}${name}`;
            inlineContext[name] = iri;
            expectedIris.push(iri);
          }

          // Build document using all unknown predicates at the top level
          const doc: Record<string, unknown> = {
            "@context": [
              "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json",
              inlineContext,
            ],
            type: ["VerifiableCredential", "OpenBadgeCredential"],
          };
          for (const name of uniqueFields) {
            doc[name] = "test-value";
          }

          const { errors } = await validateJsonLd(doc as Record<string, unknown>);

          // Each unknown IRI should be flagged
          for (const iri of expectedIris) {
            const matchingError = errors.find((e) => e.message.includes(iri));
            expect(matchingError).toBeDefined();
          }
        },
      ),
      { numRuns: 15 },
    );
  });
});

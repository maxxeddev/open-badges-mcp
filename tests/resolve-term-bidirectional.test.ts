import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { getContextStore, resolveTerm } from "../src/context/index.js";

/**
 * Property 5: resolve_term bidirectional correctness
 *
 * For any term in the Context_Store, `resolve_term` returns `kind: "term"` with
 * correct IRI and valid `definedIn`.
 * For any IRI in the Context_Store, `resolve_term` returns `kind: "iri"` with
 * correct term.
 *
 * **Validates: Requirements 6.3, 6.4, 6.5, 6.6**
 */

describe("Property 5: resolve_term bidirectional correctness", () => {
  const ctx = getContextStore();
  const terms = Array.from(ctx.termToIri.keys());
  // Filter IRIs to only those that are NOT also terms (since resolveTerm checks termToIri first)
  const iris = Array.from(ctx.iriToTerm.keys()).filter((iri) => !ctx.termToIri.has(iri));

  const validDefinedIn = ["ob", "vc", "schema", "other"];

  const termArb = fc.constantFrom(...terms);
  const iriArb = fc.constantFrom(...iris);

  it("for any term, resolveTerm returns kind 'term' with correct IRI and valid definedIn", () => {
    fc.assert(
      fc.property(termArb, (term) => {
        const result = resolveTerm(term);

        expect(result).not.toBeNull();
        expect(result!.kind).toBe("term");
        expect(result!.term).toBe(term);
        expect(result!.iri).toBe(ctx.termToIri.get(term));
        expect(validDefinedIn).toContain(result!.definedIn);
      }),
    );
  });

  it("for any IRI, resolveTerm returns kind 'iri' with correct term and valid definedIn", () => {
    fc.assert(
      fc.property(iriArb, (iri) => {
        const result = resolveTerm(iri);

        expect(result).not.toBeNull();
        expect(result!.kind).toBe("iri");
        expect(result!.iri).toBe(iri);
        expect(result!.term).toBe(ctx.iriToTerm.get(iri));
        expect(validDefinedIn).toContain(result!.definedIn);
      }),
    );
  });
});

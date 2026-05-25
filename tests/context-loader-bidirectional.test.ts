import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { getContextStore } from "../src/context/index.js";

/**
 * Property 4: Context loader bidirectional map consistency (round-trip)
 *
 * For any term in `termToIri`, looking up the IRI in `iriToTerm` returns the original term.
 * For any IRI in `iriToTerm`, looking up the term in `termToIri` returns the original IRI.
 *
 * **Validates: Requirements 4.3, 4.4**
 */

describe("Property 4: Context loader bidirectional map consistency (round-trip)", () => {
  const store = getContextStore();
  const termEntries = Array.from(store.termToIri.entries());
  const iriEntries = Array.from(store.iriToTerm.entries());

  it("for any term in termToIri, looking up the IRI in iriToTerm returns the original term", () => {
    fc.assert(
      fc.property(fc.constantFrom(...termEntries), ([term, iri]) => {
        const resolvedTerm = store.iriToTerm.get(iri);
        expect(resolvedTerm).toBe(term);
      }),
    );
  });

  it("for any IRI in iriToTerm, looking up the term in termToIri returns the original IRI", () => {
    fc.assert(
      fc.property(fc.constantFrom(...iriEntries), ([iri, term]) => {
        const resolvedIri = store.termToIri.get(term);
        expect(resolvedIri).toBe(iri);
      }),
    );
  });
});

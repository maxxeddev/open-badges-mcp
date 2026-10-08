import { describe, expect, it } from "vitest";
import { getContextStore } from "../src/context/index.js";

/**
 * Property 4: Context loader map consistency (round-trip)
 *
 * The loader walks type-scoped `@context` blocks as well as the top level, so
 * `termToIri` covers the whole vocabulary. That makes the term -> IRI direction
 * many-to-one: the OB3 context deliberately points a property term at the class
 * IRI that types its value (`criteria` -> #Criteria, `geo` -> #GeoCoordinates),
 * so those IRIs are reachable from two different terms.
 *
 * The invariants that hold are therefore:
 *
 *   1. termToIri is a function — every term resolves to exactly one IRI.
 *   2. iriToTerm round-trips exactly: termToIri[iriToTerm[iri]] === iri.
 *   3. Every term round-trips to a term sharing its IRI — not necessarily
 *      itself, because iriToTerm keeps one canonical label per IRI.
 *   4. Top-level terms win: a scoped term never shadows a top-level one.
 *
 * These are checked exhaustively rather than by sampling. The map has ~140
 * entries and only two of them exercise the many-to-one case, which random
 * sampling can miss entirely.
 *
 * **Validates: Requirements 4.3, 4.4**
 */

describe("Property 4: Context loader map consistency (round-trip)", () => {
  const store = getContextStore();
  const termEntries = Array.from(store.termToIri.entries());
  const iriEntries = Array.from(store.iriToTerm.entries());

  it("resolves every term to exactly one IRI", () => {
    expect(termEntries.length).toBeGreaterThan(0);
    for (const [term, iri] of termEntries) {
      expect(typeof iri, `term "${term}" must map to a string IRI`).toBe("string");
      expect(iri.length, `term "${term}" must map to a non-empty IRI`).toBeGreaterThan(0);
    }
  });

  it("round-trips every IRI back to the same IRI through its canonical term", () => {
    expect(iriEntries.length).toBeGreaterThan(0);
    for (const [iri, term] of iriEntries) {
      expect(store.termToIri.get(term), `iriToTerm["${iri}"] = "${term}" must map back`).toBe(iri);
    }
  });

  it("round-trips every term to a term sharing its IRI", () => {
    for (const [term, iri] of termEntries) {
      const canonical = store.iriToTerm.get(iri);
      expect(
        canonical,
        `IRI "${iri}" (from term "${term}") must have a canonical term`,
      ).toBeDefined();
      expect(
        store.termToIri.get(canonical as string),
        `"${term}" and canonical "${canonical}" must agree on their IRI`,
      ).toBe(iri);
    }
  });

  it("keeps top-level terms canonical over same-named type-scoped terms", () => {
    const topLevel = store.rawContext["@context"] as Record<string, unknown>;

    for (const [key, value] of Object.entries(topLevel)) {
      if (key.startsWith("@")) continue;
      const iri = typeof value === "string" ? value : (value as Record<string, string>)?.["@id"];
      if (typeof iri !== "string") continue;

      expect(store.termToIri.get(key), `top-level term "${key}" must keep its own IRI`).toBe(iri);
      expect(
        store.iriToTerm.get(iri),
        `IRI "${iri}" must stay labelled by top-level "${key}"`,
      ).toBe(key);
    }
  });

  it("exposes terms that only exist inside type-scoped contexts", () => {
    // `achievement` lives in AchievementSubject's scoped @context and is absent
    // from the top level. It is the example in resolve_term's own description.
    expect(store.termToIri.get("achievement")).toBe(
      "https://purl.imsglobal.org/spec/vc/ob/vocab.html#achievement",
    );
    expect(store.termToIri.has("criteria")).toBe(true);
    expect(store.termToIri.has("achievementType")).toBe(true);
  });
});

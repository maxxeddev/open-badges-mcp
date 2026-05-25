import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Parser, Store } from "n3";
import { describe, expect, it } from "vitest";
import { loadVocab } from "../src/vocab/loader.js";

/**
 * Property 1: Vocabulary loader produces complete maps from RDF triples
 *
 * For any valid Turtle file containing OWL/RDFS class and property declarations,
 * parsing it with the vocabulary loader SHALL produce a `classesByName` map
 * containing every declared class keyed by local name, and a `propertiesByName`
 * map containing every declared property keyed by local name.
 *
 * **Validates: Requirements 5.3, 5.4**
 */

const RDF = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
const RDFS = "http://www.w3.org/2000/01/rdf-schema#";
const OWL = "http://www.w3.org/2002/07/owl#";

function localName(iri: string): string {
  const hashIdx = iri.lastIndexOf("#");
  if (hashIdx !== -1) return iri.slice(hashIdx + 1);
  const slashIdx = iri.lastIndexOf("/");
  return iri.slice(slashIdx + 1);
}

describe("Property 1: Vocabulary loader produces complete maps from RDF triples", () => {
  const vocabPath = join(import.meta.dirname, "..", "data", "snapshots", "3.0.3", "vocab.ttl");
  const ttlContent = readFileSync(vocabPath, "utf-8");

  // Independently parse the vocab.ttl using n3
  const store = new Store();
  const parser = new Parser();
  store.addQuads(parser.parse(ttlContent));

  // Load vocab using the loader under test
  const vocab = loadVocab("3.0.3");

  it("classesByName is non-empty", () => {
    expect(vocab.classesByName.size).toBeGreaterThan(0);
  });

  it("propertiesByName is non-empty", () => {
    expect(vocab.propertiesByName.size).toBeGreaterThan(0);
  });

  it("every OWL/RDFS class in the RDF store appears in classesByName", () => {
    const classQuads = [
      ...store.getQuads(null, `${RDF}type`, `${OWL}Class`, null),
      ...store.getQuads(null, `${RDF}type`, `${RDFS}Class`, null),
    ];

    // Deduplicate by local name (same logic as the loader)
    const expectedClassNames = new Set<string>();
    for (const quad of classQuads) {
      expectedClassNames.add(localName(quad.subject.value));
    }

    expect(expectedClassNames.size).toBeGreaterThan(0);

    for (const name of expectedClassNames) {
      expect(
        vocab.classesByName.has(name),
        `Expected classesByName to contain class "${name}"`,
      ).toBe(true);
    }
  });

  it("every declared property in the RDF store appears in propertiesByName", () => {
    const propQuads = [
      ...store.getQuads(null, `${RDF}type`, `${OWL}DatatypeProperty`, null),
      ...store.getQuads(null, `${RDF}type`, `${OWL}ObjectProperty`, null),
      ...store.getQuads(null, `${RDF}type`, `${RDF}Property`, null),
    ];

    // Deduplicate by local name (same logic as the loader)
    const expectedPropNames = new Set<string>();
    for (const quad of propQuads) {
      expectedPropNames.add(localName(quad.subject.value));
    }

    expect(expectedPropNames.size).toBeGreaterThan(0);

    for (const name of expectedPropNames) {
      expect(
        vocab.propertiesByName.has(name),
        `Expected propertiesByName to contain property "${name}"`,
      ).toBe(true);
    }
  });
});

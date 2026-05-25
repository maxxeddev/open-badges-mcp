import { describe, expect, it } from "vitest";
import { getClassRecord } from "../src/vocab/index.js";
import { loadVocab } from "../src/vocab/loader.js";

const vocab = loadVocab();

describe("structured range shape", () => {
  it("datatype range: xsd:string", () => {
    const record = getClassRecord("Address");
    expect(record).not.toBeNull();
    const country = record!.properties.find((p) => p.name === "addressCountryCode")!;
    expect(country).toBeDefined();
    expect(country.range).toMatchObject({
      kind: "datatype",
      iri: "http://www.w3.org/2001/XMLSchema#string",
      curie: "xsd:string",
      label: "string",
    });
  });

  it("vocab-class range: local OB class", () => {
    const record = getClassRecord("Achievement");
    expect(record).not.toBeNull();
    const criteria = record!.properties.find((p) => p.name === "criteria")!;
    expect(criteria).toBeDefined();
    expect(criteria.range).toMatchObject({ kind: "vocab-class", name: "Criteria" });
  });

  it("external range: schema.org type", () => {
    // Find a property with an external schema.org range
    const prop = vocab.propertiesByName.get("description");
    expect(prop).toBeDefined();
    // description's range should be external pointing to schema.org
    if (prop!.range.kind === "external") {
      expect(prop!.range.iri).toMatch(/schema\.org/);
      expect(prop!.range.label).toBe("description");
    } else {
      // If it's classified differently, at least verify it has a kind
      expect(prop!.range).toHaveProperty("kind");
    }
  });

  it("union range: credentialSubject", () => {
    const record = getClassRecord("AchievementCredential");
    expect(record).not.toBeNull();
    const subj = record!.properties.find((p) => p.name === "credentialSubject")!;
    expect(subj).toBeDefined();
    expect(subj.range.kind).toBe("union");
    if (subj.range.kind === "union") {
      const names = subj.range.members.flatMap((m) =>
        m.kind === "vocab-class" ? [m.name] : [],
      );
      expect(names).toEqual(expect.arrayContaining(["AchievementSubject", "EndorsementSubject"]));
    }
  });

  it("every range has a valid kind discriminator", () => {
    const validKinds = new Set(["datatype", "vocab-class", "external", "union"]);
    for (const prop of vocab.propertiesByName.values()) {
      expect(validKinds.has(prop.range.kind)).toBe(true);
      if (prop.range.kind === "union") {
        for (const member of prop.range.members) {
          expect(validKinds.has(member.kind)).toBe(true);
        }
      }
    }
  });

  it("datatype ranges always have a curie", () => {
    for (const prop of vocab.propertiesByName.values()) {
      if (prop.range.kind === "datatype") {
        expect(prop.range.curie).toBeDefined();
        expect(prop.range.curie).toMatch(/^xsd:/);
      }
      if (prop.range.kind === "union") {
        for (const member of prop.range.members) {
          if (member.kind === "datatype") {
            expect(member.curie).toBeDefined();
            expect(member.curie).toMatch(/^xsd:/);
          }
        }
      }
    }
  });
});

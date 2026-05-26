import { describe, expect, it } from "vitest";
import { getClassRecord } from "../src/vocab/index.js";
import { loadVocab } from "../src/vocab/loader.js";

const vocab = loadVocab();

describe("structured range shape", () => {
  it("xsd datatype: addressCountryCode → xsd:string", () => {
    const record = getClassRecord("Address");
    expect(record).not.toBeNull();
    const country = record!.properties.find((p) => p.name === "addressCountryCode")!;
    expect(country).toBeDefined();
    expect(country.range).toEqual([
      {
        kind: "datatype",
        iri: "http://www.w3.org/2001/XMLSchema#string",
        curie: "xsd:string",
        label: "string",
      },
    ]);
  });

  it("local vocab class: criteria → Criteria", () => {
    const record = getClassRecord("Achievement");
    expect(record).not.toBeNull();
    const criteria = record!.properties.find((p) => p.name === "criteria")!;
    expect(criteria).toBeDefined();
    expect(criteria.range).toHaveLength(1);
    expect(criteria.range[0]).toMatchObject({ kind: "vocab-class", className: "Criteria" });
  });

  it("external (schema.org): description on AchievementCredential", () => {
    const cred = getClassRecord("AchievementCredential");
    expect(cred).not.toBeNull();
    const p = cred!.properties.find((p) => p.name === "description")!;
    expect(p).toBeDefined();
    expect(p.range).toHaveLength(1);
    expect(p.range[0]).toMatchObject({
      kind: "external",
      curie: expect.stringMatching(/^schema:description$/),
      iri: expect.stringMatching(/schema\.org\/description$/),
    });
  });

  it("union: credentialSubject → AchievementSubject + EndorsementSubject", () => {
    const cred = getClassRecord("AchievementCredential");
    expect(cred).not.toBeNull();
    const p = cred!.properties.find((p) => p.name === "credentialSubject")!;
    expect(p).toBeDefined();
    const names = p.range.flatMap((m) => (m.kind === "vocab-class" ? [m.className] : []));
    expect(names).toEqual(expect.arrayContaining(["AchievementSubject", "EndorsementSubject"]));
  });

  it("every property has a non-empty range array", () => {
    const emptyRanges: string[] = [];
    for (const prop of vocab.propertiesByName.values()) {
      if (prop.range.length === 0) {
        emptyRanges.push(prop.name);
      }
    }
    expect(emptyRanges).toEqual([]);
  });

  it("every range member has a valid kind discriminator", () => {
    const validKinds = new Set(["datatype", "vocab-class", "external"]);
    for (const prop of vocab.propertiesByName.values()) {
      for (const member of prop.range) {
        expect(validKinds.has(member.kind)).toBe(true);
      }
    }
  });

  it("datatype ranges always have a curie", () => {
    for (const prop of vocab.propertiesByName.values()) {
      for (const member of prop.range) {
        if (member.kind === "datatype") {
          expect(member.curie).toBeDefined();
          expect(member.curie).toMatch(/^xsd:/);
        }
      }
    }
  });
});

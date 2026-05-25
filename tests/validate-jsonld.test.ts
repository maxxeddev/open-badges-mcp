import { describe, expect, it } from "vitest";
import { validateJsonLd } from "../src/validate/jsonld.js";

describe("validateJsonLd", () => {
  it("returns no errors for a valid OB3 credential with known predicates", async () => {
    const doc = {
      "@context": [
        "https://www.w3.org/ns/credentials/v2",
        "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json",
      ],
      type: ["VerifiableCredential", "OpenBadgeCredential"],
      id: "http://example.edu/credentials/3732",
      issuer: {
        id: "https://example.edu/issuers/565049",
        type: "Profile",
        name: "Example University",
      },
      validFrom: "2010-01-01T00:00:00Z",
      credentialSubject: {
        id: "did:example:ebfeb1f712ebc6f1c276e12ec21",
        type: "AchievementSubject",
        achievement: {
          id: "https://example.edu/achievements/123",
          type: "Achievement",
          name: "Example Achievement",
          criteria: {
            id: "https://example.edu/achievements/123/criteria",
          },
        },
      },
    };

    const result = await validateJsonLd(doc);
    expect(result.expanded).toBeDefined();
    expect(result.expanded.length).toBeGreaterThan(0);
    // Should have no errors for known predicates
    const errorPredicates = result.errors.filter((e) => e.severity === "error");
    expect(errorPredicates).toHaveLength(0);
  });

  it("flags unknown predicates as warnings", async () => {
    const doc = {
      "@context": [
        "https://www.w3.org/ns/credentials/v2",
        "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json",
        {
          unknownField: "http://example.org/unknown#unknownField",
        },
      ],
      type: ["VerifiableCredential", "OpenBadgeCredential"],
      id: "http://example.edu/credentials/3732",
      issuer: "https://example.edu/issuers/565049",
      validFrom: "2010-01-01T00:00:00Z",
      unknownField: "some value",
      credentialSubject: {
        id: "did:example:ebfeb1f712ebc6f1c276e12ec21",
        type: "AchievementSubject",
      },
    };

    const result = await validateJsonLd(doc);
    const unknownErrors = result.errors.filter((e) => e.message.includes("Unknown predicate"));
    expect(unknownErrors.length).toBeGreaterThan(0);
    expect(unknownErrors[0].message).toContain("http://example.org/unknown#unknownField");
    expect(unknownErrors[0].severity).toBe("warning");
  });

  it("refuses remote context fetches", async () => {
    const doc = {
      "@context": [
        "https://www.w3.org/ns/credentials/v2",
        "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json",
        "https://example.org/remote-context.json",
      ],
      type: "VerifiableCredential",
      id: "http://example.edu/credentials/1",
    };

    const result = await validateJsonLd(doc);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].severity).toBe("error");
    expect(result.errors[0].message).toContain("JSON-LD expansion failed");
    expect(result.errors[0].message).toContain("https://example.org/remote-context.json");
  });

  it("handles expansion failure gracefully", async () => {
    const doc = {
      "@context": "https://unknown-context.example.org/v1",
      type: "SomeType",
    };

    const result = await validateJsonLd(doc);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].severity).toBe("error");
    expect(result.errors[0].message).toContain("JSON-LD expansion failed");
    expect(result.errors[0].message).toContain("https://unknown-context.example.org/v1");
    expect(result.expanded).toEqual([]);
  });

  it("works with VC v1 context URL", async () => {
    const doc = {
      "@context": [
        "https://www.w3.org/2018/credentials/v1",
        "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json",
      ],
      type: ["VerifiableCredential", "OpenBadgeCredential"],
      id: "http://example.edu/credentials/3732",
      issuer: "https://example.edu/issuers/565049",
      issuanceDate: "2010-01-01T00:00:00Z",
      credentialSubject: {
        id: "did:example:ebfeb1f712ebc6f1c276e12ec21",
        type: "AchievementSubject",
      },
    };

    const result = await validateJsonLd(doc);
    expect(result.expanded).toBeDefined();
    expect(result.expanded.length).toBeGreaterThan(0);
    // Should not have expansion errors
    const expansionErrors = result.errors.filter((e) => e.severity === "error");
    expect(expansionErrors).toHaveLength(0);
  });

  it("returns expanded form with @type and predicate IRIs", async () => {
    const doc = {
      "@context": [
        "https://www.w3.org/ns/credentials/v2",
        "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json",
      ],
      type: ["VerifiableCredential", "OpenBadgeCredential"],
      id: "http://example.edu/credentials/3732",
      issuer: "https://example.edu/issuers/565049",
      validFrom: "2010-01-01T00:00:00Z",
      credentialSubject: {
        id: "did:example:ebfeb1f712ebc6f1c276e12ec21",
        type: "AchievementSubject",
      },
    };

    const result = await validateJsonLd(doc);
    expect(result.expanded.length).toBeGreaterThan(0);
    const first = result.expanded[0];
    // Should have @type expanded
    expect(first["@type"]).toBeDefined();
    // Should have @id
    expect(first["@id"]).toBe("http://example.edu/credentials/3732");
  });
});

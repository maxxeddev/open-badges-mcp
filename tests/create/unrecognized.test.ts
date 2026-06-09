/**
 * Unit tests for detectUnrecognizedFields.
 * Validates Requirements 3.1, 3.2, 3.3, 3.4
 */

import { describe, expect, it } from "vitest";
import { WARNING_UNRECOGNIZED_FIELD } from "../../src/create/types.js";
import { detectUnrecognizedFields } from "../../src/create/unrecognized.js";

describe("detectUnrecognizedFields", () => {
  // --- Requirement 3.4: No warning for fully recognized input ---

  it("emits no warnings for a fully recognized minimal input", () => {
    const input = {
      issuer: { name: "Test Issuer" },
      achievement: {
        name: "Test Achievement",
        description: "A description",
        criteria: { narrative: "Completed the course" },
      },
      recipient: { id: "did:example:123" },
    };

    const warnings = detectUnrecognizedFields(input);
    expect(warnings).toHaveLength(0);
  });

  it("emits no warnings when all recognized fields are present", () => {
    const input = {
      id: "urn:uuid:abc",
      issuer: {
        id: "did:example:issuer",
        name: "Issuer",
        url: "https://example.com",
        email: "test@example.com",
        description: "An issuer",
        image: "https://example.com/logo.png",
      },
      achievement: {
        id: "urn:uuid:ach",
        name: "Achievement",
        description: "Desc",
        criteria: { id: "https://example.com/criteria" },
        achievementType: "Course",
        image: "https://example.com/badge.png",
        tag: ["tag1", "tag2"],
        alignment: [{ targetUrl: "https://example.com" }],
        related: [{ id: "urn:uuid:rel" }],
      },
      recipient: {
        id: "did:example:recipient",
        identifier: {
          identityType: "emailAddress",
          identityHash: "sha256$abc",
          hashed: true,
          salt: "salt123",
        },
      },
      awardedDate: "2024-01-01",
      validFrom: "2024-01-01",
      validUntil: "2025-01-01",
      evidence: [
        {
          id: "https://example.com/ev",
          name: "Evidence",
          description: "Desc",
          narrative: "Narr",
          genre: "portfolio",
        },
      ],
      image: { id: "https://example.com/img.png", caption: "A caption" },
      result: [{ type: "Result", value: "Pass" }],
      source: { id: "https://example.com/source" },
      proof: { type: "DataIntegrityProof", proofValue: "abc" },
      credentialStatus: { type: "StatusList2021Entry" },
      endorsement: [{ type: "EndorsementCredential" }],
      termsOfUse: { type: "IssuerPolicy" },
      refreshService: { type: "ManualRefreshService2018" },
      credentialSchema: { id: "https://example.com/schema" },
    };

    const warnings = detectUnrecognizedFields(input);
    expect(warnings).toHaveLength(0);
  });

  // --- Requirement 3.1: Warning naming the path ---

  it("emits a warning for a top-level unrecognized field", () => {
    const input = {
      issuer: { name: "Test" },
      achievement: {
        name: "Ach",
        description: "Desc",
        criteria: { narrative: "Done" },
      },
      recipient: { id: "did:example:123" },
      unknownTopLevel: "value",
    };

    const warnings = detectUnrecognizedFields(input);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].param).toBe("unknownTopLevel");
  });

  it("emits a warning for a nested unrecognized field in issuer", () => {
    const input = {
      issuer: { name: "Test", unknownField: "extra" },
      achievement: {
        name: "Ach",
        description: "Desc",
        criteria: { narrative: "Done" },
      },
      recipient: { id: "did:example:123" },
    };

    const warnings = detectUnrecognizedFields(input);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].param).toBe("issuer.unknownField");
  });

  it("emits a warning for a nested unrecognized field in achievement", () => {
    const input = {
      issuer: { name: "Test" },
      achievement: {
        name: "Ach",
        description: "Desc",
        criteria: { narrative: "Done" },
        extraField: true,
      },
      recipient: { id: "did:example:123" },
    };

    const warnings = detectUnrecognizedFields(input);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].param).toBe("achievement.extraField");
  });

  it("emits a warning for unrecognized fields inside evidence array elements", () => {
    const input = {
      issuer: { name: "Test" },
      achievement: {
        name: "Ach",
        description: "Desc",
        criteria: { narrative: "Done" },
      },
      recipient: { id: "did:example:123" },
      evidence: [{ name: "Ev", extraProp: "oops" }],
    };

    const warnings = detectUnrecognizedFields(input);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].param).toBe("evidence[0].extraProp");
  });

  // --- Requirement 3.2: Distinct warning code ---

  it("uses the WARNING_UNRECOGNIZED_FIELD code", () => {
    const input = {
      issuer: { name: "Test" },
      achievement: {
        name: "Ach",
        description: "Desc",
        criteria: { narrative: "Done" },
      },
      recipient: { id: "did:example:123" },
      foo: "bar",
    };

    const warnings = detectUnrecognizedFields(input);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].code).toBe(WARNING_UNRECOGNIZED_FIELD);
    expect(warnings[0].code).toBe("unrecognized_field");
  });

  // --- Pass-through rich-tier sub-trees are recognized ---

  it("does not warn for deep structures under pass-through fields like proof", () => {
    const input = {
      issuer: { name: "Test" },
      achievement: {
        name: "Ach",
        description: "Desc",
        criteria: { narrative: "Done" },
      },
      recipient: { id: "did:example:123" },
      proof: {
        type: "DataIntegrityProof",
        cryptosuite: "eddsa-rdfc-2022",
        proofValue: "z...",
        verificationMethod: "did:key:z...",
        deeply: { nested: { field: true } },
      },
    };

    const warnings = detectUnrecognizedFields(input);
    expect(warnings).toHaveLength(0);
  });

  it("does not warn for any content inside result array elements", () => {
    const input = {
      issuer: { name: "Test" },
      achievement: {
        name: "Ach",
        description: "Desc",
        criteria: { narrative: "Done" },
      },
      recipient: { id: "did:example:123" },
      result: [{ type: "Result", value: "A+", customField: 42, nested: { deep: true } }],
    };

    const warnings = detectUnrecognizedFields(input);
    expect(warnings).toHaveLength(0);
  });

  it("does not warn for any content inside source", () => {
    const input = {
      issuer: { name: "Test" },
      achievement: {
        name: "Ach",
        description: "Desc",
        criteria: { narrative: "Done" },
      },
      recipient: { id: "did:example:123" },
      source: { anything: "goes", nested: { stuff: [1, 2, 3] } },
    };

    const warnings = detectUnrecognizedFields(input);
    expect(warnings).toHaveLength(0);
  });

  it("does not warn for content inside alignment/related array elements", () => {
    const input = {
      issuer: { name: "Test" },
      achievement: {
        name: "Ach",
        description: "Desc",
        criteria: { narrative: "Done" },
        alignment: [{ targetUrl: "https://x.com", customField: "ok" }],
        related: [{ id: "urn:uuid:1", arbitraryProp: 123 }],
      },
      recipient: { id: "did:example:123" },
    };

    const warnings = detectUnrecognizedFields(input);
    expect(warnings).toHaveLength(0);
  });

  // --- Multiple unrecognized fields ---

  it("emits one warning per unrecognized field", () => {
    const input = {
      issuer: { name: "Test" },
      achievement: {
        name: "Ach",
        description: "Desc",
        criteria: { narrative: "Done" },
      },
      recipient: { id: "did:example:123" },
      extra1: "a",
      extra2: "b",
      extra3: "c",
    };

    const warnings = detectUnrecognizedFields(input);
    expect(warnings).toHaveLength(3);
    const params = warnings.map((w) => w.param);
    expect(params).toContain("extra1");
    expect(params).toContain("extra2");
    expect(params).toContain("extra3");
  });

  // --- Edge cases ---

  it("returns empty array for null input", () => {
    const warnings = detectUnrecognizedFields(null);
    expect(warnings).toHaveLength(0);
  });

  it("returns empty array for non-object input", () => {
    const warnings = detectUnrecognizedFields("string");
    expect(warnings).toHaveLength(0);
  });

  it("returns empty array for array input", () => {
    const warnings = detectUnrecognizedFields([1, 2, 3]);
    expect(warnings).toHaveLength(0);
  });

  it("handles image as a plain string (no children to recurse into)", () => {
    const input = {
      issuer: { name: "Test" },
      achievement: {
        name: "Ach",
        description: "Desc",
        criteria: { narrative: "Done" },
      },
      recipient: { id: "did:example:123" },
      image: "https://example.com/badge.png",
    };

    const warnings = detectUnrecognizedFields(input);
    expect(warnings).toHaveLength(0);
  });

  it("detects unrecognized field inside criteria object", () => {
    const input = {
      issuer: { name: "Test" },
      achievement: {
        name: "Ach",
        description: "Desc",
        criteria: { narrative: "Done", extraCriteria: "oops" },
      },
      recipient: { id: "did:example:123" },
    };

    const warnings = detectUnrecognizedFields(input);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].param).toBe("achievement.criteria.extraCriteria");
  });

  it("detects unrecognized field inside recipient.identifier", () => {
    const input = {
      issuer: { name: "Test" },
      achievement: {
        name: "Ach",
        description: "Desc",
        criteria: { narrative: "Done" },
      },
      recipient: {
        id: "did:example:123",
        identifier: {
          identityType: "emailAddress",
          identityHash: "abc",
          hashed: true,
          unknownId: "oops",
        },
      },
    };

    const warnings = detectUnrecognizedFields(input);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].param).toBe("recipient.identifier.unknownId");
  });
});

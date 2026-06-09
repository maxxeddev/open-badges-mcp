/**
 * Unit tests for the shared Data Integrity canonicalize→hash core
 * (src/crypto/data-integrity.ts) and the offline document loader
 * (src/crypto/document-loader.ts).
 *
 * Validates:
 * - Requirement 5.1: Canonicalization produces deterministic signing input
 * - Requirement 7.1: Sign and verify share the same pipeline (determinism anchor)
 */

import { describe, expect, it } from "vitest";
import {
  canonicalize,
  computeSigningInput,
  type DataIntegrityProof,
} from "../../src/crypto/data-integrity.js";
import { createDocumentLoader } from "../../src/crypto/document-loader.js";

/** A minimal OB3 credential document for testing */
function makeTestDocument(): Record<string, unknown> {
  return {
    "@context": [
      "https://www.w3.org/ns/credentials/v2",
      "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json",
    ],
    type: ["VerifiableCredential", "OpenBadgeCredential"],
    issuer: {
      id: "https://example.edu/issuers/1",
      type: ["Profile"],
      name: "Example University",
    },
    validFrom: "2024-01-01T00:00:00Z",
    credentialSubject: {
      type: ["AchievementSubject"],
      achievement: {
        id: "https://example.edu/achievements/1",
        type: ["Achievement"],
        name: "Test Achievement",
        criteria: {
          narrative: "Complete the test",
        },
      },
    },
  };
}

/** A sample proof object (without a real proofValue) for determinism testing */
function makeTestProof(): DataIntegrityProof {
  return {
    type: "DataIntegrityProof",
    cryptosuite: "eddsa-rdfc-2022",
    verificationMethod: "did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK",
    proofPurpose: "assertionMethod",
    proofValue: "zPlaceholder",
    created: "2024-06-01T12:00:00Z",
  };
}

describe("computeSigningInput determinism", () => {
  it("produces identical signingInput buffers across multiple calls with the same input", async () => {
    const doc = makeTestDocument();
    const proof = makeTestProof();

    const result1 = await computeSigningInput(doc, proof);
    const result2 = await computeSigningInput(doc, proof);
    const result3 = await computeSigningInput(doc, proof);

    expect(result1.signingInput.equals(result2.signingInput)).toBe(true);
    expect(result2.signingInput.equals(result3.signingInput)).toBe(true);
  });

  it("produces identical proofOptionsHash across runs", async () => {
    const doc = makeTestDocument();
    const proof = makeTestProof();

    const result1 = await computeSigningInput(doc, proof);
    const result2 = await computeSigningInput(doc, proof);

    expect(result1.proofOptionsHash.equals(result2.proofOptionsHash)).toBe(true);
  });

  it("produces identical documentHash across runs", async () => {
    const doc = makeTestDocument();
    const proof = makeTestProof();

    const result1 = await computeSigningInput(doc, proof);
    const result2 = await computeSigningInput(doc, proof);

    expect(result1.documentHash.equals(result2.documentHash)).toBe(true);
  });

  it("signingInput is 64 bytes (two SHA-256 hashes concatenated)", async () => {
    const doc = makeTestDocument();
    const proof = makeTestProof();

    const result = await computeSigningInput(doc, proof);

    // SHA-256 = 32 bytes, two concatenated = 64
    expect(result.signingInput.length).toBe(64);
    expect(result.proofOptionsHash.length).toBe(32);
    expect(result.documentHash.length).toBe(32);
  });
});

describe("canonicalize determinism", () => {
  it("produces identical n-quads output across multiple calls with the same document", async () => {
    const doc = makeTestDocument();
    const loader = createDocumentLoader();

    const output1 = await canonicalize(doc, loader);
    const output2 = await canonicalize(doc, loader);
    const output3 = await canonicalize(doc, loader);

    expect(output1).toBe(output2);
    expect(output2).toBe(output3);
  });

  it("returns a non-empty string for a valid document", async () => {
    const doc = makeTestDocument();
    const loader = createDocumentLoader();

    const output = await canonicalize(doc, loader);

    expect(output.length).toBeGreaterThan(0);
    // URDNA2015 output is n-quads (lines ending with " .\n")
    expect(output).toContain(" .\n");
  });
});

describe("createDocumentLoader offline behavior", () => {
  it("rejects unknown URLs (refuses network access)", async () => {
    const loader = createDocumentLoader();

    await expect(loader("https://example.com/unknown-context.json")).rejects.toThrow(
      "Refused to fetch remote context",
    );
  });

  it("rejects HTTP URLs", async () => {
    const loader = createDocumentLoader();

    await expect(loader("http://schema.org/")).rejects.toThrow("Refused to fetch remote context");
  });

  it("rejects arbitrary HTTPS URLs", async () => {
    const loader = createDocumentLoader();

    await expect(loader("https://w3id.org/security/suites/ed25519-2020/v1")).rejects.toThrow(
      "Refused to fetch remote context",
    );
  });

  it("resolves known OB3 context without error", async () => {
    const loader = createDocumentLoader();

    const result = await loader("https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json");

    expect(result.document).toBeDefined();
    expect(result.documentUrl).toBe("https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json");
  });

  it("resolves known VC v2 context without error", async () => {
    const loader = createDocumentLoader();

    const result = await loader("https://www.w3.org/ns/credentials/v2");

    expect(result.document).toBeDefined();
    expect(result.documentUrl).toBe("https://www.w3.org/ns/credentials/v2");
  });

  it("resolves known Data Integrity context without error", async () => {
    const loader = createDocumentLoader();

    const result = await loader("https://w3id.org/security/data-integrity/v2");

    expect(result.document).toBeDefined();
    expect(result.documentUrl).toBe("https://w3id.org/security/data-integrity/v2");
  });
});

describe("canonicalize with known contexts", () => {
  it("canonicalizes a document using OB3 and VC v2 contexts without error", async () => {
    const doc: Record<string, unknown> = {
      "@context": [
        "https://www.w3.org/ns/credentials/v2",
        "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json",
      ],
      type: ["VerifiableCredential", "OpenBadgeCredential"],
      issuer: {
        id: "https://example.edu/issuers/42",
        type: ["Profile"],
        name: "Test Issuer",
      },
      validFrom: "2025-01-15T08:30:00Z",
      credentialSubject: {
        type: ["AchievementSubject"],
        achievement: {
          id: "https://example.edu/achievements/99",
          type: ["Achievement"],
          name: "Advanced Badge",
          criteria: {
            narrative: "Demonstrate advanced competency",
          },
        },
      },
    };

    const loader = createDocumentLoader();
    const result = await canonicalize(doc, loader);

    // Should produce valid n-quads output
    expect(result).toBeDefined();
    expect(result.length).toBeGreaterThan(0);
  });

  it("canonicalizes proof options with Data Integrity context without error", async () => {
    const proofOptions: Record<string, unknown> = {
      "@context": "https://w3id.org/security/data-integrity/v2",
      type: "DataIntegrityProof",
      cryptosuite: "eddsa-rdfc-2022",
      verificationMethod: "did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK",
      proofPurpose: "assertionMethod",
      created: "2024-06-01T12:00:00Z",
    };

    const loader = createDocumentLoader();
    const result = await canonicalize(proofOptions, loader);

    expect(result).toBeDefined();
    expect(result.length).toBeGreaterThan(0);
  });
});

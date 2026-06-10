/**
 * Unit tests for the proof-signer module (src/generator/proof-signer.ts).
 *
 * Verifies:
 * - When requestProof=false, credential is returned unchanged (R7.2)
 * - When requestProof=true, a DataIntegrityProof is attached (R7.1)
 * - The attached proof passes the Signature_Check (R7.3)
 */

import { describe, expect, it } from "vitest";
import { attachProofIfRequested } from "../src/generator/proof-signer.js";
import { checkSignature } from "../src/validate/signature.js";

/** A minimal valid OB3 AchievementCredential for testing. */
const SAMPLE_CREDENTIAL: Record<string, unknown> = {
  "@context": [
    "https://www.w3.org/ns/credentials/v2",
    "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json",
  ],
  type: ["VerifiableCredential", "OpenBadgeCredential"],
  id: "urn:uuid:12345678-1234-1234-1234-123456789012",
  issuer: {
    id: "did:example:issuer123",
    type: ["Profile"],
    name: "Test Issuer",
  },
  validFrom: "2024-01-01T00:00:00Z",
  name: "Test Achievement Credential",
  credentialSubject: {
    id: "did:example:subject456",
    type: ["AchievementSubject"],
    achievement: {
      id: "urn:uuid:achievement-001",
      type: ["Achievement"],
      name: "Test Achievement",
      criteria: {
        narrative: "Completed a test.",
      },
    },
  },
};

describe("attachProofIfRequested", () => {
  it("returns the credential unchanged when requestProof=false (R7.2)", async () => {
    const result = await attachProofIfRequested(SAMPLE_CREDENTIAL, false);
    expect(result).toEqual(SAMPLE_CREDENTIAL);
    expect(result).toBe(SAMPLE_CREDENTIAL); // same reference
  });

  it("attaches a DataIntegrityProof when requestProof=true (R7.1)", async () => {
    const result = await attachProofIfRequested(SAMPLE_CREDENTIAL, true);

    // Should have a proof field
    expect(result.proof).toBeDefined();
    const proof = result.proof as Record<string, unknown>;
    expect(proof.type).toBe("DataIntegrityProof");
    expect(proof.cryptosuite).toBe("eddsa-rdfc-2022");
    expect(proof.proofPurpose).toBe("assertionMethod");
    expect(typeof proof.verificationMethod).toBe("string");
    expect((proof.verificationMethod as string).startsWith("did:key:z")).toBe(true);
    expect(typeof proof.proofValue).toBe("string");
    expect((proof.proofValue as string).startsWith("z")).toBe(true);
    expect(typeof proof.created).toBe("string");
  });

  it("produces a credential that passes Signature_Check (R7.3)", async () => {
    const result = await attachProofIfRequested(SAMPLE_CREDENTIAL, true);

    // Run the Signature_Check against the signed credential
    const sigResult = await checkSignature(result);
    expect(sigResult.status).toBe("passed");
    expect(sigResult.suite).toBe("eddsa-rdfc-2022");
  });

  it("does not include proof on the original credential", async () => {
    const original = { ...SAMPLE_CREDENTIAL };
    await attachProofIfRequested(original, true);
    // The original should not be mutated
    expect(original.proof).toBeUndefined();
  });

  it("preserves all original credential fields in the signed output", async () => {
    const result = await attachProofIfRequested(SAMPLE_CREDENTIAL, true);

    // All original fields should still be present
    for (const key of Object.keys(SAMPLE_CREDENTIAL)) {
      expect(result[key]).toEqual(SAMPLE_CREDENTIAL[key]);
    }
  });
});

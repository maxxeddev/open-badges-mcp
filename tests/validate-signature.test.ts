/**
 * Unit tests for the Signature_Check (src/validate/signature.ts).
 *
 * Verifies:
 * - not_applicable when no proof is present
 * - Unsupported suite returns failed
 * - Unresolvable key returns failed
 * - Valid Ed25519 DataIntegrityProof passes verification
 * - Tampered credential fails verification
 * - did:key resolution works for Ed25519
 */

import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { computeSigningInput, type DataIntegrityProof } from "../src/crypto/data-integrity.js";
import { checkSignature } from "../src/validate/signature.js";

// Base58btc alphabet for encoding
const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function encodeBase58btc(bytes: Buffer): string {
  if (bytes.length === 0) return "";
  // Count leading zeros
  let zeroes = 0;
  for (const b of bytes) {
    if (b === 0) zeroes++;
    else break;
  }
  // Convert to base58
  const result: number[] = [];
  for (const byte of bytes) {
    let carry = byte;
    for (let i = 0; i < result.length; i++) {
      carry += result[i] * 256;
      result[i] = carry % 58;
      carry = Math.floor(carry / 58);
    }
    while (carry > 0) {
      result.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }
  // Leading zeros
  let str = "1".repeat(zeroes);
  for (let i = result.length - 1; i >= 0; i--) {
    str += BASE58_ALPHABET[result[i]];
  }
  return str;
}

/**
 * Encode a varint (unsigned LEB128)
 */
function encodeVarint(value: number): Buffer {
  const bytes: number[] = [];
  while (value > 0x7f) {
    bytes.push((value & 0x7f) | 0x80);
    value >>>= 7;
  }
  bytes.push(value & 0x7f);
  return Buffer.from(bytes);
}

/**
 * Create a did:key from an Ed25519 public key
 */
function createDidKeyEd25519(publicKeyBytes: Buffer): string {
  const multicodecPrefix = encodeVarint(0xed); // ed25519-pub
  const multicodecKey = Buffer.concat([multicodecPrefix, publicKeyBytes]);
  const multibase = `z${encodeBase58btc(multicodecKey)}`;
  return `did:key:${multibase}`;
}

/**
 * Sign a credential with Ed25519 and attach a DataIntegrityProof.
 */
async function signCredentialEd25519(
  doc: Record<string, unknown>,
): Promise<{ signedDoc: Record<string, unknown>; didKey: string }> {
  // Generate ephemeral Ed25519 key pair
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");

  // Get raw public key bytes
  const pubKeyDer = publicKey.export({ type: "spki", format: "der" });
  // Ed25519 SPKI has a 12-byte prefix before the 32-byte raw key
  const rawPubKey = Buffer.from(pubKeyDer.subarray(12));
  const didKey = createDidKeyEd25519(rawPubKey);

  // Build the proof object (without proofValue initially, for signing input computation)
  const proof: DataIntegrityProof = {
    type: "DataIntegrityProof",
    cryptosuite: "eddsa-rdfc-2022",
    verificationMethod: didKey,
    proofPurpose: "assertionMethod",
    proofValue: "", // placeholder
    created: new Date().toISOString(),
  };

  // Compute signing input
  const { signingInput } = await computeSigningInput(doc, proof);

  // Sign
  const signature = crypto.sign(null, signingInput, privateKey);

  // Encode proofValue as multibase base58btc
  const proofValue = `z${encodeBase58btc(signature)}`;

  // Return the signed document
  return {
    signedDoc: {
      ...doc,
      proof: {
        ...proof,
        proofValue,
      },
    },
    didKey,
  };
}

/** A minimal credential document for testing */
function makeTestCredential(): Record<string, unknown> {
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

describe("checkSignature", () => {
  it("returns not_applicable when no proof is present", async () => {
    const doc = makeTestCredential();
    const result = await checkSignature(doc);
    expect(result.status).toBe("not_applicable");
    expect(result.error).toBeUndefined();
    expect(result.suite).toBeUndefined();
  });

  it("returns not_applicable when proof is not a DataIntegrityProof", async () => {
    const doc = {
      ...makeTestCredential(),
      proof: {
        type: "SomeOtherProofType",
        jws: "eyJhbGciOiJFZERTQSJ9...",
      },
    };
    const result = await checkSignature(doc);
    expect(result.status).toBe("not_applicable");
  });

  it("returns failed for unsupported cryptosuite", async () => {
    const doc = {
      ...makeTestCredential(),
      proof: {
        type: "DataIntegrityProof",
        cryptosuite: "bbs-2023",
        verificationMethod: "did:key:z6Mkf...",
        proofPurpose: "assertionMethod",
        proofValue: "zFakeProofValue",
      },
    };
    const result = await checkSignature(doc);
    expect(result.status).toBe("failed");
    expect(result.suite).toBe("bbs-2023");
    expect(result.error).toContain("Unsupported cryptosuite");
    expect(result.error).toContain("bbs-2023");
  });

  it("returns failed for unresolvable verificationMethod", async () => {
    const doc = {
      ...makeTestCredential(),
      proof: {
        type: "DataIntegrityProof",
        cryptosuite: "eddsa-rdfc-2022",
        verificationMethod: "https://example.com/keys/1",
        proofPurpose: "assertionMethod",
        proofValue: "zFakeProofValue",
      },
    };
    const result = await checkSignature(doc);
    expect(result.status).toBe("failed");
    expect(result.suite).toBe("eddsa-rdfc-2022");
    expect(result.error).toContain("only did:key URIs and inline keys are supported");
  });

  it("returns passed for a valid Ed25519 signed credential", async () => {
    const doc = makeTestCredential();
    const { signedDoc } = await signCredentialEd25519(doc);
    const result = await checkSignature(signedDoc);
    expect(result.status).toBe("passed");
    expect(result.suite).toBe("eddsa-rdfc-2022");
    expect(result.error).toBeUndefined();
  });

  it("returns failed when credential is tampered after signing", async () => {
    const doc = makeTestCredential();
    const { signedDoc } = await signCredentialEd25519(doc);

    // Tamper with the credential
    const tampered = {
      ...signedDoc,
      credentialSubject: {
        ...(signedDoc.credentialSubject as Record<string, unknown>),
        achievement: {
          id: "https://example.edu/achievements/TAMPERED",
          type: ["Achievement"],
          name: "Tampered Achievement",
          criteria: { narrative: "Hacked" },
        },
      },
    };

    const result = await checkSignature(tampered);
    expect(result.status).toBe("failed");
    expect(result.suite).toBe("eddsa-rdfc-2022");
    expect(result.error).toContain("Signature verification failed");
  });

  it("returns failed for invalid proofValue encoding", async () => {
    const doc = {
      ...makeTestCredential(),
      proof: {
        type: "DataIntegrityProof",
        cryptosuite: "eddsa-rdfc-2022",
        verificationMethod: "did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK",
        proofPurpose: "assertionMethod",
        proofValue: "!invalid-multibase!",
      },
    };
    const result = await checkSignature(doc);
    expect(result.status).toBe("failed");
    expect(result.error).toContain("Failed to decode proofValue");
  });

  it("supports verificationMethod with fragment", async () => {
    const doc = makeTestCredential();
    const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
    const pubKeyDer = publicKey.export({ type: "spki", format: "der" });
    const rawPubKey = Buffer.from(pubKeyDer.subarray(12));
    const didKey = createDidKeyEd25519(rawPubKey);
    // Add fragment (common in real-world did:key usage)
    const multibaseKey = didKey.slice("did:key:".length);
    const didKeyWithFragment = `${didKey}#${multibaseKey}`;

    const proof: DataIntegrityProof = {
      type: "DataIntegrityProof",
      cryptosuite: "eddsa-rdfc-2022",
      verificationMethod: didKeyWithFragment,
      proofPurpose: "assertionMethod",
      proofValue: "",
      created: new Date().toISOString(),
    };

    const { signingInput } = await computeSigningInput(doc, proof);
    const signature = crypto.sign(null, signingInput, privateKey);
    const proofValue = `z${encodeBase58btc(signature)}`;

    const signedDoc = {
      ...doc,
      proof: { ...proof, proofValue },
    };

    const result = await checkSignature(signedDoc);
    expect(result.status).toBe("passed");
    expect(result.suite).toBe("eddsa-rdfc-2022");
  });

  it("returns failed for unresolvable non-did:key string verificationMethod", async () => {
    // This tests that HTTP-based verification methods correctly fail
    // (since we're offline-only)
    const doc = {
      ...makeTestCredential(),
      proof: {
        type: "DataIntegrityProof",
        cryptosuite: "eddsa-rdfc-2022",
        verificationMethod: "https://example.com/issuer/keys/1",
        proofPurpose: "assertionMethod",
        proofValue: "z3hQm2RkQYSUcNsnEn52oYDqjBGam8VxEGPGfpMNxBpLTZMK",
      },
    };
    const result = await checkSignature(doc);
    expect(result.status).toBe("failed");
    expect(result.error).toContain("only did:key URIs and inline keys are supported");
  });
});

/**
 * Signature_Check — verifies a DataIntegrityProof embedded in a credential.
 *
 * Supports:
 * - eddsa-rdfc-2022 (Ed25519)
 * - ecdsa-rdfc-2019 (NIST P-256 / P-384)
 *
 * Uses the shared canonicalize→hash core from src/crypto/data-integrity.ts
 * and resolves keys offline (did:key multibase/multicodec or inline key material).
 * No network access occurs.
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4
 */

import crypto from "node:crypto";
import { computeSigningInput, separateProof } from "../crypto/data-integrity.js";
import type { SignatureStatus } from "./types.js";

export interface SignatureCheckResult {
  status: SignatureStatus;
  error?: string;
  suite?: string;
}

/** Supported cryptosuites and their curve/algorithm mappings. */
const SUPPORTED_SUITES: Record<string, { algorithm: "ed25519" | "ec"; curves?: string[] }> = {
  "eddsa-rdfc-2022": { algorithm: "ed25519" },
  "ecdsa-rdfc-2019": { algorithm: "ec", curves: ["P-256", "P-384"] },
};

/**
 * Well-known multicodec prefixes for public key types.
 * See https://github.com/multiformats/multicodec/blob/master/table.csv
 */
const MULTICODEC_ED25519_PUB = 0xed; // ed25519-pub
const MULTICODEC_P256_PUB = 0x1200; // p256-pub
const MULTICODEC_P384_PUB = 0x1201; // p384-pub

// Base58btc alphabet (Bitcoin alphabet)
const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/**
 * Decode a base58btc-encoded string into bytes.
 */
function decodeBase58btc(input: string): Buffer {
  const bytes: number[] = [];
  for (const char of input) {
    const idx = BASE58_ALPHABET.indexOf(char);
    if (idx === -1) {
      throw new Error(`Invalid base58btc character: '${char}'`);
    }
    // Multiply existing bytes by 58 and add the new digit
    let carry = idx;
    for (let i = bytes.length - 1; i >= 0; i--) {
      const val = bytes[i] * 58 + carry;
      bytes[i] = val & 0xff;
      carry = val >> 8;
    }
    while (carry > 0) {
      bytes.unshift(carry & 0xff);
      carry >>= 8;
    }
  }
  // Handle leading '1's (which represent leading zero bytes in base58)
  for (const char of input) {
    if (char === "1") {
      bytes.unshift(0);
    } else {
      break;
    }
  }
  return Buffer.from(bytes);
}

/**
 * Decode a multibase-encoded string.
 * Only supports base58btc ('z' prefix) and base64url-no-pad ('u' prefix).
 */
function decodeMultibase(encoded: string): Buffer {
  if (!encoded || encoded.length < 2) {
    throw new Error("Invalid multibase string: too short");
  }
  const prefix = encoded[0];
  const payload = encoded.slice(1);
  switch (prefix) {
    case "z": // base58btc
      return decodeBase58btc(payload);
    case "u": // base64url-no-pad
      return Buffer.from(payload, "base64url");
    default:
      throw new Error(`Unsupported multibase prefix: '${prefix}'`);
  }
}

/**
 * Read a varint from a buffer at a given offset.
 * Returns the decoded value and the number of bytes consumed.
 */
function readVarint(buf: Buffer, offset: number): { value: number; bytesRead: number } {
  let value = 0;
  let shift = 0;
  let bytesRead = 0;
  while (offset + bytesRead < buf.length) {
    const byte = buf[offset + bytesRead];
    value |= (byte & 0x7f) << shift;
    bytesRead++;
    if ((byte & 0x80) === 0) {
      return { value, bytesRead };
    }
    shift += 7;
  }
  throw new Error("Varint extends beyond buffer");
}

/**
 * Resolve the key type and raw public key bytes from a multicodec-prefixed buffer.
 */
function decodeMulticodecKey(data: Buffer): {
  keyType: "ed25519" | "p256" | "p384";
  rawKey: Buffer;
} {
  const { value: codec, bytesRead } = readVarint(data, 0);
  const rawKey = data.subarray(bytesRead);

  switch (codec) {
    case MULTICODEC_ED25519_PUB:
      if (rawKey.length !== 32) {
        throw new Error(`Ed25519 public key must be 32 bytes, got ${rawKey.length}`);
      }
      return { keyType: "ed25519", rawKey };
    case MULTICODEC_P256_PUB:
      return { keyType: "p256", rawKey };
    case MULTICODEC_P384_PUB:
      return { keyType: "p384", rawKey };
    default:
      throw new Error(`Unsupported multicodec prefix: 0x${codec.toString(16)}`);
  }
}

/**
 * Resolve a did:key DID to a KeyObject.
 * did:key format: did:key:<multibase-encoded multicodec public key>
 */
function resolveDidKey(did: string): crypto.KeyObject {
  if (!did.startsWith("did:key:")) {
    throw new Error(`Not a did:key DID: ${did}`);
  }
  const multibaseKey = did.slice("did:key:".length);
  // Strip any fragment (e.g. did:key:z...#z...)
  const hashIdx = multibaseKey.indexOf("#");
  const keyPart = hashIdx >= 0 ? multibaseKey.slice(0, hashIdx) : multibaseKey;
  const decoded = decodeMultibase(keyPart);
  const { keyType, rawKey } = decodeMulticodecKey(decoded);

  switch (keyType) {
    case "ed25519":
      return crypto.createPublicKey({
        key: Buffer.concat([
          // Ed25519 public key ASN.1 DER prefix
          Buffer.from("302a300506032b6570032100", "hex"),
          rawKey,
        ]),
        format: "der",
        type: "spki",
      });
    case "p256":
      return createEcPublicKey("P-256", rawKey);
    case "p384":
      return createEcPublicKey("P-384", rawKey);
  }
}

/**
 * Create an EC public key object from raw public key bytes (uncompressed or compressed).
 */
function createEcPublicKey(namedCurve: "P-256" | "P-384", rawKey: Buffer): crypto.KeyObject {
  // For EC keys, the raw bytes are the uncompressed (or compressed) point.
  // We need to wrap them in SPKI DER format.
  const oid =
    namedCurve === "P-256"
      ? Buffer.from("06082a8648ce3d030107", "hex") // OID 1.2.840.10045.3.1.7
      : Buffer.from("06052b81040022", "hex"); // OID 1.3.132.0.34

  // Algorithm identifier: ecPublicKey OID + curve OID
  const ecPubKeyOid = Buffer.from("06072a8648ce3d0201", "hex");
  const algSeqContent = Buffer.concat([ecPubKeyOid, oid]);
  const algSeq = wrapDerSequence(algSeqContent);

  // BitString wrapping of the key bytes
  const bitString = Buffer.concat([Buffer.from([0x03, rawKey.length + 1, 0x00]), rawKey]);

  // Outer SEQUENCE
  const spki = wrapDerSequence(Buffer.concat([algSeq, bitString]));

  return crypto.createPublicKey({
    key: spki,
    format: "der",
    type: "spki",
  });
}

/**
 * Wrap content in a DER SEQUENCE (tag 0x30).
 */
function wrapDerSequence(content: Buffer): Buffer {
  const len = encodeDerLength(content.length);
  return Buffer.concat([Buffer.from([0x30]), len, content]);
}

/**
 * Encode a DER length.
 */
function encodeDerLength(length: number): Buffer {
  if (length < 0x80) {
    return Buffer.from([length]);
  }
  if (length < 0x100) {
    return Buffer.from([0x81, length]);
  }
  return Buffer.from([0x82, (length >> 8) & 0xff, length & 0xff]);
}

/**
 * Resolve the public key from a proof's verificationMethod.
 * Supports:
 * - did:key:z... → decode multibase/multicodec
 * - Inline object with publicKeyMultibase
 * - Inline object with publicKeyJwk
 */
function resolvePublicKey(verificationMethod: unknown): crypto.KeyObject {
  // Case 1: String — could be a did:key URI or a fragment reference
  if (typeof verificationMethod === "string") {
    if (verificationMethod.startsWith("did:key:")) {
      return resolveDidKey(verificationMethod);
    }
    throw new Error(
      `Cannot resolve verificationMethod: "${verificationMethod}" — only did:key URIs and inline keys are supported offline`,
    );
  }

  // Case 2: Object with inline key material
  if (verificationMethod && typeof verificationMethod === "object") {
    const vmObj = verificationMethod as Record<string, unknown>;

    // Try publicKeyMultibase first
    if (typeof vmObj.publicKeyMultibase === "string") {
      const decoded = decodeMultibase(vmObj.publicKeyMultibase);
      const { keyType, rawKey } = decodeMulticodecKey(decoded);
      switch (keyType) {
        case "ed25519":
          return crypto.createPublicKey({
            key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), rawKey]),
            format: "der",
            type: "spki",
          });
        case "p256":
          return createEcPublicKey("P-256", rawKey);
        case "p384":
          return createEcPublicKey("P-384", rawKey);
      }
    }

    // Try publicKeyJwk
    if (vmObj.publicKeyJwk && typeof vmObj.publicKeyJwk === "object") {
      return crypto.createPublicKey({
        key: vmObj.publicKeyJwk as JsonWebKey,
        format: "jwk",
      });
    }
  }

  throw new Error(
    "Key could not be resolved: verificationMethod must be a did:key URI or contain publicKeyMultibase/publicKeyJwk",
  );
}

/**
 * Decode a multibase-encoded proofValue to raw signature bytes.
 */
function decodeProofValue(proofValue: string): Buffer {
  return decodeMultibase(proofValue);
}

/**
 * Verify a signature using the appropriate algorithm.
 */
function verifySignature(
  suite: string,
  signingInput: Buffer,
  keyObject: crypto.KeyObject,
  signatureBytes: Buffer,
): boolean {
  if (suite === "eddsa-rdfc-2022") {
    // Ed25519: pass null as algorithm (EdDSA doesn't use a separate hash)
    return crypto.verify(null, signingInput, keyObject, signatureBytes);
  }
  // ECDSA: uses SHA-256 for the signing hash (already hashed input, but
  // crypto.verify for ECDSA needs the algorithm to know the signing scheme)
  // For ecdsa-rdfc-2019, the signing input is already the concatenated hashes,
  // and the ECDSA signature is computed over that input with SHA-256.
  return crypto.verify("sha256", signingInput, keyObject, signatureBytes);
}

/**
 * Verifies the cryptographic signature of a DataIntegrityProof embedded in a credential.
 *
 * @param doc - The credential document (must include the `proof` field if signed)
 * @returns A result with status, optional error, and the suite name
 */
export async function checkSignature(doc: Record<string, unknown>): Promise<SignatureCheckResult> {
  // Step 1: Separate proofs from document
  const { document, proofs } = separateProof(doc);

  // No DataIntegrityProof present → not applicable
  if (proofs.length === 0) {
    return { status: "not_applicable" };
  }

  // Verify the first DataIntegrityProof found
  // (Multiple proofs: verify the first one; future extension could verify all)
  const proof = proofs[0];
  const suite = proof.cryptosuite;

  // Step 2: Check if suite is supported
  if (!SUPPORTED_SUITES[suite]) {
    return {
      status: "failed",
      suite,
      error: `Unsupported cryptosuite: "${suite}". Supported suites are: ${Object.keys(SUPPORTED_SUITES).join(", ")}`,
    };
  }

  // Step 3: Resolve the public key
  let keyObject: crypto.KeyObject;
  try {
    keyObject = resolvePublicKey(proof.verificationMethod);
  } catch (err) {
    return {
      status: "failed",
      suite,
      error: `Key could not be resolved: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // Step 4: Compute the signing input (canonicalize + hash)
  let signingInput: Buffer;
  try {
    const result = await computeSigningInput(document, proof);
    signingInput = result.signingInput;
  } catch (err) {
    return {
      status: "failed",
      suite,
      error: `Canonicalization failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // Step 5: Decode the proofValue
  let signatureBytes: Buffer;
  try {
    signatureBytes = decodeProofValue(proof.proofValue);
  } catch (err) {
    return {
      status: "failed",
      suite,
      error: `Failed to decode proofValue: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // Step 6: Verify the signature
  try {
    const valid = verifySignature(suite, signingInput, keyObject, signatureBytes);
    if (valid) {
      return { status: "passed", suite };
    }
    return {
      status: "failed",
      suite,
      error: "Signature verification failed: the proofValue does not match the credential content",
    };
  } catch (err) {
    return {
      status: "failed",
      suite,
      error: `Signature verification error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

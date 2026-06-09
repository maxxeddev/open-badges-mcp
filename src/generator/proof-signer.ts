/**
 * Real proof attachment for the Credential Generator.
 *
 * When `attachProof` is requested, generates an ephemeral Ed25519 key pair,
 * builds a DataIntegrityProof (cryptosuite: eddsa-rdfc-2022, did:key
 * verificationMethod), and computes proofValue via the shared crypto core.
 *
 * When not requested, returns the credential unsigned.
 *
 * Requirements: 7.1, 7.2, 7.3
 */

import crypto from "node:crypto";
import { computeSigningInput, type DataIntegrityProof } from "../crypto/data-integrity.js";

// Base58btc alphabet (Bitcoin alphabet)
const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/**
 * Encode bytes as a base58btc string.
 */
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
  // Leading zeros map to '1' in base58
  let str = "1".repeat(zeroes);
  for (let i = result.length - 1; i >= 0; i--) {
    str += BASE58_ALPHABET[result[i]];
  }
  return str;
}

/**
 * Encode an unsigned integer as a varint (unsigned LEB128).
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
 * Derive a did:key from a raw 32-byte Ed25519 public key.
 *
 * Steps:
 * 1. Prepend the multicodec prefix for ed25519-pub (0xed as varint)
 * 2. Encode with base58btc
 * 3. Prefix with 'z' (multibase base58btc identifier)
 * 4. Form: did:key:z<base58btc>
 */
function deriveDidKey(publicKeyBytes: Buffer): string {
  const multicodecPrefix = encodeVarint(0xed); // ed25519-pub
  const multicodecKey = Buffer.concat([multicodecPrefix, publicKeyBytes]);
  const multibase = `z${encodeBase58btc(multicodecKey)}`;
  return `did:key:${multibase}`;
}

/**
 * Attach a verifiable DataIntegrityProof to a credential if requested.
 *
 * When `requestProof` is true:
 * - Generates an ephemeral Ed25519 key pair
 * - Builds a DataIntegrityProof with cryptosuite "eddsa-rdfc-2022"
 * - Sets verificationMethod to a did:key derived from the public key
 * - Computes proofValue using the shared canonicalize→hash→sign pipeline
 * - Returns the credential with the proof attached
 *
 * When `requestProof` is false:
 * - Returns the credential unchanged (unsigned)
 *
 * @param credential - The credential document to optionally sign
 * @param requestProof - Whether to attach a proof
 * @returns The credential, optionally with an attached proof
 */
export async function attachProofIfRequested(
  credential: Record<string, unknown>,
  requestProof: boolean,
): Promise<Record<string, unknown>> {
  // R7.2: return unsigned credential when not requested
  if (!requestProof) {
    return credential;
  }

  // Generate an ephemeral Ed25519 key pair
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");

  // Get the raw 32-byte Ed25519 public key from the SPKI DER encoding
  // Ed25519 SPKI DER has a 12-byte prefix (SEQUENCE + OID) before the 32-byte raw key
  const pubKeyDer = publicKey.export({ type: "spki", format: "der" });
  const rawPubKey = Buffer.from(pubKeyDer.subarray(12));

  // Derive the did:key from the raw public key
  const didKey = deriveDidKey(rawPubKey);

  // Build the proof object (proofValue placeholder for signing input computation)
  const proof: DataIntegrityProof = {
    type: "DataIntegrityProof",
    cryptosuite: "eddsa-rdfc-2022",
    verificationMethod: didKey,
    proofPurpose: "assertionMethod",
    proofValue: "", // placeholder — replaced after signing
    created: new Date().toISOString(),
  };

  // Compute signing input using the shared canonicalize→hash pipeline
  const { signingInput } = await computeSigningInput(credential, proof);

  // Sign the signing input with the ephemeral private key
  const signature = crypto.sign(null, signingInput, privateKey);

  // Encode proofValue as multibase base58btc: z<base58btc(signature)>
  const proofValue = `z${encodeBase58btc(signature)}`;

  // Return the credential with the proof attached (R7.1, R7.3)
  return {
    ...credential,
    proof: {
      ...proof,
      proofValue,
    },
  };
}

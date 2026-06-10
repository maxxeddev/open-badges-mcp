/**
 * Shared Data Integrity canonicalize→hash core.
 *
 * Implements the W3C Data Integrity verification algorithm's canonicalization
 * and hashing steps. Used by both:
 * - src/validate/signature.ts (verification)
 * - src/generator/proof-signer.ts (signing)
 *
 * This ensures sign and verify share one canonicalize→hash pipeline and stay
 * in lockstep — the round-trip is the correctness anchor (Property 10/11/17).
 *
 * No network access: uses the shared offline document loader exclusively.
 */

import { createHash } from "node:crypto";
import jsonld from "jsonld";
import { createDocumentLoader, type DocumentLoader } from "./document-loader.js";

export interface DataIntegrityProof {
  type: string;
  cryptosuite: string;
  verificationMethod: string;
  proofPurpose: string;
  proofValue: string;
  created?: string;
  domain?: string;
  challenge?: string;
  nonce?: string;
  "@context"?: unknown;
  [key: string]: unknown;
}

export interface SigningInput {
  /** The concatenated hash: hash(proofOptions) || hash(document) */
  signingInput: Buffer;
  /** SHA-256 hash of canonicalized proof options */
  proofOptionsHash: Buffer;
  /** SHA-256 hash of canonicalized document */
  documentHash: Buffer;
}

/**
 * Separates the proof from a credential document.
 * Returns the document without the proof and the proof object(s).
 */
export function separateProof(doc: Record<string, unknown>): {
  document: Record<string, unknown>;
  proofs: DataIntegrityProof[];
} {
  const { proof, ...document } = doc;
  const proofs: DataIntegrityProof[] = [];

  if (!proof) {
    return { document, proofs };
  }

  if (Array.isArray(proof)) {
    for (const p of proof) {
      if (isDataIntegrityProof(p)) {
        proofs.push(p as DataIntegrityProof);
      }
    }
  } else if (isDataIntegrityProof(proof)) {
    proofs.push(proof as DataIntegrityProof);
  }

  return { document, proofs };
}

/**
 * Checks whether an object looks like a DataIntegrityProof.
 */
export function isDataIntegrityProof(obj: unknown): boolean {
  if (!obj || typeof obj !== "object") return false;
  const o = obj as Record<string, unknown>;
  return (
    (o.type === "DataIntegrityProof" ||
      (Array.isArray(o.type) && o.type.includes("DataIntegrityProof"))) &&
    typeof o.cryptosuite === "string" &&
    typeof o.proofValue === "string"
  );
}

/**
 * Prepares proof options for canonicalization by removing `proofValue`
 * (and `@context` which is handled by the document's context) from the proof.
 */
export function prepareProofOptions(proof: DataIntegrityProof): Record<string, unknown> {
  // biome-ignore lint/suspicious/noExplicitAny: spreading proof with known shape
  const { proofValue, ...options } = proof as any;
  // Ensure the proof options carry a @context for proper canonicalization
  if (!options["@context"]) {
    options["@context"] = "https://w3id.org/security/data-integrity/v2";
  }
  return options;
}

/**
 * Canonicalizes a JSON-LD document using URDNA2015 algorithm, outputting n-quads.
 * Uses the shared offline document loader — no network access occurs.
 */
export async function canonicalize(
  document: Record<string, unknown>,
  documentLoader?: DocumentLoader,
): Promise<string> {
  const loader = documentLoader ?? createDocumentLoader();
  // biome-ignore lint/suspicious/noExplicitAny: jsonld types are incomplete
  const canonized = await (jsonld as any).canonize(document, {
    algorithm: "URDNA2015",
    format: "application/n-quads",
    documentLoader: loader,
  });
  return canonized as string;
}

/**
 * Hashes a string (canonical n-quads) with SHA-256.
 */
export function hashSha256(data: string): Buffer {
  return createHash("sha256").update(data, "utf-8").digest();
}

/**
 * Computes the signing input for a Data Integrity proof:
 * 1. Separates proof options from document
 * 2. Removes proofValue from proof options
 * 3. Canonicalizes both proof options and document (URDNA2015, n-quads, offline)
 * 4. Hashes each with SHA-256
 * 5. Concatenates hash(proofOptions) || hash(document)
 *
 * This is the shared core used by both signature verification and proof signing.
 */
export async function computeSigningInput(
  document: Record<string, unknown>,
  proof: DataIntegrityProof,
  documentLoader?: DocumentLoader,
): Promise<SigningInput> {
  const loader = documentLoader ?? createDocumentLoader();

  // Prepare proof options (remove proofValue)
  const proofOptions = prepareProofOptions(proof);

  // Canonicalize both
  const [canonicalProofOptions, canonicalDocument] = await Promise.all([
    canonicalize(proofOptions, loader),
    canonicalize(document, loader),
  ]);

  // Hash each with SHA-256
  const proofOptionsHash = hashSha256(canonicalProofOptions);
  const documentHash = hashSha256(canonicalDocument);

  // Concatenate: hash(proofOptions) || hash(document)
  const signingInput = Buffer.concat([proofOptionsHash, documentHash]);

  return { signingInput, proofOptionsHash, documentHash };
}

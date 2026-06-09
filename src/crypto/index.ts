/**
 * Shared cryptographic utilities for Data Integrity operations.
 *
 * This module provides the canonicalize→hash pipeline shared between
 * signature verification (src/validate/signature.ts) and proof signing
 * (src/generator/proof-signer.ts).
 */

export {
  canonicalize,
  computeSigningInput,
  type DataIntegrityProof,
  hashSha256,
  isDataIntegrityProof,
  prepareProofOptions,
  type SigningInput,
  separateProof,
} from "./data-integrity.js";
export {
  createDocumentLoader,
  DATA_INTEGRITY_CONTEXT,
  type DocumentLoader,
  VC_V1_CONTEXT,
  VC_V2_CONTEXT,
} from "./document-loader.js";

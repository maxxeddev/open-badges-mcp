/**
 * Shared offline JSON-LD document loader.
 *
 * Refactored from src/validate/jsonld.ts so that both the JSON-LD validator
 * and the Data Integrity canonicalization pipeline share a single offline
 * document loader that never fetches remote contexts.
 */

import { readFileSync } from "node:fs";
import type jsonld from "jsonld";
import { resolveSnapshotPath } from "../config.js";

/**
 * Minimal W3C Verifiable Credentials v2 context stub.
 * Defines core VC terms so that JSON-LD expansion works offline.
 * Note: @protected is NOT set here because the OB3 context (loaded second)
 * needs to extend/override some of these terms.
 */
export const VC_V2_CONTEXT = {
  "@context": {
    "@version": 1.1,
    id: "@id",
    type: "@type",
    VerifiableCredential: {
      "@id": "https://www.w3.org/2018/credentials#VerifiableCredential",
    },
    VerifiablePresentation: {
      "@id": "https://www.w3.org/2018/credentials#VerifiablePresentation",
    },
    credentialSubject: {
      "@id": "https://www.w3.org/2018/credentials#credentialSubject",
      "@type": "@id",
    },
    issuer: {
      "@id": "https://www.w3.org/2018/credentials#issuer",
      "@type": "@id",
    },
    issuanceDate: {
      "@id": "https://www.w3.org/2018/credentials#issuanceDate",
      "@type": "http://www.w3.org/2001/XMLSchema#dateTime",
    },
    validFrom: {
      "@id": "https://www.w3.org/2018/credentials#validFrom",
      "@type": "http://www.w3.org/2001/XMLSchema#dateTime",
    },
    validUntil: {
      "@id": "https://www.w3.org/2018/credentials#validUntil",
      "@type": "http://www.w3.org/2001/XMLSchema#dateTime",
    },
    expirationDate: {
      "@id": "https://www.w3.org/2018/credentials#expirationDate",
      "@type": "http://www.w3.org/2001/XMLSchema#dateTime",
    },
    credential: {
      "@id": "https://www.w3.org/2018/credentials#credential",
      "@type": "@id",
    },
    credentialStatus: {
      "@id": "https://www.w3.org/2018/credentials#credentialStatus",
      "@type": "@id",
    },
    credentialSchema: {
      "@id": "https://www.w3.org/2018/credentials#credentialSchema",
      "@type": "@id",
    },
    evidence: {
      "@id": "https://www.w3.org/2018/credentials#evidence",
      "@type": "@id",
    },
    refreshService: {
      "@id": "https://www.w3.org/2018/credentials#refreshService",
      "@type": "@id",
    },
    termsOfUse: {
      "@id": "https://www.w3.org/2018/credentials#termsOfUse",
      "@type": "@id",
    },
    proof: {
      "@id": "https://w3id.org/security#proof",
      "@type": "@id",
      "@container": "@graph",
    },
    name: {
      "@id": "https://schema.org/name",
    },
    description: {
      "@id": "https://schema.org/description",
    },
    image: {
      "@id": "https://schema.org/image",
      "@type": "@id",
    },
  },
};

/**
 * Minimal W3C Verifiable Credentials v1 context stub.
 * Defines core VC terms for older credentials using the v1 context URL.
 */
export const VC_V1_CONTEXT = {
  "@context": {
    "@version": 1.1,
    id: "@id",
    type: "@type",
    VerifiableCredential: {
      "@id": "https://www.w3.org/2018/credentials#VerifiableCredential",
    },
    VerifiablePresentation: {
      "@id": "https://www.w3.org/2018/credentials#VerifiablePresentation",
    },
    credentialSubject: {
      "@id": "https://www.w3.org/2018/credentials#credentialSubject",
      "@type": "@id",
    },
    issuer: {
      "@id": "https://www.w3.org/2018/credentials#issuer",
      "@type": "@id",
    },
    issuanceDate: {
      "@id": "https://www.w3.org/2018/credentials#issuanceDate",
      "@type": "http://www.w3.org/2001/XMLSchema#dateTime",
    },
    expirationDate: {
      "@id": "https://www.w3.org/2018/credentials#expirationDate",
      "@type": "http://www.w3.org/2001/XMLSchema#dateTime",
    },
    credentialStatus: {
      "@id": "https://www.w3.org/2018/credentials#credentialStatus",
      "@type": "@id",
    },
    credentialSchema: {
      "@id": "https://www.w3.org/2018/credentials#credentialSchema",
      "@type": "@id",
    },
    evidence: {
      "@id": "https://www.w3.org/2018/credentials#evidence",
      "@type": "@id",
    },
    refreshService: {
      "@id": "https://www.w3.org/2018/credentials#refreshService",
      "@type": "@id",
    },
    termsOfUse: {
      "@id": "https://www.w3.org/2018/credentials#termsOfUse",
      "@type": "@id",
    },
    proof: {
      "@id": "https://w3id.org/security#proof",
      "@type": "@id",
      "@container": "@graph",
    },
    name: {
      "@id": "https://schema.org/name",
    },
    description: {
      "@id": "https://schema.org/description",
    },
    image: {
      "@id": "https://schema.org/image",
      "@type": "@id",
    },
  },
};

/**
 * W3C Data Integrity v2 context stub for proof canonicalization.
 * Defines terms used in DataIntegrityProof objects.
 */
export const DATA_INTEGRITY_CONTEXT = {
  "@context": {
    "@version": 1.1,
    id: "@id",
    type: "@type",
    sec: "https://w3id.org/security#",
    dc: "http://purl.org/dc/terms/",
    xsd: "http://www.w3.org/2001/XMLSchema#",
    DataIntegrityProof: "sec:DataIntegrityProof",
    cryptosuite: "sec:cryptosuite",
    proofPurpose: "sec:proofPurpose",
    verificationMethod: { "@id": "sec:verificationMethod", "@type": "@id" },
    created: { "@id": "dc:created", "@type": "xsd:dateTime" },
    proofValue: "sec:proofValue",
    domain: "sec:domain",
    challenge: "sec:challenge",
    nonce: "sec:nonce",
  },
};

export type DocumentLoader = (
  url: string,
) => Promise<{ document: jsonld.JsonLdDocument; documentUrl: string }>;

/**
 * Creates a custom document loader that serves local context snapshots.
 * Refuses any remote context fetches (offline-only).
 *
 * This is the single source of truth for offline context resolution,
 * used by both the JSON-LD validator and the Data Integrity canonicalization.
 */
export function createDocumentLoader(): DocumentLoader {
  const snapshotDir = resolveSnapshotPath();
  const ob3Context = JSON.parse(readFileSync(`${snapshotDir}/context.json`, "utf-8"));

  // Map known context URLs to local documents
  const contextMap: Record<string, object> = {
    "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json": ob3Context,
    "https://purl.imsglobal.org/spec/ob/v3p0/context.json": ob3Context,
    "https://www.w3.org/ns/credentials/v2": VC_V2_CONTEXT,
    "https://www.w3.org/2018/credentials/v1": VC_V1_CONTEXT,
    "https://w3id.org/security/data-integrity/v2": DATA_INTEGRITY_CONTEXT,
    "https://w3id.org/security/data-integrity/v1": DATA_INTEGRITY_CONTEXT,
  };

  return async (url: string) => {
    if (contextMap[url]) {
      return {
        document: contextMap[url] as jsonld.JsonLdDocument,
        documentUrl: url,
      };
    }
    throw new Error(`Refused to fetch remote context: ${url}`);
  };
}

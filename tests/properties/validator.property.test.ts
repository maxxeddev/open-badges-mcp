/**
 * Property-based tests for the Credential_Validator unwrapping logic.
 * Uses fast-check to verify that unwrapping yields the correct number of
 * indexed credentials for various container types.
 *
 * **Validates: Requirements 4.1, 4.2, 4.5, 4.7**
 */

import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { unwrap } from "../../src/validate/unwrap.js";

// ---------------------------------------------------------------------------
// Helpers / Arbitraries
// ---------------------------------------------------------------------------

/**
 * Generate a minimal credential-like object with a unique marker so we can
 * distinguish individual credentials in the output.
 */
function credentialArb(index: number): fc.Arbitrary<Record<string, unknown>> {
  return fc.record({
    "@context": fc.constant([
      "https://www.w3.org/ns/credentials/v2",
      "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json",
    ]),
    type: fc.constant(["VerifiableCredential", "OpenBadgeCredential"]),
    id: fc.webUrl().map((url) => `${url}/credential/${index}`),
    issuer: fc.record({
      id: fc.constant(`did:example:issuer-${index}`),
      type: fc.constant(["Profile"]),
    }),
    credentialSubject: fc.record({
      id: fc.constant(`did:example:subject-${index}`),
      type: fc.constant(["AchievementSubject"]),
    }),
    _testIndex: fc.constant(index),
  });
}

/**
 * Generate an array of N credential objects (N in 1..10).
 */
const credentialArrayArb = fc
  .integer({ min: 1, max: 10 })
  .chain((n) =>
    fc.tuple(fc.constant(n), fc.tuple(...Array.from({ length: n }, (_, i) => credentialArb(i)))),
  );

/**
 * Generate a VerifiablePresentation wrapping N inner credentials.
 */
const vpArb = credentialArrayArb.map(([n, creds]) => ({
  n,
  input: {
    "@context": ["https://www.w3.org/ns/credentials/v2"],
    type: ["VerifiablePresentation"],
    verifiableCredential: creds,
  } as Record<string, unknown>,
}));

/**
 * Generate a GetOpenBadgeCredentialsResponse wrapping N inner credentials.
 */
const batchResponseArb = credentialArrayArb.map(([n, creds]) => ({
  n,
  input: {
    type: ["GetOpenBadgeCredentialsResponse"],
    credential: creds,
  } as Record<string, unknown>,
}));

/**
 * Generate a single unwrapped credential (N=1).
 */
const singleCredentialArb = credentialArb(0).map((cred) => ({
  n: 1,
  input: cred,
}));

// ---------------------------------------------------------------------------
// Property 8: Unwrapping yields one indexed report per inner credential
//
// For any validator input — a VerifiablePresentation with N inner credentials,
// a GetOpenBadgeCredentialsResponse with N inner credentials, or a single
// unwrapped credential (N=1) — unwrap() returns exactly N credentials in its
// `credentials` array, each carrying a distinct index covering 0..(N-1).
//
// Feature: ob3-tooling-improvements, Property 8: Unwrapping yields one indexed report per inner credential
// ---------------------------------------------------------------------------

describe("Feature: ob3-tooling-improvements, Property 8: Unwrapping yields one indexed report per inner credential", () => {
  /**
   * **Validates: Requirements 4.1, 4.2**
   *
   * VerifiablePresentation with N inner credentials yields exactly N
   * unwrapped credentials with distinct indices 0..(N-1).
   */
  it("VerifiablePresentation with N credentials yields N indexed results", () => {
    fc.assert(
      fc.property(vpArb, ({ n, input }) => {
        const result = unwrap(input);

        // No decode errors expected for well-formed plain credentials
        expect(result.errors).toHaveLength(0);

        // Exactly N credentials in the output
        expect(result.credentials).toHaveLength(n);

        // Each credential has a distinct index covering 0..(N-1)
        const indices = result.credentials.map((c) => c.index);
        const expectedIndices = Array.from({ length: n }, (_, i) => i);
        expect(indices.sort((a, b) => a - b)).toEqual(expectedIndices);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 4.2, 4.5**
   *
   * GetOpenBadgeCredentialsResponse with N inner credentials yields exactly N
   * unwrapped credentials with distinct indices 0..(N-1).
   */
  it("GetOpenBadgeCredentialsResponse with N credentials yields N indexed results", () => {
    fc.assert(
      fc.property(batchResponseArb, ({ n, input }) => {
        const result = unwrap(input);

        // No decode errors expected for well-formed plain credentials
        expect(result.errors).toHaveLength(0);

        // Exactly N credentials in the output
        expect(result.credentials).toHaveLength(n);

        // Each credential has a distinct index covering 0..(N-1)
        const indices = result.credentials.map((c) => c.index);
        const expectedIndices = Array.from({ length: n }, (_, i) => i);
        expect(indices.sort((a, b) => a - b)).toEqual(expectedIndices);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 4.7**
   *
   * A single unwrapped credential (no wrapper) yields exactly 1 credential
   * with index 0.
   */
  it("single unwrapped credential yields exactly 1 result at index 0", () => {
    fc.assert(
      fc.property(singleCredentialArb, ({ n, input }) => {
        const result = unwrap(input);

        // No decode errors
        expect(result.errors).toHaveLength(0);

        // Exactly 1 credential
        expect(result.credentials).toHaveLength(n);
        expect(result.credentials).toHaveLength(1);

        // Index is 0
        expect(result.credentials[0].index).toBe(0);

        // Source is "single"
        expect(result.credentials[0].source).toBe("single");
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 4.1, 4.5**
   *
   * The source field for credentials from a VerifiablePresentation is
   * "presentation", confirming the source tracking is correct per-credential.
   */
  it("VP credentials carry source 'presentation'", () => {
    fc.assert(
      fc.property(vpArb, ({ input }) => {
        const result = unwrap(input);

        for (const cred of result.credentials) {
          expect(cred.source).toBe("presentation");
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 4.2, 4.5**
   *
   * The source field for credentials from a GetOpenBadgeCredentialsResponse is
   * "batch", confirming the source tracking is correct per-credential.
   */
  it("batch response credentials carry source 'batch'", () => {
    fc.assert(
      fc.property(batchResponseArb, ({ input }) => {
        const result = unwrap(input);

        for (const cred of result.credentials) {
          expect(cred.source).toBe("batch");
        }
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 9: Undecodable enveloped input produces an identifying error, never a throw
//
// For any malformed Enveloped_Input data URI, the validator returns a decode-error
// result that identifies the decoding failure rather than raising an exception.
//
// Feature: ob3-tooling-improvements, Property 9: Undecodable enveloped input produces an identifying error, never a throw
// ---------------------------------------------------------------------------

describe("Feature: ob3-tooling-improvements, Property 9: Undecodable enveloped input produces an identifying error, never a throw", () => {
  // -------------------------------------------------------------------------
  // Arbitraries for malformed enveloped credential id values
  // -------------------------------------------------------------------------

  /**
   * Completely random strings — no data: prefix, garbage bytes, etc.
   */
  const randomStringIdArb = fc.string({ minLength: 0, maxLength: 200 });

  /**
   * Invalid base64 content after a valid-looking data: prefix with a JWT media type.
   * Generates strings with characters not valid in base64url.
   */
  const invalidBase64JwtArb = fc
    .tuple(
      fc.constantFrom(
        "application/vc+jwt",
        "application/jwt",
        "application/vc+sd-jwt",
        "application/sd-jwt",
      ),
      fc.string({ minLength: 1, maxLength: 100 }),
    )
    .map(([mediaType, garbage]) => `data:${mediaType},${garbage}`);

  /**
   * Truncated JWTs — one or two dot-separated segments instead of three.
   */
  const truncatedJwtArb = fc
    .tuple(
      fc.constantFrom("application/vc+jwt", "application/jwt"),
      fc.integer({ min: 0, max: 1 }),
      fc.array(fc.base64String({ minLength: 1, maxLength: 30 }), {
        minLength: 1,
        maxLength: 2,
      }),
    )
    .map(([mediaType, _, segments]) => `data:${mediaType},${segments.join(".")}`);

  /**
   * Invalid/unsupported media types — the data URI has a proper structure but
   * an unrecognized media type.
   */
  const invalidMediaTypeArb = fc
    .tuple(
      fc.constantFrom(
        "text/plain",
        "application/xml",
        "image/png",
        "application/octet-stream",
        "video/mp4",
        "application/json",
      ),
      fc.string({ minLength: 0, maxLength: 50 }),
    )
    .map(([mediaType, payload]) => `data:${mediaType},${payload}`);

  /**
   * Data URIs missing the comma separator (malformed structure).
   */
  const missingCommaArb = fc
    .tuple(
      fc.constantFrom("application/vc+jwt", "application/jwt"),
      fc.string({ minLength: 1, maxLength: 50 }),
    )
    .map(([mediaType, rest]) => `data:${mediaType}${rest}`);

  /**
   * JWTs with three segments but the payload is not valid base64url JSON —
   * the base64url decodes to non-JSON content.
   */
  const nonJsonPayloadJwtArb = fc
    .tuple(
      fc.constantFrom("application/vc+jwt", "application/jwt"),
      fc.string({ minLength: 1, maxLength: 30 }),
    )
    .map(([mediaType, garbage]) => {
      // Encode garbage as base64url for the payload segment
      const header = Buffer.from("{}").toString("base64url");
      const payload = Buffer.from(garbage).toString("base64url");
      const sig = Buffer.from("sig").toString("base64url");
      return `data:${mediaType},${header}.${payload}.${sig}`;
    })
    // Filter out cases where the garbage accidentally parses as JSON
    .filter((uri) => {
      const payload = uri.split(",")[1].split(".")[1];
      try {
        JSON.parse(Buffer.from(payload, "base64url").toString("utf-8"));
        return false;
      } catch {
        return true;
      }
    });

  /**
   * Non-string id values (numbers, booleans, null, undefined, objects, arrays).
   */
  const nonStringIdArb = fc.oneof(
    fc.integer(),
    fc.boolean(),
    fc.constant(null),
    fc.constant(undefined),
    fc.object(),
    fc.array(fc.anything(), { maxLength: 3 }),
  );

  /**
   * Combine all malformed id arbitraries into a single union for broad coverage.
   */
  const malformedIdArb = fc.oneof(
    randomStringIdArb,
    invalidBase64JwtArb,
    truncatedJwtArb,
    invalidMediaTypeArb,
    missingCommaArb,
    nonJsonPayloadJwtArb,
  );

  /**
   * Build an EnvelopedVerifiableCredential with a given (malformed) id.
   */
  function makeEnvelopedInput(id: unknown): Record<string, unknown> {
    return {
      type: ["EnvelopedVerifiableCredential"],
      id,
    };
  }

  /**
   * **Validates: Requirements 4.6**
   *
   * For any malformed data URI as the `id` of an EnvelopedVerifiableCredential,
   * unwrap() NEVER throws and returns an `errors` array with at least one entry
   * that has a descriptive `message`, and the `credentials` array is empty.
   */
  it("malformed data URI ids produce error entries, never throws", () => {
    fc.assert(
      fc.property(malformedIdArb, (malformedId) => {
        const input = makeEnvelopedInput(malformedId);

        // unwrap must NEVER throw
        let result: ReturnType<typeof unwrap>;
        try {
          result = unwrap(input);
        } catch (e) {
          // If we get here, the property is violated
          throw new Error(
            `unwrap() threw instead of returning an error: ${e instanceof Error ? e.message : String(e)}`,
          );
        }

        // No credential was successfully decoded
        expect(result.credentials).toHaveLength(0);

        // At least one error entry exists
        expect(result.errors.length).toBeGreaterThanOrEqual(1);

        // Each error entry has a descriptive message (non-empty string)
        for (const err of result.errors) {
          expect(typeof err.message).toBe("string");
          expect(err.message.length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 4.6**
   *
   * For non-string id values (numbers, booleans, null, objects, etc.),
   * unwrap() NEVER throws and returns an identifying error.
   */
  it("non-string id values produce error entries, never throws", () => {
    fc.assert(
      fc.property(nonStringIdArb, (nonStringId) => {
        const input = makeEnvelopedInput(nonStringId);

        // unwrap must NEVER throw
        let result: ReturnType<typeof unwrap>;
        try {
          result = unwrap(input);
        } catch (e) {
          throw new Error(
            `unwrap() threw instead of returning an error: ${e instanceof Error ? e.message : String(e)}`,
          );
        }

        // No credential was successfully decoded
        expect(result.credentials).toHaveLength(0);

        // At least one error entry exists
        expect(result.errors.length).toBeGreaterThanOrEqual(1);

        // Each error entry has a descriptive message (non-empty string)
        for (const err of result.errors) {
          expect(typeof err.message).toBe("string");
          expect(err.message.length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 12: Proof-less credentials are not applicable for signature
//
// For any credential document that does NOT contain a DataIntegrityProof (either
// no `proof` field at all, or a proof that lacks the required DataIntegrityProof
// shape), checkSignature() returns status "not_applicable" with no error.
//
// Feature: ob3-tooling-improvements, Property 12: Proof-less credentials are not applicable for signature
// ---------------------------------------------------------------------------

import { checkSignature } from "../../src/validate/signature.js";

/**
 * Generate a minimal credential-like object without any proof field.
 */
const credentialWithoutProofArb: fc.Arbitrary<Record<string, unknown>> = fc.record({
  "@context": fc.constant([
    "https://www.w3.org/ns/credentials/v2",
    "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json",
  ]),
  type: fc.constant(["VerifiableCredential", "OpenBadgeCredential"]),
  id: fc.webUrl(),
  issuer: fc.record({
    id: fc.constant("did:example:issuer-1"),
    type: fc.constant(["Profile"]),
  }),
  credentialSubject: fc.record({
    id: fc.constant("did:example:subject-1"),
    type: fc.constant(["AchievementSubject"]),
  }),
});

/**
 * Generate a proof object that is NOT a valid DataIntegrityProof.
 * A DataIntegrityProof requires: type === "DataIntegrityProof", a cryptosuite string,
 * and a proofValue string. We generate proofs that violate at least one of these.
 */
const nonDataIntegrityProofArb: fc.Arbitrary<Record<string, unknown>> = fc.oneof(
  // Case 1: Wrong type (not "DataIntegrityProof")
  fc.record({
    type: fc.constantFrom(
      "Ed25519Signature2018",
      "JsonWebSignature2020",
      "RsaSignature2018",
      "ProofOfWork",
    ),
    proofPurpose: fc.constant("assertionMethod"),
    verificationMethod: fc.constant("did:example:key-1"),
    created: fc.constant("2024-01-01T00:00:00Z"),
  }),
  // Case 2: Has DataIntegrityProof type but cryptosuite is not a string
  fc.record({
    type: fc.constant("DataIntegrityProof"),
    proofPurpose: fc.constant("assertionMethod"),
    verificationMethod: fc.constant("did:example:key-1"),
    proofValue: fc.constant("zSomeSignatureValue"),
    cryptosuite: fc.constantFrom(undefined, null, 123, true) as fc.Arbitrary<unknown>,
  }) as fc.Arbitrary<Record<string, unknown>>,
  // Case 3: Missing proofValue (has type and cryptosuite but no proofValue string)
  fc.record({
    type: fc.constant("DataIntegrityProof"),
    cryptosuite: fc.constant("eddsa-rdfc-2022"),
    proofPurpose: fc.constant("assertionMethod"),
    verificationMethod: fc.constant("did:example:key-1"),
  }),
  // Case 4: Empty object (no relevant fields at all)
  fc.record({
    created: fc.constant("2024-01-01T00:00:00Z"),
    proofPurpose: fc.constant("assertionMethod"),
  }),
);

/**
 * Generate a credential with a proof field that is NOT a DataIntegrityProof.
 */
const credentialWithNonDIProofArb: fc.Arbitrary<Record<string, unknown>> = fc
  .tuple(credentialWithoutProofArb, nonDataIntegrityProofArb)
  .map(([cred, proof]) => ({
    ...cred,
    proof,
  }));

/**
 * Combine: credentials with no proof OR credentials with non-DataIntegrityProof proof.
 */
const proofLessCredentialArb: fc.Arbitrary<Record<string, unknown>> = fc.oneof(
  credentialWithoutProofArb,
  credentialWithNonDIProofArb,
);

describe("Feature: ob3-tooling-improvements, Property 12: Proof-less credentials are not applicable for signature", () => {
  /**
   * **Validates: Requirements 5.4**
   *
   * For any credential document that does NOT contain a DataIntegrityProof,
   * checkSignature() returns status "not_applicable" with no error reported.
   */
  it("credentials without a DataIntegrityProof are not applicable for signature check", async () => {
    await fc.assert(
      fc.asyncProperty(proofLessCredentialArb, async (doc) => {
        const result = await checkSignature(doc);

        // Status must be "not_applicable"
        expect(result.status).toBe("not_applicable");

        // No error should be reported
        expect(result.error).toBeUndefined();
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 13: The three checks are independent and all run
//
// For any credential document (valid or invalid), calling validateCredential
// with mode "all" always reports exactly 3 check results per credential, each
// with a distinct check name (schema, jsonld, signature), regardless of
// individual pass/fail status.
//
// Feature: ob3-tooling-improvements, Property 13: The three checks are independent and all run
// ---------------------------------------------------------------------------

import { validateCredential } from "../../src/validate/orchestrator.js";

/**
 * Generate arbitrary credential-like documents — both valid and invalid shapes.
 * This exercises the orchestrator's independence guarantee across diverse inputs.
 */
const arbitraryCredentialDocArb: fc.Arbitrary<Record<string, unknown>> = fc.oneof(
  // Well-formed OB3 credential (should pass schema & jsonld, not_applicable for signature)
  fc.record({
    "@context": fc.constant([
      "https://www.w3.org/ns/credentials/v2",
      "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json",
    ]),
    type: fc.constant(["VerifiableCredential", "OpenBadgeCredential"]),
    id: fc.webUrl(),
    issuer: fc.record({
      id: fc.constant("did:example:issuer"),
      type: fc.constant(["Profile"]),
    }),
    validFrom: fc.constant("2024-01-01T00:00:00Z"),
    name: fc.string({ minLength: 1, maxLength: 50 }),
    credentialSubject: fc.record({
      id: fc.constant("did:example:subject"),
      type: fc.constant(["AchievementSubject"]),
      achievement: fc.record({
        id: fc.webUrl(),
        type: fc.constant(["Achievement"]),
        name: fc.string({ minLength: 1, maxLength: 50 }),
        criteria: fc.record({
          narrative: fc.string({ minLength: 1, maxLength: 100 }),
        }),
      }),
    }),
  }),
  // Credential missing required fields (should fail schema, possibly jsonld)
  fc.record({
    "@context": fc.constant([
      "https://www.w3.org/ns/credentials/v2",
      "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json",
    ]),
    type: fc.constant(["VerifiableCredential", "OpenBadgeCredential"]),
    id: fc.webUrl(),
  }),
  // Credential with invalid context (should fail jsonld)
  fc.record({
    "@context": fc.constant(["https://example.com/invalid-context"]),
    type: fc.constant(["VerifiableCredential"]),
    id: fc.webUrl(),
    issuer: fc.constant("did:example:issuer"),
    credentialSubject: fc.record({
      id: fc.constant("did:example:subject"),
    }),
  }),
  // Credential with a bogus proof (should fail signature check)
  fc.record({
    "@context": fc.constant([
      "https://www.w3.org/ns/credentials/v2",
      "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json",
    ]),
    type: fc.constant(["VerifiableCredential", "OpenBadgeCredential"]),
    id: fc.webUrl(),
    issuer: fc.record({
      id: fc.constant("did:example:issuer"),
      type: fc.constant(["Profile"]),
    }),
    validFrom: fc.constant("2024-01-01T00:00:00Z"),
    name: fc.constant("Test Badge"),
    credentialSubject: fc.record({
      id: fc.constant("did:example:subject"),
      type: fc.constant(["AchievementSubject"]),
      achievement: fc.record({
        id: fc.webUrl(),
        type: fc.constant(["Achievement"]),
        name: fc.constant("Achievement"),
        criteria: fc.record({
          narrative: fc.constant("Criteria narrative"),
        }),
      }),
    }),
    proof: fc.record({
      type: fc.constant("DataIntegrityProof"),
      cryptosuite: fc.constant("eddsa-rdfc-2022"),
      proofPurpose: fc.constant("assertionMethod"),
      verificationMethod: fc.constant("did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK"),
      proofValue: fc.constant("zInvalidSignatureValue"),
      created: fc.constant("2024-01-01T00:00:00Z"),
    }),
  }),
  // Minimal/empty object (should fail schema and jsonld)
  fc.record({
    type: fc.constantFrom(
      ["VerifiableCredential"],
      ["VerifiableCredential", "OpenBadgeCredential"],
      [],
    ),
  }),
  // Random object shape
  fc.record({
    "@context": fc.oneof(
      fc.constant(["https://www.w3.org/ns/credentials/v2"]),
      fc.constant([]),
      fc.constant("not-an-array"),
    ),
    type: fc.oneof(fc.constant(["VerifiableCredential"]), fc.constant([])),
    id: fc.oneof(fc.webUrl(), fc.constant("")),
    extra: fc.anything(),
  }),
);

describe("Feature: ob3-tooling-improvements, Property 13: The three checks are independent and all run", () => {
  /**
   * **Validates: Requirements 5.5, 5.6**
   *
   * For any credential document (valid or invalid), validateCredential in mode "all"
   * always reports exactly 3 check results per credential with distinct check names.
   * A failing check never prevents the other checks from running.
   */
  it("mode 'all' always produces exactly 3 distinct independent check results per credential", async () => {
    await fc.assert(
      fc.asyncProperty(arbitraryCredentialDocArb, async (doc) => {
        const response = await validateCredential(doc, "all");

        // Should always produce at least one credential result for non-wrapper inputs
        expect(response.results.length).toBeGreaterThanOrEqual(1);

        for (const report of response.results) {
          // Exactly 3 checks are reported
          expect(report.checks).toHaveLength(3);

          // Each check has a distinct name from the expected set
          const checkNames = report.checks.map((c) => c.check);
          expect(checkNames).toContain("schema");
          expect(checkNames).toContain("jsonld");
          expect(checkNames).toContain("signature");

          // All check names are unique (no duplicates)
          const uniqueNames = new Set(checkNames);
          expect(uniqueNames.size).toBe(3);

          // Each check has a valid status (never undefined/null)
          for (const check of report.checks) {
            expect(["passed", "failed", "not_applicable"]).toContain(check.status);
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 5.6**
   *
   * Even when one or more checks fail, all three checks are still present.
   * This specifically tests that failures don't short-circuit.
   */
  it("a failing check does not prevent the other checks from running", async () => {
    await fc.assert(
      fc.asyncProperty(arbitraryCredentialDocArb, async (doc) => {
        const response = await validateCredential(doc, "all");

        for (const report of response.results) {
          // Regardless of which checks passed or failed, all 3 are present
          expect(report.checks).toHaveLength(3);

          const failedChecks = report.checks.filter((c) => c.status === "failed");
          const otherChecks = report.checks.filter((c) => c.status !== "failed");

          // If there are failing checks, the non-failing checks still exist
          // (total must always be 3)
          expect(failedChecks.length + otherChecks.length).toBe(3);

          // Every check has an errors array (even if empty for passing checks)
          for (const check of report.checks) {
            expect(Array.isArray(check.errors)).toBe(true);
          }
        }
      }),
      { numRuns: 100 },
    );
  });
});

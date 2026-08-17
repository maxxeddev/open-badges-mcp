/**
 * Property-based tests for the Builder's rich-tier field placement.
 * Uses fast-check to verify that supplied rich-tier values appear at their
 * correct mapped locations in the assembled credential.
 *
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6**
 */

import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createAchievementCredential } from "../../src/create/achievement.js";
import { applyRichTier } from "../../src/create/rich-tier.js";
import type { CreateAchievementCredentialInputT, SynthesisRecord } from "../../src/create/types.js";
import { WARNING_UNRECOGNIZED_FIELD } from "../../src/create/types.js";
import { detectUnrecognizedFields } from "../../src/create/unrecognized.js";
import { checkValidUntilCoherency } from "../../src/create/warnings.js";
import { validateJsonLd } from "../../src/validate/jsonld.js";
import { validateSchema } from "../../src/validate/schema.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a minimal base credential structure that applyRichTier expects.
 * The credential must have a credentialSubject with an achievement object.
 */
function makeBaseCredential(): Record<string, unknown> {
  return {
    "@context": ["https://www.w3.org/ns/credentials/v2"],
    type: ["VerifiableCredential", "AchievementCredential"],
    issuer: { id: "urn:uuid:issuer-1", type: ["Profile"], name: "Test Issuer" },
    credentialSubject: {
      type: ["AchievementSubject"],
      achievement: {
        id: "urn:uuid:achievement-1",
        type: ["Achievement"],
        name: "Test Achievement",
        description: "A test achievement",
        criteria: { narrative: "Complete the test" },
      },
    },
    validFrom: "2024-01-01T00:00:00Z",
  };
}

/**
 * Creates a minimal input object suitable for applyRichTier.
 * Rich-tier fields are left undefined; tests supply them via overrides.
 */
function makeBaseInput(
  overrides: Partial<CreateAchievementCredentialInputT> = {},
): CreateAchievementCredentialInputT {
  return {
    issuer: { name: "Test Issuer" },
    achievement: {
      name: "Test Achievement",
      description: "A test achievement",
      criteria: { narrative: "Complete the test" },
      ...overrides.achievement,
    },
    recipient: {},
    ...overrides,
    // Re-apply achievement to merge properly
    ...(overrides.achievement
      ? {
          achievement: {
            name: "Test Achievement",
            description: "A test achievement",
            criteria: { narrative: "Complete the test" },
            ...overrides.achievement,
          },
        }
      : {}),
  } as CreateAchievementCredentialInputT;
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Arbitrary for a record with string keys and unknown values (simple objects) */
const arbitraryRecord = fc.dictionary(
  fc.string({ minLength: 1, maxLength: 20 }).filter((s) => /^[a-zA-Z]/.test(s)),
  fc.oneof(fc.string(), fc.integer(), fc.boolean()),
  { minKeys: 1, maxKeys: 5 },
);

/** Arbitrary for result arrays (subject-level) */
const arbitraryResultArray = fc.array(arbitraryRecord, { minLength: 1, maxLength: 5 });

/** Arbitrary for source object (subject-level) */
const arbitrarySource = arbitraryRecord;

/** Arbitrary for alignment arrays (achievement-level) */
const arbitraryAlignmentArray = fc.array(arbitraryRecord, { minLength: 1, maxLength: 5 });

/** Arbitrary for related arrays (achievement-level) */
const arbitraryRelatedArray = fc.array(arbitraryRecord, { minLength: 1, maxLength: 5 });

/** Arbitrary for proof object (top-level) */
const arbitraryProof = fc.record({
  type: fc.constant("DataIntegrityProof"),
  cryptosuite: fc.constant("eddsa-rdfc-2022"),
  proofValue: fc.string({ minLength: 10, maxLength: 50 }),
});

/** Arbitrary for credentialStatus (top-level) */
const arbitraryCredentialStatus = fc.record({
  id: fc.webUrl(),
  type: fc.constant("BitstringStatusListEntry"),
  statusPurpose: fc.constantFrom("revocation", "suspension"),
});

/** Arbitrary for endorsement arrays (top-level) */
const arbitraryEndorsementArray = fc.array(arbitraryRecord, { minLength: 1, maxLength: 3 });

/** Arbitrary for termsOfUse (top-level) */
const arbitraryTermsOfUse = fc.record({
  type: fc.constant("IssuerPolicy"),
  id: fc.webUrl(),
});

/** Arbitrary for refreshService (top-level) */
const arbitraryRefreshService = fc.record({
  type: fc.constant("ManualRefreshService2018"),
  id: fc.webUrl(),
});

/** Arbitrary for credentialSchema (top-level) */
const arbitraryCredentialSchema = fc.record({
  id: fc.webUrl(),
  type: fc.constant("JsonSchema"),
});

/**
 * Composite arbitrary that generates a subset of rich-tier fields.
 * Each field is optionally present (using fc.option) to test all combinations.
 */
const arbitraryRichTierInputs = fc.record({
  result: fc.option(arbitraryResultArray, { nil: undefined }),
  source: fc.option(arbitrarySource, { nil: undefined }),
  alignment: fc.option(arbitraryAlignmentArray, { nil: undefined }),
  related: fc.option(arbitraryRelatedArray, { nil: undefined }),
  proof: fc.option(arbitraryProof, { nil: undefined }),
  credentialStatus: fc.option(arbitraryCredentialStatus, { nil: undefined }),
  endorsement: fc.option(arbitraryEndorsementArray, { nil: undefined }),
  termsOfUse: fc.option(arbitraryTermsOfUse, { nil: undefined }),
  refreshService: fc.option(arbitraryRefreshService, { nil: undefined }),
  credentialSchema: fc.option(arbitraryCredentialSchema, { nil: undefined }),
});

// ---------------------------------------------------------------------------
// Property 1: Rich-tier fields appear at their mapped locations
//
// For any builder input that supplies rich-tier values, the successfully built
// credential contains each supplied value at its specified location.
//
// Feature: ob3-tooling-improvements, Property 1: Rich-tier fields appear at their mapped locations
// ---------------------------------------------------------------------------

describe("Feature: ob3-tooling-improvements, Property 1: Rich-tier fields appear at their mapped locations", () => {
  /**
   * **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6**
   */
  it("each supplied rich-tier value appears at its correct mapped location", () => {
    fc.assert(
      fc.property(arbitraryRichTierInputs, (richTier) => {
        // Skip if no rich-tier fields are supplied at all
        const hasAnyField =
          richTier.result !== undefined ||
          richTier.source !== undefined ||
          richTier.alignment !== undefined ||
          richTier.related !== undefined ||
          richTier.proof !== undefined ||
          richTier.credentialStatus !== undefined ||
          richTier.endorsement !== undefined ||
          richTier.termsOfUse !== undefined ||
          richTier.refreshService !== undefined ||
          richTier.credentialSchema !== undefined;
        fc.pre(hasAnyField);

        // Build input with rich-tier fields
        const input = makeBaseInput({
          result: richTier.result,
          source: richTier.source,
          proof: richTier.proof,
          credentialStatus: richTier.credentialStatus,
          endorsement: richTier.endorsement,
          termsOfUse: richTier.termsOfUse,
          refreshService: richTier.refreshService,
          credentialSchema: richTier.credentialSchema,
          achievement: {
            name: "Test Achievement",
            description: "A test achievement",
            criteria: { narrative: "Complete the test" },
            alignment: richTier.alignment,
            related: richTier.related,
          },
        });

        const credential = makeBaseCredential();
        const synthesized: SynthesisRecord[] = [];

        // Apply rich-tier mapping
        applyRichTier(credential, input, synthesized);

        const credentialSubject = credential.credentialSubject as Record<string, unknown>;
        const achievement = credentialSubject.achievement as Record<string, unknown>;

        // R1.1: result → credential.credentialSubject.result
        if (richTier.result !== undefined) {
          expect(credentialSubject.result).toBeDefined();
          const resultArray = credentialSubject.result as Record<string, unknown>[];
          expect(resultArray.length).toBe(richTier.result.length);
          // Each result item should contain the original data (type may be added)
          for (let i = 0; i < richTier.result.length; i++) {
            for (const [key, value] of Object.entries(richTier.result[i])) {
              if (key !== "type") {
                expect(resultArray[i][key]).toEqual(value);
              }
            }
          }
        }

        // R1.2: source → credential.credentialSubject.source
        if (richTier.source !== undefined) {
          expect(credentialSubject.source).toEqual(richTier.source);
        }

        // R1.3: alignment → credential.credentialSubject.achievement.alignment
        if (richTier.alignment !== undefined) {
          expect(achievement.alignment).toBeDefined();
          const alignmentArray = achievement.alignment as Record<string, unknown>[];
          expect(alignmentArray.length).toBe(richTier.alignment.length);
          for (let i = 0; i < richTier.alignment.length; i++) {
            for (const [key, value] of Object.entries(richTier.alignment[i])) {
              if (key !== "type") {
                expect(alignmentArray[i][key]).toEqual(value);
              }
            }
          }
        }

        // R1.4: related → credential.credentialSubject.achievement.related
        if (richTier.related !== undefined) {
          expect(achievement.related).toBeDefined();
          const relatedArray = achievement.related as Record<string, unknown>[];
          expect(relatedArray.length).toBe(richTier.related.length);
          for (let i = 0; i < richTier.related.length; i++) {
            for (const [key, value] of Object.entries(richTier.related[i])) {
              if (key !== "type") {
                expect(relatedArray[i][key]).toEqual(value);
              }
            }
          }
        }

        // R2.1: proof → credential.proof
        if (richTier.proof !== undefined) {
          expect(credential.proof).toEqual(richTier.proof);
        }

        // R2.2: credentialStatus → credential.credentialStatus
        if (richTier.credentialStatus !== undefined) {
          expect(credential.credentialStatus).toEqual(richTier.credentialStatus);
        }

        // R2.3: endorsement → credential.endorsement
        if (richTier.endorsement !== undefined) {
          expect(credential.endorsement).toBeDefined();
          const endorsementArray = credential.endorsement as Record<string, unknown>[];
          expect(endorsementArray.length).toBe(richTier.endorsement.length);
          for (let i = 0; i < richTier.endorsement.length; i++) {
            for (const [key, value] of Object.entries(richTier.endorsement[i])) {
              if (key !== "type") {
                expect(endorsementArray[i][key]).toEqual(value);
              }
            }
          }
        }

        // R2.4: termsOfUse → credential.termsOfUse
        if (richTier.termsOfUse !== undefined) {
          expect(credential.termsOfUse).toEqual(richTier.termsOfUse);
        }

        // R2.5: refreshService → credential.refreshService
        if (richTier.refreshService !== undefined) {
          expect(credential.refreshService).toEqual(richTier.refreshService);
        }

        // R2.6: credentialSchema → credential.credentialSchema
        if (richTier.credentialSchema !== undefined) {
          expect(credential.credentialSchema).toEqual(richTier.credentialSchema);
        }
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 2: Required rich-tier types are synthesized and recorded
//
// For any rich-tier object supplied without a `type` value that OB3 requires,
// the built credential sets the correct `type` value for that object and the
// `synthesized` list contains a record naming that path.
//
// Feature: ob3-tooling-improvements, Property 2: Required rich-tier types are synthesized and recorded
// ---------------------------------------------------------------------------

describe("Feature: ob3-tooling-improvements, Property 2: Required rich-tier types are synthesized and recorded", () => {
  /**
   * **Validates: Requirements 1.5**
   */

  /** Arbitrary for a record that explicitly has no `type` field */
  const arbitraryRecordWithoutType = fc
    .dictionary(
      fc.string({ minLength: 1, maxLength: 20 }).filter((s) => /^[a-zA-Z]/.test(s) && s !== "type"),
      fc.oneof(fc.string(), fc.integer(), fc.boolean()),
      { minKeys: 1, maxKeys: 5 },
    )
    .map((r) => {
      // Ensure `type` is never present
      const { type: _, ...rest } = r as Record<string, unknown>;
      return rest as Record<string, unknown>;
    });

  /** Arbitrary for result arrays without type */
  const arbitraryResultsWithoutType = fc.array(arbitraryRecordWithoutType, {
    minLength: 1,
    maxLength: 4,
  });

  /** Arbitrary for alignment arrays without type */
  const arbitraryAlignmentsWithoutType = fc.array(arbitraryRecordWithoutType, {
    minLength: 1,
    maxLength: 4,
  });

  /** Arbitrary for related arrays without type */
  const arbitraryRelatedsWithoutType = fc.array(arbitraryRecordWithoutType, {
    minLength: 1,
    maxLength: 4,
  });

  /** Arbitrary for endorsement arrays without type */
  const arbitraryEndorsementsWithoutType = fc.array(arbitraryRecordWithoutType, {
    minLength: 1,
    maxLength: 3,
  });

  /**
   * Composite arbitrary that generates a combination of rich-tier objects
   * that require type synthesis (at least one category present).
   */
  const arbitraryTypeSynthesisInputs = fc
    .record({
      result: fc.option(arbitraryResultsWithoutType, { nil: undefined }),
      alignment: fc.option(arbitraryAlignmentsWithoutType, { nil: undefined }),
      related: fc.option(arbitraryRelatedsWithoutType, { nil: undefined }),
      endorsement: fc.option(arbitraryEndorsementsWithoutType, { nil: undefined }),
    })
    .filter(
      (r) =>
        r.result !== undefined ||
        r.alignment !== undefined ||
        r.related !== undefined ||
        r.endorsement !== undefined,
    );

  it("objects without a type field receive the correct OB3 type and are recorded in synthesized", () => {
    fc.assert(
      fc.property(arbitraryTypeSynthesisInputs, (inputs) => {
        const credential = makeBaseCredential();
        const synthesized: SynthesisRecord[] = [];

        const input = makeBaseInput({
          result: inputs.result,
          endorsement: inputs.endorsement,
          achievement: {
            name: "Test Achievement",
            description: "A test achievement",
            criteria: { narrative: "Complete the test" },
            alignment: inputs.alignment,
            related: inputs.related,
          },
        });

        applyRichTier(credential, input, synthesized);

        const credentialSubject = credential.credentialSubject as Record<string, unknown>;
        const achievement = credentialSubject.achievement as Record<string, unknown>;

        // Check Result objects get type ["Result"] and synthesis is recorded
        if (inputs.result !== undefined) {
          const resultArray = credentialSubject.result as Record<string, unknown>[];
          for (let i = 0; i < inputs.result.length; i++) {
            expect(resultArray[i].type).toEqual(["Result"]);
            expect(synthesized.some((s) => s.path === `credentialSubject.result[${i}].type`)).toBe(
              true,
            );
          }
        }

        // Check Alignment objects get type ["Alignment"] and synthesis is recorded
        if (inputs.alignment !== undefined) {
          const alignmentArray = achievement.alignment as Record<string, unknown>[];
          for (let i = 0; i < inputs.alignment.length; i++) {
            expect(alignmentArray[i].type).toEqual(["Alignment"]);
            expect(
              synthesized.some(
                (s) => s.path === `credentialSubject.achievement.alignment[${i}].type`,
              ),
            ).toBe(true);
          }
        }

        // Check Related objects get type ["Related"] and synthesis is recorded
        if (inputs.related !== undefined) {
          const relatedArray = achievement.related as Record<string, unknown>[];
          for (let i = 0; i < inputs.related.length; i++) {
            expect(relatedArray[i].type).toEqual(["Related"]);
            expect(
              synthesized.some(
                (s) => s.path === `credentialSubject.achievement.related[${i}].type`,
              ),
            ).toBe(true);
          }
        }

        // Check EndorsementCredential objects get type ["VerifiableCredential", "EndorsementCredential"]
        // and synthesis is recorded
        if (inputs.endorsement !== undefined) {
          const endorsementArray = credential.endorsement as Record<string, unknown>[];
          for (let i = 0; i < inputs.endorsement.length; i++) {
            expect(endorsementArray[i].type).toEqual([
              "VerifiableCredential",
              "EndorsementCredential",
            ]);
            expect(synthesized.some((s) => s.path === `endorsement[${i}].type`)).toBe(true);
          }
        }

        // Verify the total number of synthesis records matches the total objects processed
        const expectedSynthesisCount =
          (inputs.result?.length ?? 0) +
          (inputs.alignment?.length ?? 0) +
          (inputs.related?.length ?? 0) +
          (inputs.endorsement?.length ?? 0);
        expect(synthesized.length).toBe(expectedSynthesisCount);
      }),
      { numRuns: 100 },
    );
  });

  it("objects that already have a type field are NOT overwritten and produce no synthesis record", () => {
    fc.assert(
      fc.property(
        fc.record({
          resultType: fc.array(fc.string({ minLength: 1 }), { minLength: 1, maxLength: 2 }),
          alignmentType: fc.array(fc.string({ minLength: 1 }), { minLength: 1, maxLength: 2 }),
          relatedType: fc.array(fc.string({ minLength: 1 }), { minLength: 1, maxLength: 2 }),
          endorsementType: fc.array(fc.string({ minLength: 1 }), { minLength: 1, maxLength: 2 }),
        }),
        (types) => {
          const credential = makeBaseCredential();
          const synthesized: SynthesisRecord[] = [];

          // Supply objects WITH existing type fields
          const input = makeBaseInput({
            result: [{ value: "test-result", type: types.resultType }],
            endorsement: [{ issuer: "urn:test", type: types.endorsementType }],
            achievement: {
              name: "Test Achievement",
              description: "A test achievement",
              criteria: { narrative: "Complete the test" },
              alignment: [{ targetName: "Standard A", type: types.alignmentType }],
              related: [{ id: "urn:related", type: types.relatedType }],
            },
          });

          applyRichTier(credential, input, synthesized);

          const credentialSubject = credential.credentialSubject as Record<string, unknown>;
          const achievement = credentialSubject.achievement as Record<string, unknown>;

          // None of the types should have been overwritten
          const resultArray = credentialSubject.result as Record<string, unknown>[];
          expect(resultArray[0].type).toEqual(types.resultType);

          const alignmentArray = achievement.alignment as Record<string, unknown>[];
          expect(alignmentArray[0].type).toEqual(types.alignmentType);

          const relatedArray = achievement.related as Record<string, unknown>[];
          expect(relatedArray[0].type).toEqual(types.relatedType);

          const endorsementArray = credential.endorsement as Record<string, unknown>[];
          expect(endorsementArray[0].type).toEqual(types.endorsementType);

          // No synthesis records should exist since all types were already present
          expect(synthesized.length).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 6: Unrecognized fields are warned, coded, and excluded
//
// For any builder input augmented with one or more keys the builder has no
// mapping rule for, the builder emits, for each such key, exactly one warning
// that names the key's path and carries the distinct unrecognized-field code,
// and the built credential does not contain that key.
//
// Feature: ob3-tooling-improvements, Property 6: Unrecognized fields are warned, coded, and excluded
// ---------------------------------------------------------------------------

/**
 * Arbitrary that generates unrecognized key names — keys that use only
 * alphanumeric characters with a unique prefix to guarantee they don't
 * collide with any recognized field and don't contain path-separator characters.
 *
 * The `_xtra_` prefix is what makes the guarantee hold: no recognized
 * top-level, issuer, achievement, recipient, or evidence field starts with it,
 * so no generated key can shadow a real one.
 */
const arbitraryUnrecognizedKey = fc
  .stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,10}$/)
  .map((s) => `_xtra_${s}`);

/** Arbitrary for unrecognized field values */
const arbitraryUnrecognizedValue = fc.oneof(
  fc.string({ minLength: 1, maxLength: 30 }),
  fc.integer({ min: -1000, max: 1000 }),
  fc.boolean(),
);

/**
 * Generates an array of unique-keyed tuples for injection at a single nesting level.
 */
const arbitraryUniqueKeyValuePairs = fc.uniqueArray(
  fc.tuple(arbitraryUnrecognizedKey, arbitraryUnrecognizedValue),
  { minLength: 0, maxLength: 3, selector: ([key]) => key },
);

/**
 * Arbitrary that produces a valid minimal raw input with one or more unrecognized
 * keys injected at various levels (top-level, issuer, achievement, recipient, evidence).
 *
 * Returns: { rawInput, unrecognizedPaths } where unrecognizedPaths lists the
 * dot-separated paths of all injected keys.
 */
const arbitraryInputWithUnrecognizedFields = fc
  .record({
    topLevelKeys: arbitraryUniqueKeyValuePairs,
    issuerKeys: arbitraryUniqueKeyValuePairs,
    achievementKeys: arbitraryUniqueKeyValuePairs,
    recipientKeys: arbitraryUniqueKeyValuePairs,
    evidenceKeys: arbitraryUniqueKeyValuePairs,
  })
  .filter(
    (r) =>
      r.topLevelKeys.length > 0 ||
      r.issuerKeys.length > 0 ||
      r.achievementKeys.length > 0 ||
      r.recipientKeys.length > 0 ||
      r.evidenceKeys.length > 0,
  )
  .map((r) => {
    // Build the base valid input
    const rawInput: Record<string, unknown> = {
      issuer: { name: "Test Issuer" } as Record<string, unknown>,
      achievement: {
        name: "Test Achievement",
        description: "A test achievement",
        criteria: { narrative: "Complete the test" },
      } as Record<string, unknown>,
      recipient: {} as Record<string, unknown>,
    };

    const unrecognizedPaths: string[] = [];

    // Inject top-level unrecognized keys
    for (const [key, value] of r.topLevelKeys) {
      rawInput[key] = value;
      unrecognizedPaths.push(key);
    }

    // Inject issuer-level unrecognized keys
    const issuerObj = rawInput.issuer as Record<string, unknown>;
    for (const [key, value] of r.issuerKeys) {
      issuerObj[key] = value;
      unrecognizedPaths.push(`issuer.${key}`);
    }

    // Inject achievement-level unrecognized keys
    const achievementObj = rawInput.achievement as Record<string, unknown>;
    for (const [key, value] of r.achievementKeys) {
      achievementObj[key] = value;
      unrecognizedPaths.push(`achievement.${key}`);
    }

    // Inject recipient-level unrecognized keys
    const recipientObj = rawInput.recipient as Record<string, unknown>;
    for (const [key, value] of r.recipientKeys) {
      recipientObj[key] = value;
      unrecognizedPaths.push(`recipient.${key}`);
    }

    // Inject evidence-level unrecognized keys (add an evidence entry)
    if (r.evidenceKeys.length > 0) {
      const evidenceEntry: Record<string, unknown> = { name: "Test Evidence" };
      for (const [key, value] of r.evidenceKeys) {
        evidenceEntry[key] = value;
        unrecognizedPaths.push(`evidence[0].${key}`);
      }
      rawInput.evidence = [evidenceEntry];
    }

    return { rawInput, unrecognizedPaths };
  });

/**
 * Recursively collects all keys from a nested object/array structure.
 */
function collectAllKeys(obj: unknown, keys = new Set<string>()): Set<string> {
  if (obj === null || obj === undefined || typeof obj !== "object") return keys;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      collectAllKeys(item, keys);
    }
  } else {
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      keys.add(key);
      collectAllKeys(value, keys);
    }
  }
  return keys;
}

describe("Feature: ob3-tooling-improvements, Property 6: Unrecognized fields are warned, coded, and excluded", () => {
  /**
   * **Validates: Requirements 3.1, 3.2, 3.3**
   *
   * For each unrecognized key in the input, detectUnrecognizedFields emits
   * exactly one warning that:
   *   - names the key's path in `param` (R3.1)
   *   - carries the WARNING_UNRECOGNIZED_FIELD code (R3.2)
   * And the built credential does NOT contain those unrecognized keys (R3.3).
   */
  it("each unrecognized field produces exactly one coded warning naming its path, and is excluded from the credential", async () => {
    await fc.assert(
      fc.asyncProperty(
        arbitraryInputWithUnrecognizedFields,
        async ({ rawInput, unrecognizedPaths }) => {
          // --- Part 1: detectUnrecognizedFields emits correct warnings ---
          const warnings = detectUnrecognizedFields(rawInput);

          // Each unrecognized path should have exactly one warning
          for (const path of unrecognizedPaths) {
            const matchingWarnings = warnings.filter((w) => w.param === path);
            expect(matchingWarnings.length).toBe(1);
            expect(matchingWarnings[0].code).toBe(WARNING_UNRECOGNIZED_FIELD);
          }

          // No extra warnings beyond the unrecognized paths we injected
          const unrecognizedWarnings = warnings.filter(
            (w) => w.code === WARNING_UNRECOGNIZED_FIELD,
          );
          expect(unrecognizedWarnings.length).toBe(unrecognizedPaths.length);

          // --- Part 2: Built credential excludes unrecognized keys ---
          // Build the credential using the builder (which only maps recognized fields)
          const result = await createAchievementCredential({
            issuer: { name: (rawInput.issuer as Record<string, unknown>).name as string },
            achievement: {
              name: (rawInput.achievement as Record<string, unknown>).name as string,
              description: (rawInput.achievement as Record<string, unknown>).description as string,
              criteria: (rawInput.achievement as Record<string, unknown>).criteria as {
                narrative: string;
              },
            },
            recipient: {},
            ...(rawInput.evidence
              ? {
                  evidence: (rawInput.evidence as Record<string, unknown>[]).map((e) => ({
                    name: e.name as string,
                  })),
                }
              : {}),
          });

          if (result.ok) {
            const cred = result.credential;
            // Collect all keys present in the credential at every level
            const allCredentialKeys = collectAllKeys(cred);

            // Each injected unrecognized key should not appear in the credential
            for (const path of unrecognizedPaths) {
              const keyName = path.includes(".") ? path.split(".").pop()! : path;
              // Strip array index notation from the key name if present
              const cleanKey = keyName.replace(/\[\d+\]/, "");
              expect(allCredentialKeys.has(cleanKey)).toBe(false);
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 7: No unrecognized warning for fully recognized input
//
// For any builder input drawn entirely from recognized fields, the builder
// emits no unrecognized-field warning.
//
// Feature: ob3-tooling-improvements, Property 7: No unrecognized warning for fully recognized input
// ---------------------------------------------------------------------------

describe("Feature: ob3-tooling-improvements, Property 7: No unrecognized warning for fully recognized input", () => {
  /**
   * **Validates: Requirements 3.4**
   *
   * Generates arbitrary inputs drawn ENTIRELY from recognized fields (varying
   * which recognized fields are present, with valid values for each) and asserts
   * that detectUnrecognizedFields emits zero unrecognized_field warnings.
   */

  /** Arbitrary for optional string values */
  const arbOptionalString = fc.option(fc.string({ minLength: 1, maxLength: 50 }), {
    nil: undefined,
  });

  /** Arbitrary for optional URL-like string values */
  const arbOptionalUrl = fc.option(fc.webUrl(), { nil: undefined });

  /** Arbitrary for an issuer object using only recognized issuer fields */
  const arbRecognizedIssuer = fc
    .record({
      id: arbOptionalUrl,
      name: fc.option(fc.string({ minLength: 1, maxLength: 40 }), { nil: undefined }),
      url: arbOptionalUrl,
      email: fc.option(fc.emailAddress(), { nil: undefined }),
      description: arbOptionalString,
      image: arbOptionalUrl,
    })
    .map((obj) => {
      // Remove undefined keys so input is clean
      const cleaned: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(obj)) {
        if (v !== undefined) cleaned[k] = v;
      }
      // Must have at least one field
      if (Object.keys(cleaned).length === 0) cleaned.name = "Default Issuer";
      return cleaned;
    });

  /** Arbitrary for criteria (recognized sub-fields: narrative, id) */
  const arbCriteria = fc
    .record({
      narrative: arbOptionalString,
      id: arbOptionalUrl,
    })
    .map((obj) => {
      const cleaned: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(obj)) {
        if (v !== undefined) cleaned[k] = v;
      }
      if (Object.keys(cleaned).length === 0) cleaned.narrative = "Complete a task";
      return cleaned;
    });

  /** Arbitrary for tag arrays (array of primitives, recognized) */
  const arbTagArray = fc.array(fc.string({ minLength: 1, maxLength: 20 }), {
    minLength: 1,
    maxLength: 4,
  });

  /** Arbitrary for pass-through objects (any structure is recognized under pass-through paths) */
  const arbPassThroughObject = fc.dictionary(
    fc.string({ minLength: 1, maxLength: 15 }).filter((s) => /^[a-zA-Z]/.test(s)),
    fc.oneof(fc.string(), fc.integer(), fc.boolean()),
    { minKeys: 0, maxKeys: 4 },
  );

  /** Arbitrary for achievement object using only recognized achievement fields */
  const arbRecognizedAchievement = fc
    .record({
      id: arbOptionalUrl,
      name: fc.string({ minLength: 1, maxLength: 40 }),
      description: fc.string({ minLength: 1, maxLength: 100 }),
      criteria: arbCriteria,
      achievementType: arbOptionalString,
      image: arbOptionalUrl,
      tag: fc.option(arbTagArray, { nil: undefined }),
      alignment: fc.option(fc.array(arbPassThroughObject, { minLength: 1, maxLength: 3 }), {
        nil: undefined,
      }),
      related: fc.option(fc.array(arbPassThroughObject, { minLength: 1, maxLength: 3 }), {
        nil: undefined,
      }),
    })
    .map((obj) => {
      const cleaned: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(obj)) {
        if (v !== undefined) cleaned[k] = v;
      }
      return cleaned;
    });

  /** Arbitrary for recipient identifier (recognized sub-fields: identityType, identityHash, hashed, salt) */
  const arbIdentifier = fc
    .record({
      identityType: fc.option(fc.constantFrom("emailAddress", "telephoneNumber", "url"), {
        nil: undefined,
      }),
      identityHash: arbOptionalString,
      hashed: fc.option(fc.boolean(), { nil: undefined }),
      salt: arbOptionalString,
    })
    .map((obj) => {
      const cleaned: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(obj)) {
        if (v !== undefined) cleaned[k] = v;
      }
      return Object.keys(cleaned).length > 0 ? cleaned : undefined;
    });

  /** Arbitrary for recipient object using only recognized fields */
  const arbRecognizedRecipient = fc
    .record({
      id: arbOptionalUrl,
      identifier: arbIdentifier,
    })
    .map((obj) => {
      const cleaned: Record<string, unknown> = {};
      if (obj.id !== undefined) cleaned.id = obj.id;
      if (obj.identifier !== undefined) cleaned.identifier = obj.identifier;
      return cleaned;
    });

  /** Arbitrary for evidence array entries (recognized fields: id, name, description, narrative, genre) */
  const arbEvidenceEntry = fc
    .record({
      id: arbOptionalUrl,
      name: arbOptionalString,
      description: arbOptionalString,
      narrative: arbOptionalString,
      genre: arbOptionalString,
    })
    .map((obj) => {
      const cleaned: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(obj)) {
        if (v !== undefined) cleaned[k] = v;
      }
      if (Object.keys(cleaned).length === 0) cleaned.name = "Evidence";
      return cleaned;
    });

  /** Arbitrary for image (can be string or object with {id, caption}) */
  const arbImage = fc.oneof(
    fc.webUrl(),
    fc
      .record({
        id: arbOptionalUrl,
        caption: arbOptionalString,
      })
      .map((obj) => {
        const cleaned: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(obj)) {
          if (v !== undefined) cleaned[k] = v;
        }
        if (Object.keys(cleaned).length === 0) cleaned.id = "https://example.com/img.png";
        return cleaned;
      }),
  );

  /** Arbitrary for the full recognized input — picks a random subset of recognized fields */
  const arbFullyRecognizedInput = fc
    .record({
      // Required recognized fields
      issuer: arbRecognizedIssuer,
      achievement: arbRecognizedAchievement,
      recipient: arbRecognizedRecipient,
      // Optional recognized top-level fields
      id: arbOptionalUrl,
      awardedDate: fc.option(
        fc
          .integer({ min: 1577836800000, max: 1893456000000 })
          .map((ts) => new Date(ts).toISOString()),
        { nil: undefined },
      ),
      validFrom: fc.option(
        fc
          .integer({ min: 1577836800000, max: 1893456000000 })
          .map((ts) => new Date(ts).toISOString()),
        { nil: undefined },
      ),
      validUntil: fc.option(
        fc
          .integer({ min: 1577836800000, max: 1893456000000 })
          .map((ts) => new Date(ts).toISOString()),
        { nil: undefined },
      ),
      evidence: fc.option(fc.array(arbEvidenceEntry, { minLength: 1, maxLength: 3 }), {
        nil: undefined,
      }),
      image: fc.option(arbImage, { nil: undefined }),
      // Rich-tier pass-through fields (entire sub-tree is recognized)
      result: fc.option(fc.array(arbPassThroughObject, { minLength: 1, maxLength: 3 }), {
        nil: undefined,
      }),
      source: fc.option(arbPassThroughObject, { nil: undefined }),
      proof: fc.option(arbPassThroughObject, { nil: undefined }),
      credentialStatus: fc.option(arbPassThroughObject, { nil: undefined }),
      endorsement: fc.option(fc.array(arbPassThroughObject, { minLength: 1, maxLength: 2 }), {
        nil: undefined,
      }),
      termsOfUse: fc.option(arbPassThroughObject, { nil: undefined }),
      refreshService: fc.option(arbPassThroughObject, { nil: undefined }),
      credentialSchema: fc.option(arbPassThroughObject, { nil: undefined }),
    })
    .map((obj) => {
      // Build raw input, removing undefined optional fields
      const rawInput: Record<string, unknown> = {
        issuer: obj.issuer,
        achievement: obj.achievement,
        recipient: obj.recipient,
      };
      if (obj.id !== undefined) rawInput.id = obj.id;
      if (obj.awardedDate !== undefined) rawInput.awardedDate = obj.awardedDate;
      if (obj.validFrom !== undefined) rawInput.validFrom = obj.validFrom;
      if (obj.validUntil !== undefined) rawInput.validUntil = obj.validUntil;
      if (obj.evidence !== undefined) rawInput.evidence = obj.evidence;
      if (obj.image !== undefined) rawInput.image = obj.image;
      if (obj.result !== undefined) rawInput.result = obj.result;
      if (obj.source !== undefined) rawInput.source = obj.source;
      if (obj.proof !== undefined) rawInput.proof = obj.proof;
      if (obj.credentialStatus !== undefined) rawInput.credentialStatus = obj.credentialStatus;
      if (obj.endorsement !== undefined) rawInput.endorsement = obj.endorsement;
      if (obj.termsOfUse !== undefined) rawInput.termsOfUse = obj.termsOfUse;
      if (obj.refreshService !== undefined) rawInput.refreshService = obj.refreshService;
      if (obj.credentialSchema !== undefined) rawInput.credentialSchema = obj.credentialSchema;
      return rawInput;
    });

  it("emits zero unrecognized_field warnings when all input fields are recognized", () => {
    fc.assert(
      fc.property(arbFullyRecognizedInput, (rawInput) => {
        const warnings = detectUnrecognizedFields(rawInput);
        const unrecognizedWarnings = warnings.filter((w) => w.code === WARNING_UNRECOGNIZED_FIELD);
        expect(unrecognizedWarnings).toHaveLength(0);
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 4: validUntil is normalized to ISO-8601 UTC
//
// For any parseable `validUntil` input value, the built credential's top-level
// `validUntil` is an ISO-8601 UTC string denoting the same instant.
//
// Feature: ob3-tooling-improvements, Property 4: validUntil is normalized to ISO-8601 UTC
// ---------------------------------------------------------------------------

describe("Feature: ob3-tooling-improvements, Property 4: validUntil is normalized to ISO-8601 UTC", () => {
  /**
   * **Validates: Requirements 2.7**
   */

  /**
   * Arbitrary that generates date strings in various formats:
   * - ISO with timezone offset (e.g. "2024-06-15T10:30:00+05:30")
   * - Date-only (e.g. "2024-06-15")
   * - UTC (e.g. "2024-06-15T10:30:00Z")
   */
  const arbitraryDateString = fc.oneof(
    // ISO-8601 UTC format
    fc
      .record({
        year: fc.integer({ min: 2000, max: 2099 }),
        month: fc.integer({ min: 1, max: 12 }),
        day: fc.integer({ min: 1, max: 28 }),
        hour: fc.integer({ min: 0, max: 23 }),
        minute: fc.integer({ min: 0, max: 59 }),
        second: fc.integer({ min: 0, max: 59 }),
      })
      .map(
        ({ year, month, day, hour, minute, second }) =>
          `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}Z`,
      ),
    // Date-only format
    fc
      .record({
        year: fc.integer({ min: 2000, max: 2099 }),
        month: fc.integer({ min: 1, max: 12 }),
        day: fc.integer({ min: 1, max: 28 }),
      })
      .map(
        ({ year, month, day }) =>
          `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      ),
    // ISO with positive timezone offset
    fc
      .record({
        year: fc.integer({ min: 2000, max: 2099 }),
        month: fc.integer({ min: 1, max: 12 }),
        day: fc.integer({ min: 1, max: 28 }),
        hour: fc.integer({ min: 0, max: 23 }),
        minute: fc.integer({ min: 0, max: 59 }),
        second: fc.integer({ min: 0, max: 59 }),
        offsetHour: fc.integer({ min: 0, max: 12 }),
        offsetMinute: fc.constantFrom(0, 30, 45),
      })
      .map(
        ({ year, month, day, hour, minute, second, offsetHour, offsetMinute }) =>
          `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}+${String(offsetHour).padStart(2, "0")}:${String(offsetMinute).padStart(2, "0")}`,
      ),
    // ISO with negative timezone offset
    fc
      .record({
        year: fc.integer({ min: 2000, max: 2099 }),
        month: fc.integer({ min: 1, max: 12 }),
        day: fc.integer({ min: 1, max: 28 }),
        hour: fc.integer({ min: 0, max: 23 }),
        minute: fc.integer({ min: 0, max: 59 }),
        second: fc.integer({ min: 0, max: 59 }),
        offsetHour: fc.integer({ min: 1, max: 12 }),
        offsetMinute: fc.constantFrom(0, 30, 45),
      })
      .map(
        ({ year, month, day, hour, minute, second, offsetHour, offsetMinute }) =>
          `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}-${String(offsetHour).padStart(2, "0")}:${String(offsetMinute).padStart(2, "0")}`,
      ),
  );

  it("validUntil is always normalized to an ISO-8601 UTC string representing the same instant", () => {
    fc.assert(
      fc.property(arbitraryDateString, (dateInput) => {
        const credential = makeBaseCredential();
        const synthesized: SynthesisRecord[] = [];

        const input = makeBaseInput({ validUntil: dateInput });

        applyRichTier(credential, input, synthesized);

        const normalizedValue = credential.validUntil as string;

        // The output must be defined
        expect(normalizedValue).toBeDefined();

        // The output must end with 'Z' (UTC)
        expect(normalizedValue).toMatch(/Z$/);

        // The output must be a valid ISO-8601 date (parseable by Date)
        const parsedOutput = new Date(normalizedValue);
        expect(Number.isNaN(parsedOutput.getTime())).toBe(false);

        // The output must represent the same instant as the original input
        const parsedInput = /^\d{4}-\d{2}-\d{2}$/.test(dateInput)
          ? new Date(`${dateInput}T00:00:00Z`)
          : new Date(dateInput);

        expect(parsedOutput.getTime()).toBe(parsedInput.getTime());
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 5: validUntil earlier than validFrom emits a warning
//
// For any input whose normalized `validUntil` is earlier than its normalized
// `validFrom`, the builder emits a warning that names the `validUntil` field.
//
// Feature: ob3-tooling-improvements, Property 5: validUntil earlier than validFrom emits a warning
// ---------------------------------------------------------------------------

describe("Feature: ob3-tooling-improvements, Property 5: validUntil earlier than validFrom emits a warning", () => {
  /**
   * **Validates: Requirements 2.8**
   */

  /**
   * Arbitrary that generates date pairs where validUntil is strictly before validFrom.
   * We generate a base timestamp and then ensure validUntil is earlier by subtracting.
   */
  const arbitraryDatePairWithUntilBeforeFrom = fc
    .record({
      // validFrom: some date in a reasonable range
      fromYear: fc.integer({ min: 2020, max: 2060 }),
      fromMonth: fc.integer({ min: 1, max: 12 }),
      fromDay: fc.integer({ min: 1, max: 28 }),
      fromHour: fc.integer({ min: 0, max: 23 }),
      fromMinute: fc.integer({ min: 0, max: 59 }),
      fromSecond: fc.integer({ min: 0, max: 59 }),
      // offset in seconds to subtract from validFrom to get validUntil (always > 0)
      offsetSeconds: fc.integer({ min: 1, max: 365 * 24 * 3600 }),
    })
    .map(({ fromYear, fromMonth, fromDay, fromHour, fromMinute, fromSecond, offsetSeconds }) => {
      const validFrom = `${fromYear}-${String(fromMonth).padStart(2, "0")}-${String(fromDay).padStart(2, "0")}T${String(fromHour).padStart(2, "0")}:${String(fromMinute).padStart(2, "0")}:${String(fromSecond).padStart(2, "0")}Z`;

      // Compute validUntil by subtracting offsetSeconds from validFrom
      const fromMs = new Date(validFrom).getTime();
      const untilMs = fromMs - offsetSeconds * 1000;
      const validUntil = new Date(untilMs).toISOString().replace(/\.000Z$/, "Z");

      return { validUntil, validFrom };
    });

  it("emits a warning with code valid_until_before_valid_from when validUntil precedes validFrom", () => {
    fc.assert(
      fc.property(arbitraryDatePairWithUntilBeforeFrom, ({ validUntil, validFrom }) => {
        const warnings = checkValidUntilCoherency(validUntil, validFrom);

        // Must emit exactly one warning
        expect(warnings.length).toBe(1);

        // The warning code must be valid_until_before_valid_from
        expect(warnings[0].code).toBe("valid_until_before_valid_from");

        // The warning must name validUntil in its param
        expect(warnings[0].param).toBe("validUntil");
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 3: Every successful output passes schema and JSON-LD validation
//
// For any builder input that yields a successful result, re-running the
// Schema_Check and the JsonLd_Check over the returned credential produces
// no errors.
//
// Feature: ob3-tooling-improvements, Property 3: Every successful output passes schema and JSON-LD validation
// ---------------------------------------------------------------------------

describe("Feature: ob3-tooling-improvements, Property 3: Every successful output passes schema and JSON-LD validation", () => {
  /**
   * **Validates: Requirements 1.6**
   */

  // --- Arbitraries for generating valid builder inputs ---

  /** Arbitrary for optional string values */
  const arbOptStr = fc.option(fc.string({ minLength: 1, maxLength: 30 }), { nil: undefined });

  /** Arbitrary for optional URL strings */
  const arbOptUrl = fc.option(fc.webUrl(), { nil: undefined });

  /** Arbitrary for valid date strings in ISO-8601 UTC */
  const arbDateString = fc
    .record({
      year: fc.integer({ min: 2020, max: 2060 }),
      month: fc.integer({ min: 1, max: 12 }),
      day: fc.integer({ min: 1, max: 28 }),
      hour: fc.integer({ min: 0, max: 23 }),
      minute: fc.integer({ min: 0, max: 59 }),
      second: fc.integer({ min: 0, max: 59 }),
    })
    .map(
      ({ year, month, day, hour, minute, second }) =>
        `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}Z`,
    );

  /** Arbitrary for a future date (always after 2050 to be after validFrom) */
  const arbFutureDateString = fc
    .record({
      year: fc.integer({ min: 2061, max: 2099 }),
      month: fc.integer({ min: 1, max: 12 }),
      day: fc.integer({ min: 1, max: 28 }),
      hour: fc.integer({ min: 0, max: 23 }),
      minute: fc.integer({ min: 0, max: 59 }),
      second: fc.integer({ min: 0, max: 59 }),
    })
    .map(
      ({ year, month, day, hour, minute, second }) =>
        `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}Z`,
    );

  /**
   * Generates a valid CreateAchievementCredentialInputT with various optional
   * fields randomly present or absent. The inputs are structured to produce
   * valid OB3 credentials that pass schema and JSON-LD validation.
   */
  const arbitraryValidBuilderInput = fc
    .record({
      // Issuer (required fields)
      issuerName: fc.string({ minLength: 1, maxLength: 40 }),
      issuerUrl: arbOptUrl,
      issuerEmail: fc.option(fc.emailAddress(), { nil: undefined }),
      issuerId: arbOptUrl,
      // Achievement (required fields)
      achievementName: fc.string({ minLength: 1, maxLength: 60 }),
      achievementDescription: fc.string({ minLength: 1, maxLength: 100 }),
      achievementType: arbOptStr,
      // Recipient
      recipientId: arbOptUrl,
      // Dates
      validFrom: fc.option(arbDateString, { nil: undefined }),
      validUntil: fc.option(arbFutureDateString, { nil: undefined }),
      awardedDate: fc.option(arbDateString, { nil: undefined }),
      // Evidence
      hasEvidence: fc.boolean(),
      evidenceName: fc.option(fc.string({ minLength: 1, maxLength: 30 }), { nil: undefined }),
      // Rich-tier subject-level: result (array of objects with required type)
      hasResult: fc.boolean(),
      // Rich-tier achievement-level: alignment, related
      hasAlignment: fc.boolean(),
      hasRelated: fc.boolean(),
    })
    .map((params) => {
      const input: Record<string, unknown> = {
        issuer: {
          name: params.issuerName,
          ...(params.issuerUrl ? { url: params.issuerUrl } : {}),
          ...(params.issuerEmail ? { email: params.issuerEmail } : {}),
          ...(params.issuerId ? { id: params.issuerId } : {}),
        },
        achievement: {
          name: params.achievementName,
          description: params.achievementDescription,
          criteria: { narrative: "Complete the required tasks" },
          ...(params.achievementType ? { achievementType: params.achievementType } : {}),
          ...(params.hasAlignment
            ? { alignment: [{ targetName: "Standard 1", targetUrl: "https://example.com/std" }] }
            : {}),
          ...(params.hasRelated
            ? { related: [{ id: "urn:uuid:00000000-0000-0000-0000-000000000001" }] }
            : {}),
        },
        recipient: {
          ...(params.recipientId ? { id: params.recipientId } : {}),
        },
        ...(params.validFrom ? { validFrom: params.validFrom } : {}),
        ...(params.validUntil ? { validUntil: params.validUntil } : {}),
        ...(params.awardedDate ? { awardedDate: params.awardedDate } : {}),
      };

      if (params.hasEvidence) {
        input.evidence = [
          {
            name: params.evidenceName ?? "Test Evidence",
          },
        ];
      }

      if (params.hasResult) {
        input.result = [{ type: ["Result"], value: "Pass" }];
      }

      return input as unknown as CreateAchievementCredentialInputT;
    });

  it("re-running validateSchema and validateJsonLd on a successful credential produces no errors", async () => {
    await fc.assert(
      fc.asyncProperty(arbitraryValidBuilderInput, async (input) => {
        // Call the builder
        const result = await createAchievementCredential(input);

        // Only test successful outputs — pre-condition filter
        fc.pre(result.ok === true);

        if (!result.ok) return; // TypeScript narrowing

        const credential = result.credential;

        // Re-run Schema_Check
        const schemaErrors = validateSchema(credential);
        const hardSchemaErrors = schemaErrors.filter((e) => e.severity === "error");
        expect(hardSchemaErrors).toHaveLength(0);

        // Re-run JsonLd_Check
        const { errors: jsonldErrors } = await validateJsonLd(credential);
        const hardJsonldErrors = jsonldErrors.filter((e) => e.severity === "error");
        expect(hardJsonldErrors).toHaveLength(0);
      }),
      { numRuns: 100 },
    );
  }, 60_000);
});

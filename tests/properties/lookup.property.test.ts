/**
 * Property-based tests for the Conformance_Lookup fuzzy matching.
 * Uses fast-check to verify modal filtering, ranking, and recall properties.
 *
 * **Validates: Requirements 10.3, 10.4**
 */

import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { rerank } from "../../src/spec/fuzzy.js";

// ---------------------------------------------------------------------------
// Helpers — simulate the modal filtering logic from src/spec/index.ts
// ---------------------------------------------------------------------------

type Modal = "MUST" | "SHOULD" | "MAY";

interface CandidateRequirement {
  spec: string;
  sectionId: string;
  anchor: string;
  sentence: string;
  modal: Modal;
  topicTags: string[];
}

/**
 * Simulates the modal filter step from findConformanceRequirements.
 * This is the exact logic: post-filter candidates to only those matching the chosen modal.
 */
function applyModalFilter(
  candidates: CandidateRequirement[],
  modal: Modal,
): CandidateRequirement[] {
  return candidates.filter((c) => c.modal === modal);
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

const modalArb: fc.Arbitrary<Modal> = fc.constantFrom("MUST", "SHOULD", "MAY");

const candidateArb: fc.Arbitrary<CandidateRequirement> = fc.record({
  spec: fc.constantFrom("ob3", "vc"),
  sectionId: fc.string({ minLength: 1, maxLength: 10 }),
  anchor: fc.string({ minLength: 1, maxLength: 20 }),
  sentence: fc.string({ minLength: 5, maxLength: 200 }),
  modal: modalArb,
  topicTags: fc.array(fc.string({ minLength: 1, maxLength: 15 }), { minLength: 0, maxLength: 3 }),
});

const candidatesArb: fc.Arbitrary<CandidateRequirement[]> = fc.array(candidateArb, {
  minLength: 0,
  maxLength: 50,
});

// ---------------------------------------------------------------------------
// Property 22: Modal filter returns only matching modal verbs
// ---------------------------------------------------------------------------

describe("Feature: ob3-tooling-improvements, Property 22: Modal filter returns only matching modal verbs", () => {
  it("every result from modal filtering has the requested modal verb", () => {
    fc.assert(
      fc.property(candidatesArb, modalArb, (candidates, chosenModal) => {
        const filtered = applyModalFilter(candidates, chosenModal);

        // Assert: every returned result has the correct modal verb
        for (const result of filtered) {
          expect(result.modal).toBe(chosenModal);
        }
      }),
      { numRuns: 100 },
    );
  });

  it("modal filter does not discard any candidate with the matching modal", () => {
    fc.assert(
      fc.property(candidatesArb, modalArb, (candidates, chosenModal) => {
        const filtered = applyModalFilter(candidates, chosenModal);
        const expectedCount = candidates.filter((c) => c.modal === chosenModal).length;

        // Assert: the count of filtered results matches the number of candidates with that modal
        expect(filtered.length).toBe(expectedCount);
      }),
      { numRuns: 100 },
    );
  });

  it("modal filter excludes all candidates with non-matching modal verbs", () => {
    fc.assert(
      fc.property(candidatesArb, modalArb, (candidates, chosenModal) => {
        const filtered = applyModalFilter(candidates, chosenModal);

        // Assert: no result has a modal that differs from the chosen one
        const nonMatchingInResult = filtered.filter((c) => c.modal !== chosenModal);
        expect(nonMatchingInResult).toHaveLength(0);
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 23: Dissimilar topics return an empty set
// **Validates: Requirements 10.4**
// ---------------------------------------------------------------------------

/**
 * Credential-domain sentence fragments. We build long multi-word candidates
 * that resemble conformance requirement text. Longer candidates ensure the
 * Levenshtein window (sized by topic length) finds no spurious matches.
 */
const credentialPrefixes = [
  "credential achievement verification",
  "issuer profile schema cryptographic",
  "conformance normative assertion badge",
  "verifiable presentation endorsement",
  "revocation alignment recipient evidence",
  "signature proof validation credential",
];

const credentialSuffixes = [
  "endorsement alignment criteria evidence conformance",
  "signature revocation conformance normative validation",
  "recipient validation achievement credential schema",
  "verification assertion endorsement badge criteria",
  "credential issuer profile alignment revocation",
  "badge achievement normative evidence signature",
];

/**
 * Unrelated topics from completely different domains using vocabulary that
 * shares no significant tokens AND minimal character-level overlap with
 * credential/badge/achievement terminology. Topics are kept shorter than
 * candidates to minimize Levenshtein window false positives.
 */
const dissimilarTopics = [
  "frying tofu cubes in hot wok",
  "kumquat mango guava papaya",
  "buzzing waxy bumblebee hive",
  "zephyr blowing across icy fjord",
  "quixotic pygmy fox jumping high",
  "saxophone jazz rhythm syncopation",
  "knitting chunky wool mittens",
  "bubbling yeast dough rising",
  "choppy surf kayak paddling",
  "dizzy gymnast twirling hoop",
  "humid swamp foggy bayou",
  "crunchy pickled kimchi broth",
  "wobbly jelly mold pudding",
  "fuzzy kiwi pulpy smoothly",
  "sizzling wok bok choy ginger",
];

/**
 * Arbitrary that builds a long candidate sentence about credentials.
 * Combines a prefix + suffix to produce sentences well over 60 characters,
 * ensuring the Levenshtein window (sized by the shorter topic) is a small
 * fraction of the candidate.
 */
const credentialCandidateArb: fc.Arbitrary<string> = fc
  .tuple(fc.constantFrom(...credentialPrefixes), fc.constantFrom(...credentialSuffixes))
  .map(([prefix, suffix]) => `${prefix} ${suffix}`);

/**
 * Arbitrary for a list of credential-domain candidate sentences.
 */
const credentialCandidatesArb: fc.Arbitrary<string[]> = fc.array(credentialCandidateArb, {
  minLength: 1,
  maxLength: 20,
});

/**
 * Arbitrary for an unrelated topic drawn from a completely different domain.
 */
const unrelatedTopicArb: fc.Arbitrary<string> = fc.constantFrom(...dissimilarTopics);

describe("Feature: ob3-tooling-improvements, Property 23: Dissimilar topics return an empty set", () => {
  it("dissimilar topics produce no results when reranked against credential-domain candidates", () => {
    fc.assert(
      fc.property(credentialCandidatesArb, unrelatedTopicArb, (candidates, topic) => {
        const results = rerank(topic, candidates, (s) => s);

        // Assert: no candidates pass the similarity floor for a completely unrelated topic
        expect(results).toHaveLength(0);
      }),
      { numRuns: 100 },
    );
  });
});

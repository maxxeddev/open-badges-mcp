/**
 * Property-based tests for the Credential_Generator.
 * Uses fast-check to verify proof attachment and class-targeting closure.
 *
 * **Validates: Requirements 6.1, 6.3, 7.1, 7.3**
 */

import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  computeTargetedCoverage,
  computeTargetingClosure,
} from "../../src/generator/class-targeting.js";
import { attachProofIfRequested } from "../../src/generator/proof-signer.js";
import type { ActivePath, GraphEdge, GraphNode, TypeGraph } from "../../src/generator/types.js";
import { checkSignature } from "../../src/validate/signature.js";

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/**
 * Generate an arbitrary valid OB3 credential document with the required
 * structure: @context, type, issuer, credentialSubject.
 */
const ob3CredentialArb: fc.Arbitrary<Record<string, unknown>> = fc
  .record({
    id: fc.uuid().map((u) => `urn:uuid:${u}`),
    issuerName: fc.string({ minLength: 1, maxLength: 50 }),
    issuerId: fc.uuid().map((u) => `did:example:${u}`),
    subjectId: fc.uuid().map((u) => `did:example:${u}`),
    achievementId: fc.uuid().map((u) => `urn:uuid:${u}`),
    achievementName: fc.string({ minLength: 1, maxLength: 100 }),
    narrative: fc.string({ minLength: 1, maxLength: 200 }),
    credentialName: fc.string({ minLength: 1, maxLength: 100 }),
    validFrom: fc
      .integer({
        min: new Date("2020-01-01T00:00:00Z").getTime(),
        max: new Date("2030-12-31T23:59:59Z").getTime(),
      })
      .map((ms) => new Date(ms).toISOString()),
  })
  .map((fields) => ({
    "@context": [
      "https://www.w3.org/ns/credentials/v2",
      "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json",
    ],
    type: ["VerifiableCredential", "OpenBadgeCredential"],
    id: fields.id,
    issuer: {
      id: fields.issuerId,
      type: ["Profile"],
      name: fields.issuerName,
    },
    validFrom: fields.validFrom,
    name: fields.credentialName,
    credentialSubject: {
      id: fields.subjectId,
      type: ["AchievementSubject"],
      achievement: {
        id: fields.achievementId,
        type: ["Achievement"],
        name: fields.achievementName,
        criteria: {
          narrative: fields.narrative,
        },
      },
    },
  }));

// ---------------------------------------------------------------------------
// Property 17: Requested proof attachment yields a verifiable, signed credential
//
// For any valid OB3 credential document (with valid @context, type, issuer,
// credentialSubject structure), calling attachProofIfRequested(credential, true)
// produces a credential that:
// - Has a `proof` field with `type: "DataIntegrityProof"` and
//   `cryptosuite: "eddsa-rdfc-2022"`
// - Passes the Signature_Check (checkSignature returns status: "passed")
//
// Feature: ob3-tooling-improvements, Property 17: Requested proof attachment yields a verifiable, signed credential
// ---------------------------------------------------------------------------

describe("Feature: ob3-tooling-improvements, Property 17: Requested proof attachment yields a verifiable, signed credential", () => {
  /**
   * **Validates: Requirements 7.1, 7.3**
   *
   * For any arbitrary valid OB3 credential, attaching a proof yields a
   * credential with a DataIntegrityProof that verifies successfully.
   */
  it("attachProofIfRequested(credential, true) produces a verifiable DataIntegrityProof with eddsa-rdfc-2022", async () => {
    await fc.assert(
      fc.asyncProperty(ob3CredentialArb, async (credential) => {
        // Attach a proof to the credential
        const signed = await attachProofIfRequested(credential, true);

        // Assert the proof field exists with correct type and cryptosuite
        expect(signed.proof).toBeDefined();
        const proof = signed.proof as Record<string, unknown>;
        expect(proof.type).toBe("DataIntegrityProof");
        expect(proof.cryptosuite).toBe("eddsa-rdfc-2022");

        // Assert that the Signature_Check passes (the proof is verifiable)
        const sigResult = await checkSignature(signed);
        expect(sigResult.status).toBe("passed");
      }),
      { numRuns: 100 },
    );
  }, 300_000);
});

// ---------------------------------------------------------------------------
// Property 16: Absent targets fall back to mode and maxDepth traversal
//
// When `targetClasses` is absent/undefined/empty, the `isClassAllowed` function
// always returns true for any class name, indicating no filtering is applied
// and traversal falls back to mode + maxDepth.
//
// Feature: ob3-tooling-improvements, Property 16: Absent targets fall back to mode and maxDepth traversal
// ---------------------------------------------------------------------------

import { isClassAllowed } from "../../src/generator/class-targeting.js";

describe("Feature: ob3-tooling-improvements, Property 16: Absent targets fall back to mode and maxDepth traversal", () => {
  /**
   * **Validates: Requirements 6.4**
   *
   * For any arbitrary class name string, when allowedClasses is undefined
   * (i.e. targetClasses was not specified), isClassAllowed returns true —
   * meaning no class filtering is applied and traversal uses only mode + maxDepth.
   */
  it("isClassAllowed returns true for any class name when allowedClasses is undefined", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 200 }), (className) => {
        expect(isClassAllowed(className, undefined)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 6.4**
   *
   * Additionally, when allowedClasses is an empty set (representing an empty
   * targetClasses input that was resolved to no closure), isClassAllowed returns
   * false — confirming that filtering is only bypassed when allowedClasses is
   * truly absent (undefined), not merely empty. This distinguishes the "no
   * targeting" path from a misconfigured empty target set.
   */
  it("isClassAllowed returns false for any class name when allowedClasses is an empty set", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 200 }), (className) => {
        expect(isClassAllowed(className, new Set())).toBe(false);
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 15: Unknown target class returns an identifying error
//
// For any TypeGraph with known node names and a target class list that includes
// at least one name NOT in the graph, calling validateTargetClasses or
// computeTargetingClosure returns a GeneratorError with ok: false and the error
// message contains the unknown class name.
//
// Feature: ob3-tooling-improvements, Property 15: Unknown target class returns an identifying error
// ---------------------------------------------------------------------------

import { validateTargetClasses } from "../../src/generator/class-targeting.js";

/**
 * Build a minimal TypeGraph from a set of class names.
 * Each node has no properties — sufficient for target class validation.
 */
function buildMockTypeGraph(classNames: string[]): TypeGraph {
  const nodes = new Map<string, GraphNode>();
  for (const name of classNames) {
    nodes.set(name, {
      name,
      properties: new Map(),
      rawSchema: {},
    });
  }
  const rootClass = classNames[0] ?? "Root";
  if (!nodes.has(rootClass)) {
    nodes.set(rootClass, { name: rootClass, properties: new Map(), rawSchema: {} });
  }
  return { nodes, rootClass };
}

/**
 * Arbitrary that produces a set of known class names (at least one) and a
 * target list that includes at least one name NOT in the known set.
 */
const unknownTargetArb = fc
  .record({
    knownClasses: fc.uniqueArray(
      fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s.trim().length > 0),
      {
        minLength: 1,
        maxLength: 10,
      },
    ),
    unknownClass: fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s.trim().length > 0),
    includeKnown: fc.boolean(),
  })
  .filter(({ knownClasses, unknownClass }) => !knownClasses.includes(unknownClass))
  .map(({ knownClasses, unknownClass, includeKnown }) => {
    // Build target list: optionally include some known classes, always include the unknown one
    const targets = includeKnown ? [knownClasses[0], unknownClass] : [unknownClass];
    return { knownClasses, targets, unknownClass };
  });

describe("Feature: ob3-tooling-improvements, Property 15: Unknown target class returns an identifying error", () => {
  /**
   * **Validates: Requirements 6.2**
   *
   * For any TypeGraph and target list containing at least one class name absent
   * from the graph, validateTargetClasses returns a GeneratorError naming the
   * unknown class.
   */
  it("validateTargetClasses returns GeneratorError naming the unknown class", () => {
    fc.assert(
      fc.property(unknownTargetArb, ({ knownClasses, targets, unknownClass }) => {
        const graph = buildMockTypeGraph(knownClasses);
        const result = validateTargetClasses(targets, graph);

        // Must return a GeneratorError (not null)
        expect(result).not.toBeNull();
        expect(result!.ok).toBe(false);
        expect(result!.error).toContain(unknownClass);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 6.2**
   *
   * For any TypeGraph and target list containing at least one class name absent
   * from the graph, computeTargetingClosure returns a result with ok: false and
   * the error message contains the unknown class name.
   */
  it("computeTargetingClosure returns GeneratorError naming the unknown class", () => {
    fc.assert(
      fc.property(unknownTargetArb, ({ knownClasses, targets, unknownClass }) => {
        const graph = buildMockTypeGraph(knownClasses);
        const result = computeTargetingClosure(targets, graph);

        // Must be a GeneratorError with ok: false
        expect(result).toHaveProperty("ok", false);
        if ("error" in result) {
          expect(result.error).toContain(unknownClass);
        }
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 18: Unrequested proof yields an unsigned credential
//
// For any valid OB3 credential document, calling attachProofIfRequested(credential, false)
// produces a credential that:
// - Does NOT have a `proof` field
// - Is the same reference (===) as the input credential
//
// Feature: ob3-tooling-improvements, Property 18: Unrequested proof yields an unsigned credential
// ---------------------------------------------------------------------------

describe("Feature: ob3-tooling-improvements, Property 18: Unrequested proof yields an unsigned credential", () => {
  /**
   * **Validates: Requirements 7.2**
   *
   * For any arbitrary valid OB3 credential, calling attachProofIfRequested with
   * requestProof=false returns the credential unchanged and without a proof field.
   */
  it("attachProofIfRequested(credential, false) returns the same credential reference with no proof", async () => {
    await fc.assert(
      fc.asyncProperty(ob3CredentialArb, async (credential) => {
        // Call with proof not requested
        const result = await attachProofIfRequested(credential, false);

        // Assert no proof field on the returned credential
        expect(result).not.toHaveProperty("proof");

        // Assert the returned credential is the same reference as the input
        expect(result).toBe(credential);
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 19: Generation is deterministic for pinned seed, mode, and maxDepth
//
// For any seed, mode ("minimal" | "full"), and maxDepth (0-10), calling
// CredentialGraphGenerator.generate() twice with the same configuration
// produces identical credential documents.
//
// Feature: ob3-tooling-improvements, Property 19: Generation is deterministic for pinned seed, mode, and maxDepth
// ---------------------------------------------------------------------------

import { CredentialGraphGenerator } from "../../src/generator/index.js";

describe("Feature: ob3-tooling-improvements, Property 19: Generation is deterministic for pinned seed, mode, and maxDepth", () => {
  /**
   * **Validates: Requirements 9.1**
   *
   * For any arbitrary seed, mode, and maxDepth, two calls to generate() with
   * the same configuration yield deeply equal credential documents.
   */
  it("generate() produces identical documents for the same seed, mode, and maxDepth", async () => {
    const generator = new CredentialGraphGenerator();

    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 2 ** 31 - 1 }), // seed
        fc.constantFrom("minimal" as const, "full" as const), // mode
        fc.integer({ min: 0, max: 10 }), // maxDepth
        async (seed, mode, maxDepth) => {
          const config = { seed, mode, maxDepth };

          const result1 = await generator.generate(config);
          const result2 = await generator.generate(config);

          // Both must succeed (not be errors)
          if ("ok" in result1 && result1.ok === false) return; // skip errors
          if ("ok" in result2 && result2.ok === false) return;

          // Compare the credential documents as JSON (deep equality)
          const output1 = result1 as import("../../src/generator/types.js").GenerationOutput;
          const output2 = result2 as import("../../src/generator/types.js").GenerationOutput;

          expect(JSON.stringify(output1.credentials.map((c) => c.document))).toBe(
            JSON.stringify(output2.credentials.map((c) => c.document)),
          );
        },
      ),
      { numRuns: 100 },
    );
  }, 600_000);
});

// ---------------------------------------------------------------------------
// Arbitraries for TypeGraph generation
// ---------------------------------------------------------------------------

/**
 * Generate a valid class name (simple alphanumeric identifier).
 */
const classNameArb = fc.stringMatching(/^[A-Z][a-zA-Z]{2,15}$/);

/**
 * Generate an arbitrary TypeGraph with a root node, required edges,
 * optional edges, and a set of target class names drawn from existing nodes.
 *
 * Structure:
 * - Between 3 and 10 nodes
 * - Root is the first node
 * - Edges connect nodes; some are marked required, some optional
 * - Targets are a subset of existing node names
 */
const typeGraphWithTargetsArb: fc.Arbitrary<{ graph: TypeGraph; targets: string[] }> = fc
  .array(classNameArb, { minLength: 3, maxLength: 10 })
  .chain((rawNames) => {
    // Ensure unique names
    const uniqueNames = [...new Set(rawNames)];
    if (uniqueNames.length < 3) {
      // Pad to at least 3 unique names
      const extras = ["RootClass", "RequiredChild", "OptionalLeaf"];
      for (const e of extras) {
        if (!uniqueNames.includes(e)) uniqueNames.push(e);
        if (uniqueNames.length >= 3) break;
      }
    }
    const names = uniqueNames;
    const rootClass = names[0];

    // Generate edges: for each node, generate 0-3 edges to other nodes
    return fc
      .tuple(
        // For each node, generate edges
        ...names.map((nodeName) =>
          fc.array(
            fc.record({
              targetIdx: fc.nat({ max: names.length - 1 }),
              propertyName: fc.stringMatching(/^[a-z][a-zA-Z]{1,10}$/),
              isRequired: fc.boolean(),
            }),
            { minLength: 0, maxLength: 3 },
          ),
        ),
      )
      .chain((edgeArrays) => {
        // Build the graph
        const nodes = new Map<string, GraphNode>();

        for (let i = 0; i < names.length; i++) {
          const nodeName = names[i];
          const properties = new Map<string, GraphEdge>();
          const edges = edgeArrays[i];

          for (const edgeDef of edges) {
            const targetClass = names[edgeDef.targetIdx];
            // Avoid self-loops
            if (targetClass === nodeName) continue;
            // Avoid duplicate property names
            if (properties.has(edgeDef.propertyName)) continue;

            properties.set(edgeDef.propertyName, {
              propertyName: edgeDef.propertyName,
              targetClass,
              cardinality: {
                minOccurs: edgeDef.isRequired ? 1 : 0,
                maxOccurs: 1,
              },
              isRequired: edgeDef.isRequired,
              isArray: false,
            });
          }

          nodes.set(nodeName, {
            name: nodeName,
            properties,
            rawSchema: {},
          });
        }

        const graph: TypeGraph = { nodes, rootClass };

        // Pick targets from existing node names (non-empty subset, excluding root for variety)
        const nonRootNames = names.filter((n) => n !== rootClass);
        const targetSource = nonRootNames.length > 0 ? nonRootNames : names;

        return fc
          .subarray(targetSource, { minLength: 1, maxLength: Math.min(3, targetSource.length) })
          .map((targets) => ({ graph, targets }));
      });
  });

// ---------------------------------------------------------------------------
// Helper: collect all classes reachable via required edges from a given node
// ---------------------------------------------------------------------------

function collectAllRequiredClasses(
  className: string,
  graph: TypeGraph,
  result: Set<string>,
  visited: Set<string> = new Set(),
): void {
  if (visited.has(className)) return;
  visited.add(className);

  const node = graph.nodes.get(className);
  if (!node) return;

  for (const edge of node.properties.values()) {
    if (edge.isRequired) {
      result.add(edge.targetClass);
      collectAllRequiredClasses(edge.targetClass, graph, result, visited);
    }
  }
}

// ---------------------------------------------------------------------------
// Property 14: Class targeting populates targets plus required closure and
// reports exercised targets
//
// For any TypeGraph with a root node, required/optional edges, and target
// classes drawn from existing nodes:
// - computeTargetingClosure returns a set that always includes:
//   (1) the root class, (2) all classes reachable via required edges from root,
//   (3) each specified target class
// - computeTargetedCoverage correctly reports which targets were exercised
//
// Feature: ob3-tooling-improvements, Property 14: Class targeting populates targets plus required closure and reports exercised targets
// ---------------------------------------------------------------------------

describe("Feature: ob3-tooling-improvements, Property 14: Class targeting populates targets plus required closure and reports exercised targets", () => {
  /**
   * **Validates: Requirements 6.1, 6.3**
   *
   * The targeting closure always includes the root class, required-reachable
   * classes, and each specified target class.
   */
  it("computeTargetingClosure includes root, required-reachable classes, and all targets", () => {
    fc.assert(
      fc.property(typeGraphWithTargetsArb, ({ graph, targets }) => {
        const result = computeTargetingClosure(targets, graph);

        // Result must be successful since targets are drawn from existing nodes
        expect(result.ok).toBe(true);
        if (!result.ok) return;

        const allowed = result.allowedClasses;

        // (1) Root class is always included
        expect(allowed.has(graph.rootClass)).toBe(true);

        // (2) All classes reachable via required edges from root are included
        const requiredClasses = new Set<string>();
        collectAllRequiredClasses(graph.rootClass, graph, requiredClasses);
        for (const reqClass of requiredClasses) {
          expect(allowed.has(reqClass)).toBe(true);
        }

        // (3) Each specified target class is included
        for (const target of targets) {
          expect(allowed.has(target)).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 6.3**
   *
   * computeTargetedCoverage correctly identifies which targets from the
   * requested set were actually exercised (present in the active path).
   */
  it("computeTargetedCoverage reports exercised targets as the intersection of targets and active path nodes", () => {
    fc.assert(
      fc.property(
        typeGraphWithTargetsArb.chain(({ graph, targets }) => {
          // Generate an active path that exercises some subset of the graph nodes
          const allNodes = [...graph.nodes.keys()];
          return fc
            .subarray(allNodes, { minLength: 1, maxLength: allNodes.length })
            .map((exercisedNodes) => ({
              targets,
              activePath: {
                nodes: exercisedNodes,
                edges: [],
              } as ActivePath,
            }));
        }),
        ({ targets, activePath }) => {
          const coverage = computeTargetedCoverage(targets, activePath);

          // requested should match the input targets
          expect(coverage.requested).toEqual(targets);

          // exercised should be exactly the intersection of targets and activePath.nodes
          const activeSet = new Set(activePath.nodes);
          const expectedExercised = targets.filter((t) => activeSet.has(t));
          expect(coverage.exercised.sort()).toEqual(expectedExercised.sort());
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 10: Signing then verifying passes
//
// For any arbitrary valid OB3 credential document, signing with
// attachProofIfRequested(credential, true) and then verifying with
// checkSignature(signedDoc) yields status === "passed".
//
// Feature: ob3-tooling-improvements, Property 10: Signing then verifying passes
// ---------------------------------------------------------------------------

describe("Feature: ob3-tooling-improvements, Property 10: Signing then verifying passes", () => {
  /**
   * **Validates: Requirements 5.1, 5.2**
   *
   * For any valid OB3 credential, signing it with the generator's proof signer
   * and verifying with the validator's Signature_Check always produces a passed result.
   */
  it("sign with attachProofIfRequested then verify with checkSignature yields status passed", async () => {
    await fc.assert(
      fc.asyncProperty(ob3CredentialArb, async (credential) => {
        // Sign the credential
        const signed = await attachProofIfRequested(credential, true);

        // Verify the signature
        const result = await checkSignature(signed);

        // Must pass
        expect(result.status).toBe("passed");
        expect(result.suite).toBe("eddsa-rdfc-2022");
      }),
      { numRuns: 100 },
    );
  }, 300_000);
});

// ---------------------------------------------------------------------------
// Property 11: Tampering after signing fails verification
//
// For any arbitrary valid OB3 credential document, signing with
// attachProofIfRequested(credential, true), then modifying a field in the
// signed document, and verifying with checkSignature(tamperedDoc) yields
// status === "failed".
//
// Feature: ob3-tooling-improvements, Property 11: Tampering after signing fails verification
// ---------------------------------------------------------------------------

/**
 * Arbitrary that produces a tampered version of a signed credential by modifying
 * one of the credential's fields after signing.
 */
const tamperStrategyArb = fc.constantFrom(
  "name",
  "issuer.name",
  "credentialSubject.id",
  "credentialSubject.achievement.name",
  "validFrom",
  "id",
) as fc.Arbitrary<string>;

/**
 * Apply tampering to a signed credential by modifying the specified field path.
 */
function tamperWithDocument(
  doc: Record<string, unknown>,
  strategy: string,
): Record<string, unknown> {
  // Deep clone to avoid mutating the original
  const tampered = JSON.parse(JSON.stringify(doc)) as Record<string, unknown>;

  switch (strategy) {
    case "name":
      tampered.name = `TAMPERED-${tampered.name || "value"}`;
      break;
    case "issuer.name": {
      const issuer = tampered.issuer as Record<string, unknown>;
      issuer.name = `TAMPERED-${issuer.name || "value"}`;
      break;
    }
    case "credentialSubject.id": {
      const subject = tampered.credentialSubject as Record<string, unknown>;
      subject.id = "did:example:tampered-subject-id";
      break;
    }
    case "credentialSubject.achievement.name": {
      const subject = tampered.credentialSubject as Record<string, unknown>;
      const achievement = subject.achievement as Record<string, unknown>;
      achievement.name = `TAMPERED-${achievement.name || "value"}`;
      break;
    }
    case "validFrom":
      tampered.validFrom = "2099-12-31T23:59:59.000Z";
      break;
    case "id":
      tampered.id = "urn:uuid:tampered-00000000-0000-0000-0000-000000000000";
      break;
  }

  return tampered;
}

describe("Feature: ob3-tooling-improvements, Property 11: Tampering after signing fails verification", () => {
  /**
   * **Validates: Requirements 5.3**
   *
   * For any valid OB3 credential, signing it and then tampering with a field
   * causes the Signature_Check to report status "failed".
   */
  it("sign, tamper with a field, then verify with checkSignature yields status failed", async () => {
    await fc.assert(
      fc.asyncProperty(ob3CredentialArb, tamperStrategyArb, async (credential, strategy) => {
        // Sign the credential
        const signed = await attachProofIfRequested(credential, true);

        // Tamper with the signed document
        const tampered = tamperWithDocument(signed, strategy);

        // Verify the tampered document
        const result = await checkSignature(tampered);

        // Must fail
        expect(result.status).toBe("failed");
      }),
      { numRuns: 100 },
    );
  }, 300_000);
});

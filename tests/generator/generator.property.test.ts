/**
 * Property-based tests for the CredentialGraphGenerator.
 * Uses fast-check to verify universal correctness properties across the input space.
 *
 * Requirements: 5.2, 5.3, 6.1, 6.2, 6.3, 4.3, 2.4, 7.2, 9.4, 10.4, 8.1, 8.2, 8.3
 */

import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { CredentialGraphGenerator } from "../../src/generator/index.js";
import { MermaidRenderer } from "../../src/generator/mermaid-renderer.js";
import { SchemaGraphBuilder } from "../../src/generator/schema-graph-builder.js";
import type {
    ActivePath,
    CoverageReport,
    GenerationOutput,
    TypeGraph,
} from "../../src/generator/types.js";
import { validateJsonLd } from "../../src/validate/jsonld.js";
import { validateSchema } from "../../src/validate/schema.js";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function isGenerationOutput(result: unknown): result is GenerationOutput {
  return (
    result !== null &&
    typeof result === "object" &&
    "credentials" in result &&
    "coverage" in result
  );
}

// Build the TypeGraph once for all cardinality checks (expensive to rebuild per run)
let cachedTypeGraph: TypeGraph | null = null;

function getTypeGraph(): TypeGraph {
  if (cachedTypeGraph) return cachedTypeGraph;
  const builder = new SchemaGraphBuilder();
  const result = builder.build("AchievementCredential");
  if ("ok" in result && result.ok === false) {
    throw new Error(`Failed to build TypeGraph: ${result.error}`);
  }
  cachedTypeGraph = result as TypeGraph;
  return cachedTypeGraph;
}

// Arbitrary for a valid GenerationConfig (used by multiple properties)
const validConfigArb = fc.record({
  maxDepth: fc.integer({ min: 0, max: 10 }),
  mode: fc.constantFrom("minimal" as const, "full" as const),
  seed: fc.option(fc.integer({ min: 0, max: 2 ** 31 - 1 }), { nil: undefined }),
  includeMermaid: fc.boolean(),
});

// ---------------------------------------------------------------------------
// Property 1: Generated credentials pass validate_credential
//
// For any valid GenerationConfig, if the generator returns a GenerationOutput,
// the generated credential document SHALL have zero severity:"error" entries
// from both validateSchema AND validateJsonLd.
//
// **Validates: Requirements 6.1, 6.2, 6.3**
// ---------------------------------------------------------------------------

// Feature: credential-graph-generator, Property 1: generated credentials pass validate_credential
describe("Property 1: generated credentials pass validate_credential", () => {
  it(
    "every generated credential has zero severity:error entries from both validators",
    async () => {
      let successCount = 0;
      await fc.assert(
        fc.asyncProperty(validConfigArb, async (config) => {
          const generator = new CredentialGraphGenerator();
          const result = await generator.generate(config);

          // Only assert when generation succeeds
          if (!isGenerationOutput(result)) return;
          successCount++;

          expect("credentials" in result).toBe(true);
          expect(result.credentials.length).toBeGreaterThanOrEqual(1);

          const doc = result.credentials[0].document;

          const schemaErrors = validateSchema(doc);
          const schemaErrorEntries = schemaErrors.filter((e) => e.severity === "error");
          expect(
            schemaErrorEntries,
            `Schema errors: ${schemaErrorEntries.map((e) => `${e.path}: ${e.message}`).join(", ")}`,
          ).toHaveLength(0);

          const { errors: jsonldErrors } = await validateJsonLd(doc);
          const jsonldErrorEntries = jsonldErrors.filter((e) => e.severity === "error");
          expect(
            jsonldErrorEntries,
            `JSON-LD errors: ${jsonldErrorEntries.map((e) => `${e.path}: ${e.message}`).join(", ")}`,
          ).toHaveLength(0);
        }),
        { numRuns: 100 },
      );

      expect(
        successCount,
        `Most configs should produce a credential, but only ${successCount}/100 did`,
      ).toBeGreaterThanOrEqual(95);
    },
    300_000,
  );
});

// ---------------------------------------------------------------------------
// Property 2: Generator terminates for all maxDepth values
//
// For any integer maxDepth in [0, 10], calling generate() SHALL resolve
// (not throw and not hang indefinitely).
//
// **Validates: Requirements 4.3, 2.4**
// ---------------------------------------------------------------------------

// Feature: credential-graph-generator, Property 2: generator terminates for all maxDepth values
describe("Property 2: generator terminates for all maxDepth values", () => {
  it(
    "generate() always resolves for any maxDepth in [0, 10]",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: 10 }),
          async (maxDepth) => {
            const generator = new CredentialGraphGenerator();
            // The promise must resolve — no throw, no hang
            const result = await generator.generate({ maxDepth });
            // Simply asserting the promise resolved is sufficient
            expect(result).toBeDefined();
          },
        ),
        { numRuns: 50 },
      );
    },
    120_000,
  );
});

// ---------------------------------------------------------------------------
// Property 3: Serialization round-trip preserves the credential
//
// For any GenerationConfig that produces a GenerationOutput, double-serializing
// and re-parsing the credential document SHALL yield a value that is deeply
// equal to single-serializing and re-parsing it.
//
//   JSON.parse(JSON.stringify(JSON.parse(JSON.stringify(doc))))
//     deeply equals
//   JSON.parse(JSON.stringify(doc))
//
// **Validates: Requirements 7.2**
// ---------------------------------------------------------------------------

// Feature: credential-graph-generator, Property 3: serialization round-trip preserves the credential
describe("Property 3: serialization round-trip preserves the credential", () => {
  it(
    "double JSON round-trip produces a deeply equal value to single round-trip",
    async () => {
      let successCount = 0;
      await fc.assert(
        fc.asyncProperty(validConfigArb, async (config) => {
          const generator = new CredentialGraphGenerator();
          const result = await generator.generate(config);

          if (!isGenerationOutput(result)) return;
          successCount++;

          const doc = result.credentials[0].document;

          // Single round-trip
          const once = JSON.parse(JSON.stringify(doc));
          // Double round-trip
          const twice = JSON.parse(JSON.stringify(once));

          // They must be deeply equal
          expect(twice).toEqual(once);
        }),
        { numRuns: 100 },
      );

      expect(
        successCount,
        `Most configs should produce a credential, but only ${successCount}/100 did`,
      ).toBeGreaterThanOrEqual(95);
    },
    300_000,
  );
});

// ---------------------------------------------------------------------------
// Property 4: Coverage percentages are always in [0, 100]
//
// For any GenerationConfig, every percentage field in the CoverageReport
// (exercisedClasses, exercisedProperties, exercisedEdges) SHALL satisfy
// 0 <= percentage <= 100.
//
// **Validates: Requirements 9.4**
// ---------------------------------------------------------------------------

// Feature: credential-graph-generator, Property 4
describe("Property 4: coverage percentages are always in [0, 100]", () => {
  it(
    "every percentage in CoverageReport satisfies 0 <= p <= 100 for any valid config",
    async () => {
      let successCount = 0;
      await fc.assert(
        fc.asyncProperty(validConfigArb, async (config) => {
          const generator = new CredentialGraphGenerator();
          const result = await generator.generate(config);

          // Only assert coverage when generation succeeds
          if (!isGenerationOutput(result)) {
            return;
          }
          successCount++;

          const coverage: CoverageReport = result.coverage;

          const { percentage: classPercentage } = coverage.exercisedClasses;
          const { percentage: propertyPercentage } = coverage.exercisedProperties;
          const { percentage: edgePercentage } = coverage.exercisedEdges;

          expect(classPercentage).toBeGreaterThanOrEqual(0);
          expect(classPercentage).toBeLessThanOrEqual(100);

          expect(propertyPercentage).toBeGreaterThanOrEqual(0);
          expect(propertyPercentage).toBeLessThanOrEqual(100);

          expect(edgePercentage).toBeGreaterThanOrEqual(0);
          expect(edgePercentage).toBeLessThanOrEqual(100);
        }),
        { numRuns: 100 },
      );

      expect(
        successCount,
        `Most configs should produce a credential, but only ${successCount}/100 did`,
      ).toBeGreaterThanOrEqual(95);
    },
    300_000,
  );
});

// ---------------------------------------------------------------------------
// Property 6: Cardinality correctness in full mode
//
// For any config with mode: 'full', for each emitted property in the
// generated credential's document:
//   - If the corresponding GraphEdge exists AND edge.isArray → value is an
//     Array with length in [1, 5]
//   - If the corresponding GraphEdge exists AND !edge.isArray (object-valued,
//     non-array) → value is NOT a JavaScript Array
//
// Only properties that have corresponding GraphEdges are checked; scalar
// properties without edges are out of scope for this property.
//
// **Validates: Requirements 5.2, 5.3**
// ---------------------------------------------------------------------------

// Feature: credential-graph-generator, Property 6
describe("Property 6: cardinality correctness in full mode", () => {
  // Properties injected by the synthesizer with hardcoded forms (not via GraphEdge schema).
  // @context and type are always arrays; id is always a string. These bypass the
  // TypeGraph cardinality rules and must be checked separately.
  const SYNTHESIZER_INJECTED_PROPS = new Set(["@context", "type", "id"]);

  it(
    "array-schema properties emit arrays of length 1–5, single-value properties are not arrays",
    async () => {
      let successCount = 0;
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            maxDepth: fc.integer({ min: 0, max: 10 }),
            mode: fc.constant("full" as const),
            seed: fc.option(fc.integer(), { nil: undefined }),
            includeMermaid: fc.boolean(),
          }),
          async (config) => {
            const generator = new CredentialGraphGenerator();
            const result = await generator.generate(config);

            // If generation failed (e.g. synthesis error), skip this sample
            if (!isGenerationOutput(result)) return;
            if (result.credentials.length === 0) return;
            successCount++;

            const doc = result.credentials[0].document;
            const typeGraph = getTypeGraph();

            // Walk the TypeGraph nodes to check properties in the document
            for (const [_nodeName, graphNode] of typeGraph.nodes) {
              // For each GraphEdge on this node, check the emitted value in doc
              // We only check properties on the root document for simplicity —
              // the root is AchievementCredential whose properties are the top-level
              // document fields.
              if (_nodeName !== typeGraph.rootClass) continue;

              for (const [propName, edge] of graphNode.properties) {
                // Skip properties that are hardcoded by the synthesizer (not from GraphEdge schema)
                if (SYNTHESIZER_INJECTED_PROPS.has(propName)) continue;

                // Only check if the property is present in the document
                if (!(propName in doc)) continue;

                const value = doc[propName];

                if (edge.isArray) {
                  // Req 5.2: array-schema properties → Array with length in [1, 5]
                  expect(
                    Array.isArray(value),
                    `Property "${propName}" with isArray=true should be an Array but got: ${typeof value}`,
                  ).toBe(true);
                  const arr = value as unknown[];
                  expect(
                    arr.length >= 1 && arr.length <= 5,
                    `Property "${propName}" array length ${arr.length} should be in [1, 5]`,
                  ).toBe(true);
                } else {
                  // Req 5.3: single-value schema → NOT an Array
                  expect(
                    Array.isArray(value),
                    `Property "${propName}" with isArray=false should NOT be an Array`,
                  ).toBe(false);
                }
              }
            }

            // Also directly verify the synthesizer-injected top-level properties (Req 5.2, 5.3)
            // @context is always an array (OB3 requires it)
            expect(
              Array.isArray(doc["@context"]),
              "@context should be an array",
            ).toBe(true);

            // type is always an array (OB3 requires it)
            expect(
              Array.isArray(doc["type"]),
              "type should be an array",
            ).toBe(true);

            // id is always a string (not an array)
            expect(
              Array.isArray(doc["id"]),
              "id should NOT be an array",
            ).toBe(false);
            expect(typeof doc["id"], "id should be a string").toBe("string");
          },
        ),
        { numRuns: 20 },
      );

      expect(
        successCount,
        `Most configs should produce a credential, but only ${successCount}/20 did`,
      ).toBeGreaterThanOrEqual(19);
    },
    180_000,
  );
});

// ---------------------------------------------------------------------------
// Property 7: Mermaid has one node per class, one edge per distinct triple
//
// For any ActivePath with ≥ 1 node, the Mermaid source text produced by
// MermaidRenderer.render() SHALL contain exactly one node declaration per
// distinct class name in activePath.nodes AND exactly one directed edge line
// per distinct (from, to, propertyName) triple in activePath.edges.
//
// **Validates: Requirements 8.1, 8.2, 8.3**
// ---------------------------------------------------------------------------

// Feature: credential-graph-generator, Property 7
describe("Property 7: Mermaid has one node per class, one edge per distinct triple", () => {
  const renderer = new MermaidRenderer();

  // Arbitrary class names
  const classNameArb = fc.constantFrom(
    "AchievementCredential",
    "AchievementSubject",
    "Achievement",
    "Profile",
    "EndorsementCredential",
    "Evidence",
  );

  // Arbitrary edge using known class pairs
  const edgeArb = fc.record({
    from: fc.constantFrom(
      "AchievementCredential",
      "AchievementSubject",
      "Achievement",
      "Profile",
    ),
    to: fc.constantFrom(
      "AchievementSubject",
      "Achievement",
      "Profile",
      "Evidence",
    ),
    propertyName: fc.constantFrom(
      "credentialSubject",
      "achievement",
      "creator",
      "parentOrg",
    ),
  });

  // ActivePath with ≥ 1 node
  const activePathArb: fc.Arbitrary<ActivePath> = fc.record({
    nodes: fc.array(classNameArb, { minLength: 1, maxLength: 10 }),
    edges: fc.array(edgeArb, { minLength: 0, maxLength: 15 }),
  });

  it(
    "emits exactly one node declaration per distinct class name",
    () => {
      fc.assert(
        fc.property(activePathArb, (activePath) => {
          const mermaid = renderer.render(activePath);
          const lines = mermaid.split("\n");

          // Count distinct class names in activePath.nodes
          const distinctClasses = new Set(activePath.nodes);

          // Parse node declaration lines: "  SomeId[ClassName]"
          // Matches lines like "  AchievementCredential[AchievementCredential]"
          const nodeDeclarationLines = lines.filter((line) =>
            /^\s+\w+\[[^\]]+\]$/.test(line),
          );

          // Each distinct class name should appear in exactly one node declaration line
          for (const className of distinctClasses) {
            const matchingLines = nodeDeclarationLines.filter((line) =>
              line.includes(`[${className}]`),
            );
            expect(matchingLines).toHaveLength(1);
          }

          // Total node declaration count must equal distinct class count
          expect(nodeDeclarationLines).toHaveLength(distinctClasses.size);
        }),
        { numRuns: 200 },
      );
    },
  );

  it(
    "emits exactly one arrow line per distinct (from, to, propertyName) triple",
    () => {
      fc.assert(
        fc.property(activePathArb, (activePath) => {
          const mermaid = renderer.render(activePath);
          const lines = mermaid.split("\n");

          // Compute distinct triples
          const distinctTriples = new Map<string, { from: string; to: string; propertyName: string }>();
          for (const edge of activePath.edges) {
            const key = `${edge.from}|${edge.to}|${edge.propertyName}`;
            if (!distinctTriples.has(key)) {
              distinctTriples.set(key, edge);
            }
          }

          // Parse arrow lines: "  FromId -->|prop| ToId"
          const arrowLines = lines.filter((line) =>
            /^\s+\w+ -->\|[^|]+\| \w+$/.test(line),
          );

          // Each distinct triple must produce exactly one arrow line
          for (const [, edge] of distinctTriples) {
            const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9]/g, "");
            const expectedArrow = `${sanitize(edge.from)} -->|${edge.propertyName}| ${sanitize(edge.to)}`;
            const matchingArrows = arrowLines.filter((line) =>
              line.trim() === expectedArrow,
            );
            expect(matchingArrows).toHaveLength(1);
          }

          // Total arrow line count must equal distinct triple count
          expect(arrowLines).toHaveLength(distinctTriples.size);
        }),
        { numRuns: 200 },
      );
    },
  );
});

// ---------------------------------------------------------------------------
// Property 5: Seeded runs produce identical output
//
// For any GenerationConfig that includes a seed, running
// CredentialGraphGenerator.generate() twice with the same config SHALL
// produce byte-for-byte identical JSON.stringify(output.credentials[0].document)
// values.
//
// **Validates: Requirements 10.4**
// ---------------------------------------------------------------------------

// Feature: credential-graph-generator, Property 5
describe("Property 5: Seeded runs produce identical output", () => {
  const generator5 = new CredentialGraphGenerator();

  it(
    "running generate twice with the same seeded config produces identical credential documents",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            maxDepth: fc.integer({ min: 0, max: 10 }),
            mode: fc.constantFrom("minimal" as const, "full" as const),
            seed: fc.integer({ min: 0, max: 2147483647 }),
            includeMermaid: fc.boolean(),
          }),
          async (config) => {
            const out1 = await generator5.generate(config);
            const out2 = await generator5.generate(config);

            // Both runs must succeed (return GenerationOutput, not GeneratorError)
            if (!isGenerationOutput(out1) || !isGenerationOutput(out2)) {
              // If both errored, the error messages should be identical (deterministic)
              if (!isGenerationOutput(out1) && !isGenerationOutput(out2)) {
                expect(JSON.stringify(out1)).toBe(JSON.stringify(out2));
                return;
              }
              // One succeeded and one didn't — never valid with a seeded generator
              expect(isGenerationOutput(out1)).toBe(true);
              expect(isGenerationOutput(out2)).toBe(true);
              return;
            }

            // Both runs returned credentials — assert identical documents
            const doc1 = JSON.stringify(out1.credentials[0].document);
            const doc2 = JSON.stringify(out2.credentials[0].document);
            expect(doc1).toBe(doc2);
          },
        ),
        { numRuns: 100 },
      );
    },
    // Generous timeout: 100 runs × 2 calls × ~2500ms each = ~500s
    600_000,
  );
});

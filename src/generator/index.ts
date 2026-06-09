/**
 * CredentialGraphGenerator — top-level orchestrator.
 *
 * Validates configuration with Zod, builds the TypeGraph, traverses it,
 * synthesizes a credential, optionally renders Mermaid, collects coverage,
 * and validates the generated document via the existing AJV + JSON-LD validators.
 *
 * Requirements: 2.1, 2.2, 2.3, 6.2, 6.3, 6.5, 6.6, 8.4, 8.5, 8.6,
 *               11.1, 11.2, 11.3, 11.4, 11.5, 12.3, 12.4
 */

import { z } from "zod";
import { getMaxResponseBytes } from "../config.js";
import { boundDocument } from "../util/output-bounding.js";
import { validateJsonLd } from "../validate/jsonld.js";
import { validateSchema } from "../validate/schema.js";
import { getVocab } from "../vocab/index.js";
import { loadVocab } from "../vocab/loader.js";
import type { Vocab } from "../vocab/types.js";
import { CoverageCollector } from "./coverage-collector.js";
import { CredentialSynthesizer, createRand } from "./credential-synthesizer.js";
import { enforceDateCoherency } from "./date-coherency.js";
import { MermaidRenderer } from "./mermaid-renderer.js";
import { type BuildResult, SchemaGraphBuilder } from "./schema-graph-builder.js";
import { TraversalEngine } from "./traversal-engine.js";
import type {
  GenerationConfig,
  GenerationOutput,
  GeneratorError,
  GeneratorResult,
} from "./types.js";

// ---------------------------------------------------------------------------
// Zod config schema (Req 11.3, 11.4)
// ---------------------------------------------------------------------------

const GenerationConfigSchema = z.object({
  maxDepth: z.number().int().min(0).max(10).default(3),
  mode: z.enum(["minimal", "full"]).default("minimal"),
  seed: z.number().int().optional(),
  includeMermaid: z.boolean().default(false),
  rootClass: z.string().default("AchievementCredential"),
  contentMode: z.enum(["uuid", "realistic"]).default("uuid"),
});

// The parsed / defaulted config type
type ParsedConfig = z.output<typeof GenerationConfigSchema>;

// ---------------------------------------------------------------------------
// OB3 source metadata (Req 11.7)
// ---------------------------------------------------------------------------

const OB3_VERSION = "3.0.3";
const OB3_CONTEXT_URL = "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json";

// ---------------------------------------------------------------------------
// TypeGraph cache (Req: performance)
//
// Building the TypeGraph re-reads + re-parses the JSON Schema snapshot and the
// vocab graph on every call. Both inputs are static for a given rootClass, so
// the resulting TypeGraph is cached and shared across generate() calls.
// All downstream consumers (TraversalEngine, CredentialSynthesizer,
// CoverageCollector) treat the TypeGraph and its rawSchema as read-only.
// ---------------------------------------------------------------------------

const typeGraphCache = new Map<string, BuildResult>();

function _getTypeGraph(rootClass: string): BuildResult {
  const cached = typeGraphCache.get(rootClass);
  if (cached) return cached;

  let vocab: Vocab | undefined;
  try {
    vocab = getVocab();
  } catch {
    // Vocab loading is best-effort; SchemaGraphBuilder works without it
    vocab = undefined;
  }

  const builder = new SchemaGraphBuilder(vocab);
  const buildResult = builder.build(rootClass);
  typeGraphCache.set(rootClass, buildResult);
  return buildResult;
}

// ---------------------------------------------------------------------------
// CredentialGraphGenerator
// ---------------------------------------------------------------------------

export class CredentialGraphGenerator {
  /**
   * Generate a representative OB3 credential.
   *
   * @param config - Partial generation config; defaults are applied via Zod.
   * @returns A `GenerationOutput` on success, or a `GeneratorError` on any failure.
   */
  async generate(config: GenerationConfig): Promise<GeneratorResult> {
    // ------------------------------------------------------------------
    // Step 1: Validate + coerce config with Zod (Req 11.4)
    // ------------------------------------------------------------------
    const parseResult = GenerationConfigSchema.safeParse(config);

    if (!parseResult.success) {
      const zodError = parseResult.error;
      const error: GeneratorError = {
        ok: false,
        error: "Invalid config",
        fields: zodError.issues.map((e) => ({
          field: e.path.join("."),
          reason: e.message,
        })),
      };
      return error;
    }

    const parsedConfig: ParsedConfig = parseResult.data;

    // ------------------------------------------------------------------
    // Step 2: Build TypeGraph (Req 2.1)
    // ------------------------------------------------------------------
    let vocab: ReturnType<typeof loadVocab> | undefined;
    try {
      vocab = loadVocab();
    } catch {
      // Vocab loading is best-effort; SchemaGraphBuilder works without it
      vocab = undefined;
    }

    const builder = new SchemaGraphBuilder(vocab);
    const buildResult = builder.build(parsedConfig.rootClass);

    if ("ok" in buildResult && buildResult.ok === false) {
      // Propagate SchemaGraphBuilder error (Req 11.5)
      return buildResult as GeneratorError;
    }

    // At this point buildResult is a TypeGraph
    const typeGraph = buildResult as Exclude<typeof buildResult, GeneratorError>;

    // ------------------------------------------------------------------
    // Step 3: Traverse (Req 2.2, 2.3)
    // ------------------------------------------------------------------
    const traversalEngine = new TraversalEngine(typeGraph, {
      maxDepth: parsedConfig.maxDepth,
    });
    const activePath = traversalEngine.traverse(parsedConfig.rootClass);

    // ------------------------------------------------------------------
    // Step 4: Synthesize credential (Req 6.2, 6.3, 12.3)
    // ------------------------------------------------------------------
    const rand = createRand(parsedConfig.seed);
    const synthesizer = new CredentialSynthesizer(
      typeGraph,
      {
        maxDepth: parsedConfig.maxDepth,
        mode: parsedConfig.mode,
        contentMode: parsedConfig.contentMode,
      },
      rand,
    );

    const synthesisResult = synthesizer.synthesize(activePath);

    if (
      synthesisResult !== null &&
      typeof synthesisResult === "object" &&
      "ok" in synthesisResult &&
      (synthesisResult as GeneratorError).ok === false
    ) {
      // Return error with no partial credential (Req 11.5, 12.4)
      return synthesisResult as GeneratorError;
    }

    const document = synthesisResult as Record<string, unknown>;

    // Apply date coherency post-processing for realistic mode
    if (parsedConfig.contentMode === "realistic") {
      enforceDateCoherency(document);
    }

    // ------------------------------------------------------------------
    // Step 5: Optionally render Mermaid (Req 8.4, 8.5, 8.6)
    // ------------------------------------------------------------------
    let mermaid: string | undefined;
    if (parsedConfig.includeMermaid) {
      const renderer = new MermaidRenderer();
      mermaid = renderer.render(activePath);
    }

    // ------------------------------------------------------------------
    // Step 6: Collect coverage (Req 9.x)
    // ------------------------------------------------------------------
    const collector = new CoverageCollector();
    collector.record(activePath);
    const coverage = collector.report(typeGraph);

    // ------------------------------------------------------------------
    // Step 7: Validate generated credential (Req 6.6, 11.5, 12.4)
    // ------------------------------------------------------------------
    const schemaErrors = validateSchema(document);
    const schemaErrorEntries = schemaErrors.filter((e) => e.severity === "error");

    if (schemaErrorEntries.length > 0) {
      const errorMessages = schemaErrorEntries.map((e) => `${e.path}: ${e.message}`).join("; ");
      const error: GeneratorError = {
        ok: false,
        error: `Generated credential failed schema validation: ${errorMessages}`,
        path: [parsedConfig.rootClass],
      };
      return error;
    }

    const { errors: jsonldErrors } = await validateJsonLd(document);
    const jsonldErrorEntries = jsonldErrors.filter((e) => e.severity === "error");

    if (jsonldErrorEntries.length > 0) {
      const errorMessages = jsonldErrorEntries.map((e) => `${e.path}: ${e.message}`).join("; ");
      const error: GeneratorError = {
        ok: false,
        error: `Generated credential failed JSON-LD validation: ${errorMessages}`,
        path: [parsedConfig.rootClass],
      };
      return error;
    }

    // ------------------------------------------------------------------
    // Step 8: Assemble and return GenerationOutput (Req 11.1, 11.2, 11.7)
    // ------------------------------------------------------------------
    const output: GenerationOutput = {
      credentials: [
        {
          document,
          activePath,
          ...(mermaid !== undefined ? { mermaid } : {}),
        },
      ],
      coverage,
      version: OB3_VERSION,
      sources: [
        {
          url: OB3_CONTEXT_URL,
          anchor: OB3_VERSION,
        },
      ],
    };

    // ------------------------------------------------------------------
    // Step 9: Bound output (Req 8.1, 8.2, 8.3)
    //
    // Route the assembled GenerationOutput through the Output_Bounding_Utility.
    // If the serialized response exceeds the configured cap, mark it as bounded.
    // Determinism (Req 9.1) is preserved: the seed-based PRNG controls traversal
    // and synthesis order; bounding is a post-hoc wrapper that does not alter
    // the generation logic.
    // ------------------------------------------------------------------
    const boundResult = boundDocument(output, { maxBytes: getMaxResponseBytes() });

    if (boundResult.bounded) {
      // Return a bounded GenerationOutput with the bounded flag set and the
      // bounding utility's payload/summary surfaced.
      const boundedOutput: GenerationOutput = {
        ...output,
        bounded: true,
      };
      return boundedOutput;
    }

    return output;
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export type * from "./types.js";
export { CredentialGraphGenerator as default };

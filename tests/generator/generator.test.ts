/**
 * Unit tests for the CredentialGraphGenerator orchestrator.
 * Requirements: 2.2, 2.3, 6.2, 6.3, 8.4, 8.5, 10.1, 11.1–11.5
 */
import { describe, expect, it } from "vitest";
import { CredentialGraphGenerator } from "../../src/generator/index.js";
import type { GenerationOutput, GeneratorError } from "../../src/generator/types.js";
import { validateJsonLd } from "../../src/validate/jsonld.js";
import { validateSchema } from "../../src/validate/schema.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isGeneratorError(result: unknown): result is GeneratorError {
  return (
    result !== null &&
    typeof result === "object" &&
    "ok" in result &&
    (result as GeneratorError).ok === false
  );
}

function isGenerationOutput(result: unknown): result is GenerationOutput {
  return (
    result !== null && typeof result === "object" && "credentials" in result && "coverage" in result
  );
}

// ---------------------------------------------------------------------------
// Suite 1: Config validation errors (Req 11.4)
// ---------------------------------------------------------------------------

describe("CredentialGraphGenerator – config validation errors", () => {
  const gen = new CredentialGraphGenerator();

  it("rejects maxDepth: -1 with GeneratorError containing ok: false", async () => {
    const result = await gen.generate({ maxDepth: -1 });

    expect(isGeneratorError(result)).toBe(true);
    const err = result as GeneratorError;
    expect(err.ok).toBe(false);
  });

  it("rejects maxDepth: -1 with fields array mentioning maxDepth", async () => {
    const result = await gen.generate({ maxDepth: -1 });

    const err = result as GeneratorError;
    expect(err.fields).toBeDefined();
    expect(Array.isArray(err.fields)).toBe(true);
    expect(err.fields!.length).toBeGreaterThan(0);
    const mentionsMaxDepth = err.fields!.some(
      (f) => f.field.toLowerCase().includes("maxdepth") || f.field === "maxDepth",
    );
    expect(mentionsMaxDepth).toBe(true);
  });

  it("rejects maxDepth: 11 with GeneratorError and fields array", async () => {
    const result = await gen.generate({ maxDepth: 11 });

    expect(isGeneratorError(result)).toBe(true);
    const err = result as GeneratorError;
    expect(err.ok).toBe(false);
    expect(err.fields).toBeDefined();
    expect(Array.isArray(err.fields)).toBe(true);
    expect(err.fields!.length).toBeGreaterThan(0);
  });

  it("rejects maxDepth: 5.5 (non-integer) with GeneratorError", async () => {
    const result = await gen.generate({ maxDepth: 5.5 });

    expect(isGeneratorError(result)).toBe(true);
    const err = result as GeneratorError;
    expect(err.ok).toBe(false);
    expect(err.fields).toBeDefined();
    expect(err.fields!.length).toBeGreaterThan(0);
  });

  it("rejects mode: 'invalid' with GeneratorError and fields array mentioning mode", async () => {
    // @ts-expect-error intentionally invalid mode
    const result = await gen.generate({ mode: "invalid" });

    expect(isGeneratorError(result)).toBe(true);
    const err = result as GeneratorError;
    expect(err.ok).toBe(false);
    expect(err.fields).toBeDefined();
    expect(Array.isArray(err.fields)).toBe(true);
    const mentionsMode = err.fields!.some((f) => f.field === "mode");
    expect(mentionsMode).toBe(true);
  });

  it("reports both field errors when maxDepth and mode are both invalid", async () => {
    // @ts-expect-error intentionally invalid mode
    const result = await gen.generate({ maxDepth: -1, mode: "invalid" });

    expect(isGeneratorError(result)).toBe(true);
    const err = result as GeneratorError;
    expect(err.ok).toBe(false);
    expect(err.fields).toBeDefined();
    // Both maxDepth and mode errors should be present
    expect(err.fields!.length).toBeGreaterThanOrEqual(2);
    const fields = err.fields!.map((f) => f.field);
    expect(fields).toContain("mode");
    const hasMaxDepth = fields.some(
      (f) => f.toLowerCase().includes("maxdepth") || f === "maxDepth",
    );
    expect(hasMaxDepth).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Suite 2: End-to-end minimal mode (Req 2.2, 2.3, 6.2, 11.1, 11.2)
// ---------------------------------------------------------------------------

describe("CredentialGraphGenerator – end-to-end minimal mode", () => {
  const gen = new CredentialGraphGenerator();
  let output: GenerationOutput;

  // Run once and reuse the result across tests in this suite
  it("generate({ mode: 'minimal' }) returns GenerationOutput with credentials array", async () => {
    const result = await gen.generate({ mode: "minimal" });

    expect(isGenerationOutput(result)).toBe(true);
    output = result as GenerationOutput;
    expect(Array.isArray(output.credentials)).toBe(true);
    expect(output.credentials.length).toBeGreaterThanOrEqual(1);
  }, 30000);

  it("generated credential document has @context as an array", async () => {
    const result = await gen.generate({ mode: "minimal" });
    const out = result as GenerationOutput;

    const doc = out.credentials[0].document;
    expect(Array.isArray(doc["@context"])).toBe(true);
  }, 30000);

  it("generated credential document has type as an array containing 'AchievementCredential'", async () => {
    const result = await gen.generate({ mode: "minimal" });
    const out = result as GenerationOutput;

    const doc = out.credentials[0].document;
    const types = doc.type as string[];
    expect(Array.isArray(types)).toBe(true);
    expect(types).toContain("AchievementCredential");
  }, 30000);

  it("generated credential document has id field that is a string", async () => {
    const result = await gen.generate({ mode: "minimal" });
    const out = result as GenerationOutput;

    const doc = out.credentials[0].document;
    expect(typeof doc.id).toBe("string");
    expect((doc.id as string).length).toBeGreaterThan(0);
  }, 30000);

  it("coverage report is present with exercisedClasses, exercisedProperties, exercisedEdges", async () => {
    const result = await gen.generate({ mode: "minimal" });
    const out = result as GenerationOutput;

    expect(out.coverage).toBeDefined();
    expect(out.coverage.exercisedClasses).toBeDefined();
    expect(typeof out.coverage.exercisedClasses.count).toBe("number");
    expect(typeof out.coverage.exercisedClasses.total).toBe("number");
    expect(typeof out.coverage.exercisedClasses.percentage).toBe("number");

    expect(out.coverage.exercisedProperties).toBeDefined();
    expect(typeof out.coverage.exercisedProperties.count).toBe("number");

    expect(out.coverage.exercisedEdges).toBeDefined();
    expect(typeof out.coverage.exercisedEdges.count).toBe("number");
  }, 30000);
});

// ---------------------------------------------------------------------------
// Suite 3: End-to-end full mode (Req 2.2, 2.3, 6.3)
// ---------------------------------------------------------------------------

describe("CredentialGraphGenerator – end-to-end full mode", () => {
  const gen = new CredentialGraphGenerator();

  it("generate({ mode: 'full', maxDepth: 3 }) succeeds and returns credentials", async () => {
    const result = await gen.generate({ mode: "full", maxDepth: 3 });

    expect(isGenerationOutput(result)).toBe(true);
    const out = result as GenerationOutput;
    expect(out.credentials.length).toBeGreaterThanOrEqual(1);
    expect(out.credentials[0].document).toBeDefined();
  }, 30000);
});

// ---------------------------------------------------------------------------
// Suite 4: Mermaid rendering (Req 8.4, 8.5)
// ---------------------------------------------------------------------------

describe("CredentialGraphGenerator – Mermaid rendering", () => {
  const gen = new CredentialGraphGenerator();

  it("mermaid is undefined by default (includeMermaid not set)", async () => {
    const result = await gen.generate({});

    expect(isGenerationOutput(result)).toBe(true);
    const out = result as GenerationOutput;
    expect(out.credentials[0].mermaid).toBeUndefined();
  }, 30000);

  it("mermaid is a non-empty string starting with 'flowchart TD' when includeMermaid: true", async () => {
    const result = await gen.generate({ includeMermaid: true });

    expect(isGenerationOutput(result)).toBe(true);
    const out = result as GenerationOutput;
    const mermaid = out.credentials[0].mermaid;
    expect(typeof mermaid).toBe("string");
    expect((mermaid as string).length).toBeGreaterThan(0);
    expect(mermaid as string).toMatch(/^flowchart TD/);
  }, 30000);
});

// ---------------------------------------------------------------------------
// Suite 5: Validation round-trip (Req 6.2, 6.3)
// ---------------------------------------------------------------------------

describe("CredentialGraphGenerator – validation round-trip", () => {
  const gen = new CredentialGraphGenerator();

  it("generated credential (minimal mode) passes validateSchema with zero severity:error entries", async () => {
    const result = await gen.generate({ mode: "minimal", seed: 42 });

    expect(isGenerationOutput(result)).toBe(true);
    const out = result as GenerationOutput;
    const doc = out.credentials[0].document;

    const schemaErrors = validateSchema(doc);
    const errorEntries = schemaErrors.filter((e) => e.severity === "error");
    expect(errorEntries).toHaveLength(0);
  }, 30000);

  it("generated credential (minimal mode) passes validateJsonLd with zero severity:error entries", async () => {
    const result = await gen.generate({ mode: "minimal", seed: 42 });

    expect(isGenerationOutput(result)).toBe(true);
    const out = result as GenerationOutput;
    const doc = out.credentials[0].document;

    const { errors: jsonldErrors } = await validateJsonLd(doc);
    const errorEntries = jsonldErrors.filter((e) => e.severity === "error");
    expect(errorEntries).toHaveLength(0);
  }, 30000);
});

// ---------------------------------------------------------------------------
// Suite 6: Seeded determinism (Req 10.1)
// ---------------------------------------------------------------------------

describe("CredentialGraphGenerator – seeded determinism", () => {
  const gen = new CredentialGraphGenerator();

  it("same config with same seed produces identical credential documents", async () => {
    const config = { mode: "minimal" as const, seed: 12345, maxDepth: 2 };

    const result1 = await gen.generate(config);
    const result2 = await gen.generate(config);

    expect(isGenerationOutput(result1)).toBe(true);
    expect(isGenerationOutput(result2)).toBe(true);

    const doc1 = (result1 as GenerationOutput).credentials[0].document;
    const doc2 = (result2 as GenerationOutput).credentials[0].document;

    expect(JSON.stringify(doc1)).toBe(JSON.stringify(doc2));
  }, 30000);
});

// ---------------------------------------------------------------------------
// Suite 7: Output structure (Req 11.1, 11.2, 11.7)
// ---------------------------------------------------------------------------

describe("CredentialGraphGenerator – output structure", () => {
  const gen = new CredentialGraphGenerator();

  it("result.version is '3.0.3'", async () => {
    const result = await gen.generate({ mode: "minimal" });

    expect(isGenerationOutput(result)).toBe(true);
    const out = result as GenerationOutput;
    expect(out.version).toBe("3.0.3");
  }, 30000);

  it("result.sources is an array containing an entry with url matching the OB3 context URL", async () => {
    const result = await gen.generate({ mode: "minimal" });

    expect(isGenerationOutput(result)).toBe(true);
    const out = result as GenerationOutput;

    expect(Array.isArray(out.sources)).toBe(true);
    expect(out.sources.length).toBeGreaterThan(0);

    const ob3ContextUrl = "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json";
    const hasOb3Source = out.sources.some((s) => s.url === ob3ContextUrl);
    expect(hasOb3Source).toBe(true);
  }, 30000);
});

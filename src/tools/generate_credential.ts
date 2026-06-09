import { z } from "zod";
import { CredentialGraphGenerator } from "../generator/index.js";
import type { GenerationOutput } from "../generator/types.js";

export const name = "generate_credential";
export const description =
  "Generate a representative OB3 AchievementCredential JSON-LD document by walking the type graph. " +
  "Optionally returns a Mermaid diagram of the traversal path and coverage metrics. " +
  "Reproducible output requires pinning `seed`, `mode`, and `maxDepth` together — " +
  "a `seed` alone reproduces output only for the same `mode` and `maxDepth`. " +
  "`targetClasses` narrows generation to specified OB3 classes (plus schema-required closure). " +
  "`attachProof` attaches a real Ed25519 DataIntegrityProof using a fresh ephemeral key, " +
  "so the determinism contract applies to the unsigned document.";

export const inputSchema = {
  maxDepth: z
    .number()
    .int()
    .min(0)
    .max(10)
    .optional()
    .describe("Traversal depth (0-10, default 3)"),
  mode: z
    .enum(["minimal", "full"])
    .optional()
    .describe(
      "Generation mode: minimal (required fields only) or full (all fields). Default: minimal",
    ),
  seed: z.number().int().optional().describe("Optional PRNG seed for deterministic output"),
  includeMermaid: z
    .boolean()
    .optional()
    .describe("Include Mermaid diagram of the traversal path (default false)"),
  contentMode: z
    .enum(["uuid", "realistic"])
    .optional()
    .describe(
      "Content mode: 'uuid' (default; fast spec-coverage with UUID values) or 'realistic' (faker-driven values for rendering-app testing)",
    ),
  targetClasses: z
    .array(z.string())
    .optional()
    .describe(
      "Optional subset of OB3 class names to target; only these classes (plus schema-required closure) will be populated",
    ),
  attachProof: z
    .boolean()
    .optional()
    .describe(
      "Attach a real Ed25519 DataIntegrityProof (eddsa-rdfc-2022) using a fresh ephemeral key (default false)",
    ),
};

export async function handler(args: {
  maxDepth?: number;
  mode?: "minimal" | "full";
  seed?: number;
  includeMermaid?: boolean;
  contentMode?: "uuid" | "realistic";
  targetClasses?: string[];
  attachProof?: boolean;
}) {
  const generator = new CredentialGraphGenerator();
  const result = await generator.generate(args);

  // Surface the bounded indicator when the output was truncated by the bounding utility
  if ("bounded" in result && (result as GenerationOutput).bounded) {
    const output = result as GenerationOutput;
    return {
      content: [
        { type: "text" as const, text: JSON.stringify({ ...output, bounded: true }, null, 2) },
      ],
    };
  }

  return {
    content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
  };
}

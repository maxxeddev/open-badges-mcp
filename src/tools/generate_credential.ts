import { z } from "zod";
import { CredentialGraphGenerator } from "../generator/index.js";

export const name = "generate_credential";
export const description =
  "Generate a representative OB3 AchievementCredential JSON-LD document by walking the type graph. Optionally returns a Mermaid diagram of the traversal path and coverage metrics.";

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
};

export async function handler(args: {
  maxDepth?: number;
  mode?: "minimal" | "full";
  seed?: number;
  includeMermaid?: boolean;
  contentMode?: "uuid" | "realistic";
}) {
  const generator = new CredentialGraphGenerator();
  const result = await generator.generate(args);

  return {
    content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
  };
}

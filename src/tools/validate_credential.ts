import { z } from "zod";
import { validateJsonLd } from "../validate/jsonld.js";
import { validateSchema } from "../validate/schema.js";
import type { ValidationResult } from "../validate/types.js";

export const name = "validate_credential";
export const description =
  "Validate a credential against the OB3 schema and JSON-LD structure. Supports schema-only, jsonld-only, or both validation modes.";
export const inputSchema = {
  json: z
    .union([z.object({}).passthrough(), z.string()])
    .describe("The credential as a JSON object or JSON string"),
  mode: z
    .enum(["schema", "jsonld", "both"])
    .optional()
    .describe("Validation mode: schema only, jsonld only, or both (default: both)"),
};

export async function handler(args: { json: unknown; mode?: string }) {
  // Parse JSON input if it's a string
  let doc: Record<string, unknown>;
  try {
    doc =
      typeof args.json === "string"
        ? JSON.parse(args.json)
        : (args.json as Record<string, unknown>);
  } catch {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              ok: false,
              errors: [{ path: "", message: "Invalid JSON input", severity: "error" }],
            },
            null,
            2,
          ),
        },
      ],
    };
  }

  const mode = args.mode ?? "both";
  const result: ValidationResult = { ok: true, errors: [] };

  if (mode === "schema" || mode === "both") {
    const schemaErrors = validateSchema(doc);
    result.errors.push(...schemaErrors);
  }

  if (mode === "jsonld" || mode === "both") {
    const { errors: jsonldErrors, expanded } = await validateJsonLd(doc);
    result.errors.push(...jsonldErrors);
    result.expanded = expanded;
  }

  result.ok = result.errors.filter((e) => e.severity === "error").length === 0;

  return {
    content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
  };
}

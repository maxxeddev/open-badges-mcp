import { z } from "zod";
import { validateCredential } from "../validate/orchestrator.js";

export const name = "validate_credential";
export const description =
  "Validate a credential against the OB3 schema, JSON-LD structure, and/or cryptographic signature. " +
  "Supports schema-only, jsonld-only, signature-only, both (schema + jsonld), or all validation modes. " +
  "Accepts single credentials, VerifiablePresentations, batch responses, and enveloped credentials.";
export const inputSchema = {
  json: z
    .union([z.object({}).passthrough(), z.string()])
    .describe("The credential (or wrapper/envelope) as a JSON object or JSON string"),
  mode: z
    .enum(["schema", "jsonld", "signature", "both", "all"])
    .optional()
    .describe(
      "Validation mode: schema only, jsonld only, signature only, both (schema + jsonld), or all (default: both)",
    ),
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
              results: [],
              decodeErrors: [{ index: 0, message: "Invalid JSON input" }],
            },
            null,
            2,
          ),
        },
      ],
    };
  }

  const mode = (args.mode ?? "both") as "schema" | "jsonld" | "signature" | "both" | "all";
  const result = await validateCredential(doc, mode);

  return {
    content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
  };
}

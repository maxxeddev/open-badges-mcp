import { z } from "zod";
import { getContextStore } from "../context/index.js";
import type { Source } from "../vocab/types.js";

export const name = "get_context";
export const description = "Retrieve the full JSON-LD context term-to-IRI mapping for OB3.";
export const inputSchema = {
  version: z.string().optional().describe("Context version (defaults to latest available)"),
};

export async function handler(_args: { version?: string }) {
  const ctx = getContextStore();

  const termToIri: Record<string, string> = {};
  for (const [term, iri] of ctx.termToIri) {
    termToIri[term] = iri;
  }

  const sources: Source[] = [
    {
      url: "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json",
      anchor: "context",
    },
  ];

  const result = {
    termToIri,
    rawContext: ctx.rawContext,
    sources,
  };

  return {
    content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
  };
}

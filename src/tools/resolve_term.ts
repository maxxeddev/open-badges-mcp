import { z } from "zod";
import { resolveTerm } from "../context/index.js";
import type { Source } from "../vocab/types.js";

export const name = "resolve_term";
export const description = "Resolve a JSON-LD term to its IRI or an IRI back to its term.";
export const inputSchema = {
  term_or_iri: z.string().describe("A JSON-LD term (e.g. 'achievement') or full IRI"),
};

export async function handler(args: { term_or_iri: string }) {
  const result = resolveTerm(args.term_or_iri);

  if (!result) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            error: `"${args.term_or_iri}" not found in term or IRI maps.`,
          }),
        },
      ],
    };
  }

  const sources: Source[] = [{ url: result.iri, anchor: result.term }];
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ ...result, sources }, null, 2),
      },
    ],
  };
}

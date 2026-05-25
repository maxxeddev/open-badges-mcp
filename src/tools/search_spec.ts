import { z } from "zod";
import { searchSpec } from "../spec/index.js";
import type { Source } from "../vocab/types.js";

export const name = "search_spec";
export const description =
  "Search the OB3 and VC spec prose by keyword using full-text search. Returns ranked excerpts with section anchors and deep-link URLs.";
export const inputSchema = {
  query: z.string().describe("The search query to match against spec prose"),
  spec: z.enum(["ob3", "vc"]).optional().describe("Filter results to a specific spec corpus"),
  limit: z.number().optional().describe("Maximum number of results to return (default: 10)"),
};

export async function handler(args: { query: string; spec?: "ob3" | "vc"; limit?: number }) {
  const results = await searchSpec(args.query, args.spec, args.limit ?? 10);

  const sources: Source[] = results.map((r) => ({
    url: r.url,
    anchor: r.anchor,
  }));

  const response = {
    results: results.map((r) => ({
      spec: r.spec,
      sectionId: r.sectionId,
      title: r.title,
      anchor: r.anchor,
      excerpt: r.excerpt,
      url: r.url,
      rank: r.rank,
    })),
    sources,
  };

  return {
    content: [{ type: "text" as const, text: JSON.stringify(response, null, 2) }],
  };
}

import { z } from "zod";
import { getMaxResponseBytes } from "../config.js";
import { listSections } from "../spec/index.js";
import { boundArray } from "../util/output-bounding.js";
import type { Source } from "../vocab/types.js";

const BASE_URLS: Record<string, string> = {
  ob3: "https://www.imsglobal.org/spec/ob/v3p0/",
  vc: "https://www.w3.org/TR/vc-data-model-2.0/",
};

export const name = "list_sections";
export const description =
  "Retrieve the table of contents for a spec as a nested structure reflecting parent-child section relationships.";
export const inputSchema = {
  spec: z.string().describe('The spec corpus to list sections for, e.g. "ob3" or "vc"'),
  continuationToken: z
    .string()
    .optional()
    .describe("Opaque token to retrieve the next page of results when output was bounded"),
};

export async function handler(args: { spec: string; continuationToken?: string }) {
  const toc = await listSections(args.spec);

  const baseUrl = BASE_URLS[args.spec] ?? BASE_URLS.ob3;
  const sources: Source[] = [{ url: baseUrl, anchor: "toc" }];

  // Flatten toc into an array for bounding (toc is already an array of section entries)
  const tocItems = Array.isArray(toc) ? toc : [toc];

  const bounded = boundArray(tocItems, { maxBytes: getMaxResponseBytes() }, args.continuationToken);

  if (!bounded.bounded) {
    const response = {
      spec: args.spec,
      toc: bounded.payload,
      sources,
    };
    return {
      content: [{ type: "text" as const, text: JSON.stringify(response, null, 2) }],
    };
  }

  const response = {
    spec: args.spec,
    toc: bounded.payload,
    bounded: true,
    continuationToken: bounded.continuationToken,
    omitted: bounded.omitted,
    ...(bounded.file ? { file: bounded.file } : {}),
    sources,
  };

  return {
    content: [{ type: "text" as const, text: JSON.stringify(response, null, 2) }],
  };
}

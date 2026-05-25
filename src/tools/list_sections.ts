import { z } from "zod";
import { listSections } from "../spec/index.js";
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
};

export async function handler(args: { spec: string }) {
  const toc = await listSections(args.spec);

  const baseUrl = BASE_URLS[args.spec] ?? BASE_URLS.ob3;
  const sources: Source[] = [{ url: baseUrl, anchor: "toc" }];

  const response = {
    spec: args.spec,
    toc,
    sources,
  };

  return {
    content: [{ type: "text" as const, text: JSON.stringify(response, null, 2) }],
  };
}

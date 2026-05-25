import { z } from "zod";
import { getSection } from "../spec/index.js";
import type { Source } from "../vocab/types.js";

const BASE_URLS: Record<string, string> = {
  ob3: "https://www.imsglobal.org/spec/ob/v3p0/",
  vc: "https://www.w3.org/TR/vc-data-model-2.0/",
};

function buildUrl(spec: string, anchor: string): string {
  const base = BASE_URLS[spec] ?? BASE_URLS.ob3;
  return `${base}#${anchor}`;
}

export const name = "get_section";
export const description =
  "Retrieve the full content of a specific spec section by ID, including breadcrumbs and optionally all child sections.";
export const inputSchema = {
  spec: z.string().describe("The spec corpus to search in, e.g. 'ob3' or 'vc'"),
  section_id: z.string().describe("The section ID to retrieve"),
  full: z
    .boolean()
    .optional()
    .describe("When true, return the section body plus all child section bodies as a subtree"),
};

export async function handler(args: { spec: string; section_id: string; full?: boolean }) {
  const result = await getSection(args.spec, args.section_id, args.full ?? false);

  if (!result) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            error: `Section "${args.section_id}" not found in spec "${args.spec}".`,
          }),
        },
      ],
    };
  }

  const url = buildUrl(result.spec, result.anchor);
  const sources: Source[] = [{ url, anchor: result.anchor }];

  const response: Record<string, unknown> = {
    spec: result.spec,
    sectionId: result.sectionId,
    title: result.title,
    anchor: result.anchor,
    breadcrumbs: result.breadcrumbs,
    body: result.body,
    sources,
  };

  if (result.children && result.children.length > 0) {
    response.children = result.children.map((child) => ({
      spec: child.spec,
      sectionId: child.sectionId,
      title: child.title,
      anchor: child.anchor,
      body: child.body,
    }));
  }

  return {
    content: [{ type: "text" as const, text: JSON.stringify(response, null, 2) }],
  };
}

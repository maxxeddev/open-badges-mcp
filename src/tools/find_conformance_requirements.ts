import { z } from "zod";
import { findConformanceRequirements } from "../spec/index.js";
import type { Source } from "../vocab/types.js";

const BASE_URLS: Record<string, string> = {
  ob3: "https://www.imsglobal.org/spec/ob/v3p0/",
  vc: "https://www.w3.org/TR/vc-data-model-2.0/",
};

function buildUrl(spec: string, anchor: string): string {
  const base = BASE_URLS[spec] ?? BASE_URLS.ob3;
  return `${base}#${anchor}`;
}

export const name = "find_conformance_requirements";
export const description =
  "Find normative requirements (MUST/SHOULD/MAY statements) by topic. Searches conformance sentences extracted from the OB3 and VC specs.";
export const inputSchema = {
  topic: z.string().describe("The topic to search for in conformance requirement sentences"),
  modal: z
    .enum(["MUST", "SHOULD", "MAY"])
    .optional()
    .describe("Filter results to a specific modal verb"),
};

export async function handler(args: { topic: string; modal?: "MUST" | "SHOULD" | "MAY" }) {
  const results = await findConformanceRequirements(args.topic, args.modal);

  const sources: Source[] = results.map((r) => ({
    url: buildUrl(r.spec, r.anchor),
    anchor: r.anchor,
  }));

  const response = {
    results: results.map((r) => ({
      sentence: r.sentence,
      modal: r.modal,
      sectionUrl: buildUrl(r.spec, r.anchor),
      topicTags: r.topicTags,
      spec: r.spec,
      sectionId: r.sectionId,
    })),
    sources,
  };

  return {
    content: [{ type: "text" as const, text: JSON.stringify(response, null, 2) }],
  };
}

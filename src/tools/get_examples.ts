import { z } from "zod";
import { getExamples } from "../spec/index.js";
import type { Source } from "../vocab/types.js";

export const name = "get_examples";
export const description =
  "Retrieve canonical JSON-LD examples for a given class or topic. When the input matches a vocab class name, returns examples using that class. Otherwise falls back to full-text search over example titles and section text.";
export const inputSchema = {
  class_or_topic: z
    .string()
    .describe("A vocab class name (e.g. 'AchievementCredential') or a topic to search for"),
  limit: z.number().optional().describe("Maximum number of examples to return (default: 5)"),
};

export async function handler(args: { class_or_topic: string; limit?: number }) {
  const results = await getExamples(args.class_or_topic, args.limit ?? 5);

  const sources: Source[] = results.map((ex) => ({
    url: `https://www.imsglobal.org/spec/ob/v3p0/#${ex.sectionId}`,
    anchor: ex.sectionId,
  }));

  const response = {
    examples: results.map((ex) => ({
      exampleId: ex.exampleId,
      title: ex.title,
      sectionId: ex.sectionId,
      anchor: ex.sectionId,
      code: ex.code,
      classesUsed: ex.classesUsed,
    })),
    sources,
  };

  return {
    content: [{ type: "text" as const, text: JSON.stringify(response, null, 2) }],
  };
}

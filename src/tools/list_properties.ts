import { z } from "zod";
import { getVocab } from "../vocab/index.js";
import type { Source } from "../vocab/types.js";

export const name = "list_properties";
export const description = "List all properties associated with a given OB3 class.";
export const inputSchema = {
  class_name: z.string().describe("The class name, e.g. 'Profile'"),
  required_only: z
    .boolean()
    .optional()
    .describe("Filter to required properties only (caveat: cardinality data not yet available)"),
};

export async function handler(args: { class_name: string; required_only?: boolean }) {
  const vocab = getVocab();
  const classRecord = vocab.classesByName.get(args.class_name);

  if (!classRecord) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            error: `Class "${args.class_name}" not found in the OB3 vocabulary.`,
          }),
        },
      ],
    };
  }

  const properties = classRecord.properties.map((p) => ({
    name: p.name,
    range: p.range,
    description: p.description,
  }));

  const result: Record<string, unknown> = { properties };

  if (args.required_only) {
    result.caveat =
      "Cardinality data is not yet available from the vocabulary source. Returning all properties.";
  }

  const sources: Source[] = [
    {
      url: `https://purl.imsglobal.org/spec/vc/ob/vocab.html#${args.class_name}`,
      anchor: args.class_name,
    },
  ];
  result.sources = sources;

  return {
    content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
  };
}

import { z } from "zod";
import { getClassRecord } from "../vocab/index.js";
import type { Source } from "../vocab/types.js";

export const name = "get_class";
export const description =
  "Get the full structured definition of an OB3 class including contextual property descriptions.";
export const inputSchema = {
  name: z.string().describe("The class name, e.g. 'AchievementCredential'"),
};

export async function handler(args: { name: string }) {
  const record = getClassRecord(args.name);

  if (!record) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            error: `Class "${args.name}" not found in the OB3 vocabulary.`,
          }),
        },
      ],
    };
  }

  const sources: Source[] = [
    {
      url: `https://purl.imsglobal.org/spec/vc/ob/vocab.html#${record.name}`,
      anchor: record.name,
    },
  ];

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            name: record.name,
            description: record.description,
            subClassOf: record.subClassOf,
            properties: record.properties,
            version: record.version,
            sources,
          },
          null,
          2,
        ),
      },
    ],
  };
}

import { z } from "zod";
import { getVocab } from "../vocab/index.js";
import type { Source } from "../vocab/types.js";

export const name = "get_property";
export const description =
  "Get the full definition of an OB3 property including all domain classes and contextual descriptions.";
export const inputSchema = {
  name: z.string().describe("The property name, e.g. 'alignment'"),
  on_class: z
    .string()
    .optional()
    .describe("Optional class name to filter the domain entry, e.g. 'Achievement'"),
};

export async function handler(args: { name: string; on_class?: string }) {
  const vocab = getVocab();
  const property = vocab.propertiesByName.get(args.name);

  if (!property) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            error: `Property "${args.name}" not found in the OB3 vocabulary.`,
          }),
        },
      ],
    };
  }

  if (args.on_class) {
    const domainEntry = property.domain.find((d) => d.className === args.on_class);

    if (!domainEntry) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              error: `Class "${args.on_class}" is not in the domain of property "${args.name}". Valid domain classes: ${property.domain.map((d) => d.className).join(", ")}.`,
            }),
          },
        ],
      };
    }

    const sources: Source[] = [
      {
        url: `https://purl.imsglobal.org/spec/vc/ob/vocab.html#${args.name}`,
        anchor: args.name,
      },
    ];

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              name: property.name,
              iri: property.iri,
              range: property.range,
              description: domainEntry.description || property.description,
              domain: [domainEntry],
              sources,
            },
            null,
            2,
          ),
        },
      ],
    };
  }

  const sources: Source[] = [
    {
      url: `https://purl.imsglobal.org/spec/vc/ob/vocab.html#${property.name}`,
      anchor: property.name,
    },
  ];

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            name: property.name,
            iri: property.iri,
            range: property.range,
            description: property.description,
            domain: property.domain,
            sources,
          },
          null,
          2,
        ),
      },
    ],
  };
}

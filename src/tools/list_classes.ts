import { getVocab } from "../vocab/index.js";
import type { Source } from "../vocab/types.js";

export const name = "list_classes";
export const description =
  "List all OB3 vocabulary classes with names, descriptions, and inheritance.";
export const inputSchema = {};

export async function handler() {
  const vocab = getVocab();
  const classes = Array.from(vocab.classesByName.values()).map((c) => ({
    name: c.name,
    description: c.description,
    subClassOf: c.subClassOf,
  }));

  const sources: Source[] = [
    {
      url: "https://purl.imsglobal.org/spec/vc/ob/vocab.html",
      anchor: "classes",
    },
  ];

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ classes, sources }, null, 2),
      },
    ],
  };
}

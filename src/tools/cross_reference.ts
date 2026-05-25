import { z } from "zod";
import { getContextStore } from "../context/index.js";
import { getExamples, searchSpec } from "../spec/index.js";
import type { CrossReferenceResult } from "../spec/types.js";
import { getVocab } from "../vocab/index.js";
import type { Source } from "../vocab/types.js";

export const name = "cross_reference";
export const description =
  "Find every place a term appears across vocab records, prose sections, context terms, and examples. Groups results by source type.";
export const inputSchema = {
  term: z.string().describe("The term to search for across vocab, prose, context, and examples"),
};

export async function handler(args: { term: string }) {
  const vocab = getVocab();
  const contextStore = getContextStore();
  const sources: Source[] = [];

  // 1. Vocab: exact match on class and property names
  const vocabResults: CrossReferenceResult["vocab"] = [];

  const classRecord = vocab.classesByName.get(args.term);
  if (classRecord) {
    const url = `https://purl.imsglobal.org/spec/vc/ob/vocab.html#${args.term}`;
    vocabResults.push({ name: args.term, kind: "class", url });
    sources.push({ url, anchor: args.term });
  }

  const propertyRecord = vocab.propertiesByName.get(args.term);
  if (propertyRecord) {
    const url = `https://purl.imsglobal.org/spec/vc/ob/vocab.html#${args.term}`;
    vocabResults.push({ name: args.term, kind: "property", url });
    sources.push({ url, anchor: args.term });
  }

  // 2. Context: exact match on term in termToIri map
  const contextResults: CrossReferenceResult["context"] = [];

  if (contextStore.termToIri.has(args.term)) {
    const iri = contextStore.termToIri.get(args.term)!;
    contextResults.push({ term: args.term, iri });
    sources.push({ url: iri, anchor: args.term });
  }

  // 3. Prose: FTS search (limit to 5 results)
  const proseResults = await searchSpec(args.term, undefined, 5);
  for (const r of proseResults) {
    sources.push({ url: r.url, anchor: r.anchor });
  }

  // 4. Examples: search by class or topic
  const exampleResults = await getExamples(args.term, 5);
  for (const ex of exampleResults) {
    const url = `https://www.imsglobal.org/spec/ob/v3p0/#${ex.sectionId}`;
    sources.push({ url, anchor: ex.sectionId });
  }

  const result: CrossReferenceResult & { sources: Source[] } = {
    vocab: vocabResults,
    prose: proseResults,
    context: contextResults,
    examples: exampleResults,
    sources,
  };

  return {
    content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
  };
}

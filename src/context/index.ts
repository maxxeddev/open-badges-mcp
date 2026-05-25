import { loadContext } from "./loader.js";
import type { ContextStore, TermResolution } from "./types.js";

let store: ContextStore | null = null;

export function getContextStore(): ContextStore {
  if (!store) {
    store = loadContext();
  }
  return store;
}

export function resolveTerm(termOrIri: string): TermResolution | null {
  const ctx = getContextStore();

  if (ctx.termToIri.has(termOrIri)) {
    const iri = ctx.termToIri.get(termOrIri)!;
    return {
      kind: "term",
      term: termOrIri,
      iri,
      definedIn: classifyOrigin(iri),
    };
  }

  if (ctx.iriToTerm.has(termOrIri)) {
    const term = ctx.iriToTerm.get(termOrIri)!;
    return {
      kind: "iri",
      term,
      iri: termOrIri,
      definedIn: classifyOrigin(termOrIri),
    };
  }

  return null;
}

function classifyOrigin(iri: string): "ob" | "vc" | "schema" | "other" {
  if (iri.includes("imsglobal.org") || iri.includes("purl.imsglobal.org")) return "ob";
  if (iri.includes("w3.org/2018/credentials")) return "vc";
  if (iri.includes("schema.org")) return "schema";
  return "other";
}

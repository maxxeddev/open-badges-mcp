export interface ContextStore {
  termToIri: Map<string, string>;
  iriToTerm: Map<string, string>;
  rawContext: Record<string, unknown>;
  version: string;
}

export interface TermResolution {
  kind: "term" | "iri";
  term: string;
  iri: string;
  definedIn: "ob" | "vc" | "schema" | "other";
}

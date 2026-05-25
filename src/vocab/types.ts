export type Range =
  | { kind: "datatype"; iri: string; curie: string; label: string }
  | { kind: "vocab-class"; iri: string; name: string }
  | { kind: "external"; iri: string; curie?: string; label: string }
  | { kind: "union"; members: Range[] };

export const KNOWN_PREFIXES: Record<string, string> = {
  "http://www.w3.org/2001/XMLSchema#": "xsd",
  "https://schema.org/": "schema",
  "http://schema.org/": "schema",
  "https://www.w3.org/2018/credentials#": "vc",
  "http://purl.org/dc/terms/": "dct",
  "https://purl.imsglobal.org/spec/ob/v3p0/vocab#": "ob",
};

export interface Source {
  url: string;
  anchor: string;
}

export interface PropertyRecord {
  name: string;
  iri: string;
  description: string;
  range: Range;
  domain: DomainEntry[];
  version: string;
}

export interface DomainEntry {
  className: string;
  description: string;
}

export interface ClassRecord {
  name: string;
  iri: string;
  description: string;
  subClassOf: string[];
  properties: PropertyOnClass[];
  version: string;
}

export interface PropertyOnClass {
  name: string;
  range: Range;
  description: string;
}

export interface Vocab {
  classesByName: Map<string, ClassRecord>;
  propertiesByName: Map<string, PropertyRecord>;
  version: string;
}

export interface Manifest {
  version: string;
  fetchDate: string;
  sources: { url: string; filename: string }[];
}

export interface Source {
  url: string;
  anchor: string;
}

export interface PropertyRecord {
  name: string;
  iri: string;
  description: string;
  range: string;
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
  range: string;
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

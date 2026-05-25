export interface Section {
  spec: string;
  sectionId: string;
  parentId: string | null;
  title: string;
  anchor: string;
  body: string;
  version: string;
}

export interface SectionSearchResult {
  spec: string;
  sectionId: string;
  title: string;
  anchor: string;
  excerpt: string;
  url: string;
  rank: number;
}

export interface SectionTocEntry {
  sectionId: string;
  title: string;
  children: SectionTocEntry[];
}

export interface Example {
  spec: string;
  exampleId: string;
  sectionId: string;
  title: string;
  code: string;
  classesUsed: string[];
  version: string;
}

export interface ConformanceRequirement {
  spec: string;
  sectionId: string;
  anchor: string;
  sentence: string;
  modal: "MUST" | "SHOULD" | "MAY";
  topicTags: string[];
}

export interface CrossReferenceResult {
  vocab: Array<{ name: string; kind: "class" | "property"; url: string }>;
  prose: SectionSearchResult[];
  context: Array<{ term: string; iri: string }>;
  examples: Example[];
}

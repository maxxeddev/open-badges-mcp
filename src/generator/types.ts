export type Cardinality = {
  minOccurs: 0 | 1; // 1 = required, 0 = optional
  maxOccurs: 1 | "unbounded"; // 'unbounded' = array form permitted
};

export type GraphEdge = {
  propertyName: string;
  targetClass: string; // name of target node in TypeGraph
  cardinality: Cardinality;
  isRequired: boolean; // minOccurs === 1
  isArray: boolean; // maxOccurs === 'unbounded'
};

export type GraphNode = {
  name: string;
  iri?: string; // from vocab, may be absent
  properties: Map<string, GraphEdge>; // keyed by propertyName
  rawSchema: Record<string, unknown>; // full $defs entry for scalar synthesis
};

export type TypeGraph = {
  nodes: Map<string, GraphNode>; // O(1) lookup by class name
  rootClass: string;
};

export type GenerationMode = "minimal" | "full";

export type GenerationConfig = {
  maxDepth?: number; // 0–10, default 3
  mode?: GenerationMode; // default 'minimal'
  seed?: number; // optional PRNG seed for determinism
  includeMermaid?: boolean; // default false
  rootClass?: string; // default 'AchievementCredential'
};

export type GeneratedCredential = {
  document: Record<string, unknown>; // the JSON-LD credential
  activePath: ActivePath;
  mermaid?: string;
};

export type ActivePath = {
  nodes: string[]; // ordered class names visited
  edges: Array<{ from: string; to: string; propertyName: string }>;
};

export type CoverageReport = {
  exercisedClasses: { count: number; total: number; percentage: number };
  exercisedProperties: { count: number; total: number; percentage: number };
  exercisedEdges: { count: number; total: number; percentage: number };
};

export type GenerationOutput = {
  credentials: GeneratedCredential[];
  coverage: CoverageReport;
  version: string;
  sources: Array<{ url: string; anchor: string }>;
};

export type GeneratorError = {
  ok: false;
  error: string;
  path?: string[]; // ordered class/property names from root to failure
  fields?: Array<{ field: string; reason: string }>; // for config validation
};

export type GeneratorResult = GenerationOutput | GeneratorError;

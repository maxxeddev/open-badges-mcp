/**
 * Credential Synthesizer — PRNG, value-generators registry, and synthesis logic.
 *
 * This file implements:
 *  - mulberry32: a fast, pure-JS seeded PRNG
 *  - createRand: convenience factory for the PRNG
 *  - ValueGenerator: type for all schema-to-value functions
 *  - buildValueGenerators: builds the discriminator → ValueGenerator registry
 *  - CredentialSynthesizer: converts an ActivePath into a JSON-LD credential document
 *
 * Requirements: 3.2, 3.3, 3.4, 3.6, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 6.1, 6.4, 10.2, 10.3, 12.2
 */

import type { ActivePath, GenerationMode, GeneratorError, TypeGraph } from "./types.js";

// ---------------------------------------------------------------------------
// PRNG
// ---------------------------------------------------------------------------

/**
 * Mulberry32 seeded PRNG. Returns a `() => number` that produces uniformly
 * distributed floats in [0, 1) for a given integer seed.
 *
 * The implementation is a pure-JS, dependency-free 32-bit PRNG with good
 * statistical properties for generative testing.
 */
function mulberry32(seed: number): () => number {
  let s = seed;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Creates a `() => number` PRNG.
 *
 * - When `seed` is provided the output is fully deterministic (mulberry32).
 * - When `seed` is omitted a random seed is chosen once and the resulting
 *   function is returned — subsequent calls to the _same_ returned function
 *   are still deterministic, but two separate calls to `createRand()` without
 *   a seed will differ.
 */
export function createRand(seed?: number): () => number {
  const s = seed !== undefined ? seed : Math.floor(Math.random() * 0xffffffff);
  return mulberry32(s);
}

// ---------------------------------------------------------------------------
// Value generator type
// ---------------------------------------------------------------------------

/**
 * A function that produces a synthetic value for a single JSON Schema leaf.
 *
 * @param rand  - The seeded `() => number` PRNG shared across the whole run.
 * @param schema - The raw JSON Schema fragment for the property being synthesized.
 */
export type ValueGenerator = (rand: () => number, schema: Record<string, unknown>) => unknown;

// ---------------------------------------------------------------------------
// UUID helper
// ---------------------------------------------------------------------------

/**
 * Generates a UUID-like string.
 *
 * When the global `crypto.randomUUID` is available (Node 20+ / modern browsers)
 * it is used directly. Otherwise a deterministic UUID-like hex string is
 * built from the PRNG output so that seeded runs remain deterministic.
 */
function generateUuid(rand: () => number): string {
  // Use the crypto API only when we're in unseeded mode (rand is backed by
  // Math.random internally, so the two are equivalent). When a seed was
  // provided the caller passes the mulberry32 function and we must use it for
  // determinism.
  //
  // Because we cannot tell from the function reference whether it came from
  // Math.random or mulberry32, we always use the PRNG for consistency.
  const hex = (bits: number): string => {
    let result = "";
    for (let i = 0; i < bits / 4; i++) {
      result += Math.floor(rand() * 16).toString(16);
    }
    return result;
  };

  return `${hex(32)}-${hex(16)}-4${hex(12)}-${(Math.floor(rand() * 4) + 8).toString(16)}${hex(12)}-${hex(48)}`;
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

/**
 * Produces a plausible ISO-8601 date string like "2024-01-15".
 * The year is fixed to 2024 for readability; the month/day vary with the PRNG.
 */
function generateDate(rand: () => number): string {
  const month = Math.floor(rand() * 12) + 1;
  const day = Math.floor(rand() * 28) + 1;
  return `2024-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Produces a plausible ISO-8601 datetime string like "2024-01-15T12:00:00Z".
 */
function generateDateTime(rand: () => number): string {
  const date = generateDate(rand);
  const hour = Math.floor(rand() * 24);
  const minute = Math.floor(rand() * 60);
  const second = Math.floor(rand() * 60);
  return `${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}Z`;
}

// ---------------------------------------------------------------------------
// Value-generators registry
// ---------------------------------------------------------------------------

/**
 * Builds the discriminator → ValueGenerator registry.
 *
 * The registry is a `Map<string, ValueGenerator>` keyed by a discriminator
 * string that encodes the JSON Schema field used to pick the generator:
 *
 *   "type:string"       → random UUID-based string
 *   "type:boolean"      → true / false
 *   "type:number"       → random float
 *   "format:uri"        → https://example.org/{uuid}
 *   "format:date-time"  → ISO-8601 datetime
 *   "format:date"       → ISO-8601 date
 *   "pattern:CompactJws"→ header.payload.signature stub
 *   "enum"              → random element from schema.enum array
 *   "const"             → the schema.const value
 *
 * The `rand` parameter is threaded through every generator so the full PRNG
 * sequence is deterministic for a given seed (Requirements 5.4, 5.5, 10.4).
 */
export function buildValueGenerators(rand: () => number): Map<string, ValueGenerator> {
  const registry = new Map<string, ValueGenerator>();

  // type:string — random UUID-based string
  registry.set("type:string", (r) => generateUuid(r));

  // type:boolean — random true/false
  registry.set("type:boolean", (r) => r() >= 0.5);

  // type:number — random float in [0, 1000)
  registry.set("type:number", (r) => r() * 1000);

  // format:uri — https://example.org/{uuid}
  registry.set("format:uri", (r) => `https://example.org/${generateUuid(r)}`);

  // format:date-time — ISO-8601 datetime
  registry.set("format:date-time", (r) => generateDateTime(r));

  // format:date — ISO-8601 date
  registry.set("format:date", (r) => generateDate(r));

  // pattern:CompactJws — compact JWS stub
  registry.set("pattern:CompactJws", (_r) => "eyJhbGciOiJFZERTQSJ9.e30.signature");

  // pattern:LanguageCode — BCP47 language code
  registry.set("pattern:LanguageCode", () => "en");

  // enum — random selection from the schema's enum array
  registry.set("enum", (r, schema) => {
    const values = schema.enum as unknown[];
    if (!Array.isArray(values) || values.length === 0) return null;
    return values[Math.floor(r() * values.length)];
  });

  // const — the fixed constant value
  registry.set("const", (_r, schema) => schema.const);

  // Bind rand into each generator so callers can invoke with just (schema)
  // by returning a pre-bound helper. We keep the original signatures intact
  // and expose a convenience wrapper below.
  void rand; // prevent unused-variable lint warning; rand is captured via closure

  return registry;
}

/**
 * Looks up the appropriate discriminator key for a given JSON Schema fragment.
 *
 * Priority (highest to lowest):
 *  1. `const`
 *  2. `enum`
 *  3. `pattern` — only "CompactJws" recognized
 *  4. `format`  — uri, date-time, date
 *  5. `type`    — string, boolean, number
 *
 * Returns `undefined` when no generator is registered for the schema.
 */
export function discriminatorFor(schema: Record<string, unknown>): string | undefined {
  if ("const" in schema) return "const";
  if ("enum" in schema) return "enum";
  if (
    typeof schema.pattern === "string" &&
    (schema.pattern.includes("CompactJws") ||
      // OB3 JWS pattern: the actual regex pattern in the schema
      schema.pattern === "^[a-zA-Z0-9_-]+\\.[a-zA-Z0-9_-]*\\.[a-zA-Z0-9_-]+$")
  ) {
    return "pattern:CompactJws";
  }
  // Also detect via $comment (used in OB3 schema to identify CompactJws types)
  if (typeof schema.$comment === "string" && schema.$comment.includes("CompactJws")) {
    return "pattern:CompactJws";
  }
  // BCP47 language code pattern
  if (
    typeof schema.pattern === "string" &&
    schema.pattern === "^[a-z]{2,4}(-[A-Z][a-z]{3})?(-([A-Z]{2}|[0-9]{3}))?$"
  ) {
    return "pattern:LanguageCode";
  }
  if (typeof schema.$comment === "string" && schema.$comment.includes("LanguageCode")) {
    return "pattern:LanguageCode";
  }
  if (typeof schema.format === "string") {
    const key = `format:${schema.format}`;
    // Only return keys we actually have generators for.
    const supported = new Set(["format:uri", "format:date-time", "format:date"]);
    if (supported.has(key)) return key;
  }
  if (typeof schema.type === "string") {
    const key = `type:${schema.type}`;
    const supported = new Set(["type:string", "type:boolean", "type:number"]);
    if (supported.has(key)) return key;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// CredentialSynthesizer
// ---------------------------------------------------------------------------

/**
 * Well-known class names that have a fixed OB3 `type` value.
 * Used to inject the correct type string for nested objects.
 *
 * Note: Some classes require a single IRI string (e.g. Image → "Image"),
 * while credential-like classes require an unordered set array.
 */
const CLASS_TYPE_VALUES: Record<string, string | string[]> = {
  AchievementCredential: ["VerifiableCredential", "AchievementCredential"],
  EndorsementCredential: ["VerifiableCredential", "EndorsementCredential"],
  AchievementSubject: ["AchievementSubject"],
  Achievement: ["Achievement"],
  Profile: ["Profile"],
  EndorsementSubject: ["EndorsementSubject"],
  Evidence: ["Evidence"],
  IdentityObject: "IdentityObject", // schema requires single string IRI
  Image: "Image", // schema requires single string IRI ("MUST be the IRI 'Image'")
  Result: ["Result"],
  ResultDescription: ["ResultDescription"],
  Alignment: ["Alignment"],
  RubricCriterionLevel: ["RubricCriterionLevel"],
  Related: ["Related"],
  Address: ["Address"],
  GeoCoordinates: "GeoCoordinates", // schema requires single string IRI
  Proof: "DataIntegrityProof", // schema requires single string IRI
  CredentialSchema: "1EdTechJsonSchemaValidator2019", // schema requires single string IRI
  CredentialStatus: "StatusList2021Entry", // schema requires single string IRI
  RefreshService: "1EdTechCredentialRefresh", // schema requires single string IRI
  TermsOfUse: "TrustFrameworkPolicy", // schema requires single string IRI
  IdentifierEntry: "IdentifierEntry", // schema requires single string IRI
};

/**
 * Hardcoded @context for generated AchievementCredentials (Req 6.4).
 */
const OB3_CONTEXT = [
  "https://www.w3.org/ns/credentials/v2",
  "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json",
];

/**
 * Detects the "URI-or-object" pattern in a class's rawSchema.
 *
 * A class node is a URI-or-object type when its rawSchema uses `anyOf` with
 * two variants: one is a `$ref` (object form) and one is a URI string form.
 * This matches the ProfileRef pattern in the OB3 schema.
 *
 * Returns the $ref target class name if the pattern matches, or null.
 */
function detectUriOrObjectClass(rawSchema: Record<string, unknown>): string | null {
  if (!Array.isArray(rawSchema.anyOf)) return null;

  let hasRef = false;
  let hasStringVariant = false;

  for (const variant of rawSchema.anyOf as unknown[]) {
    if (!variant || typeof variant !== "object") continue;
    const v = variant as Record<string, unknown>;

    if (typeof v.$ref === "string") {
      hasRef = true;
      continue;
    }

    // Check for a URI string variant (oneOf with type: "string" or direct type: "string")
    if (v.type === "string") {
      hasStringVariant = true;
      continue;
    }
    if (Array.isArray(v.oneOf)) {
      for (const inner of v.oneOf as unknown[]) {
        if (inner && typeof inner === "object") {
          const iv = inner as Record<string, unknown>;
          if (iv.type === "string") {
            hasStringVariant = true;
            break;
          }
        }
      }
    }
  }

  return hasRef && hasStringVariant ? "uri-or-object" : null;
}

/**
 * Resolves the $ref target class from a `anyOf` URI-or-object schema.
 * Returns the class name of the object variant, or null.
 */
function resolveUriOrObjectRefClass(rawSchema: Record<string, unknown>): string | null {
  if (!Array.isArray(rawSchema.anyOf)) return null;
  for (const variant of rawSchema.anyOf as unknown[]) {
    if (!variant || typeof variant !== "object") continue;
    const v = variant as Record<string, unknown>;
    if (typeof v.$ref === "string") {
      const match = v.$ref.match(/^#\/\$defs\/(.+)$/);
      if (match) return match[1];
    }
  }
  return null;
}

/**
 * Extracts the leaf schema for a property in a rawSchema.
 *
 * Many OB3 properties use `oneOf [ {type: "string"}, {type: "object", ...} ]`
 * to support language-map forms. We prefer the `{type: "string"}` variant
 * for simple scalar synthesis.
 *
 * Returns the simplest scalar schema fragment for synthesis, or null if
 * the property has no recognizable scalar form.
 */
function extractScalarSchema(propValue: unknown): Record<string, unknown> | null {
  if (!propValue || typeof propValue !== "object") return null;
  const prop = propValue as Record<string, unknown>;

  // Direct scalar fields (type, format, pattern, enum, const)
  if (prop.type === "string" || prop.type === "boolean" || prop.type === "number") {
    return prop;
  }
  if ("const" in prop || "enum" in prop) {
    return prop;
  }

  // oneOf: prefer first variant that has a type we can handle
  if (Array.isArray(prop.oneOf)) {
    for (const variant of prop.oneOf as unknown[]) {
      const scalar = extractScalarSchema(variant);
      if (scalar) return scalar;
    }
  }

  // anyOf: prefer first variant that has a type we can handle
  if (Array.isArray(prop.anyOf)) {
    for (const variant of prop.anyOf as unknown[]) {
      const scalar = extractScalarSchema(variant);
      if (scalar) return scalar;
    }
  }

  // allOf: try each sub-schema (for complex constructs)
  if (Array.isArray(prop.allOf)) {
    for (const variant of prop.allOf as unknown[]) {
      const scalar = extractScalarSchema(variant);
      if (scalar) return scalar;
    }
  }

  return null;
}

/**
 * CredentialSynthesizer converts an ActivePath into a concrete JSON-LD
 * AchievementCredential document.
 *
 * Synthesis rules:
 * - `minimal` mode: required properties only
 * - `full` mode: all properties
 * - Required nested objects always synthesized even at maxDepth (Req 3.2, 3.4)
 * - URI-string vs nested-object form for ProfileRef-style properties (Req 3.3, 3.6)
 * - Array properties: 1–5 elements via PRNG (Req 5.2)
 * - Inject hardcoded @context, type, id at root level (Req 6.4)
 * - Return GeneratorError with path when no value generator found (Req 12.2)
 */
export class CredentialSynthesizer {
  private readonly generators: Map<string, ValueGenerator>;

  constructor(
    private readonly graph: TypeGraph,
    private readonly config: { maxDepth: number; mode: "minimal" | "full" },
    private readonly rand: () => number,
  ) {
    this.generators = buildValueGenerators(rand);
  }

  /**
   * Synthesize a credential document from the root class of the TypeGraph,
   * guided by the provided active path.
   *
   * Returns a plain JSON-LD object or a GeneratorError.
   */
  synthesize(_activePath: ActivePath): Record<string, unknown> | GeneratorError {
    const rootClass = this.graph.rootClass;
    const rootNode = this.graph.nodes.get(rootClass);
    if (!rootNode) {
      return {
        ok: false as const,
        error: `Root class not found in TypeGraph: ${rootClass}`,
        path: [rootClass],
      };
    }

    const result = this._synthesizeNode(rootClass, 0, [rootClass]);
    if (this._isError(result)) return result;

    const doc = result as Record<string, unknown>;

    // Inject hardcoded root-level fields (Req 6.4, design spec step 6)
    const uuid = this._generateUuid();
    doc["@context"] = OB3_CONTEXT;
    doc.type = CLASS_TYPE_VALUES[rootClass] ?? [rootClass];
    doc.id = `https://example.org/credentials/${uuid}`;

    return doc;
  }

  /**
   * Synthesize a single node (class instance) at the given depth.
   *
   * @param className - the class name to synthesize
   * @param depth     - current depth (root = 0)
   * @param pathStack - class names from root to current (for error context)
   */
  private _synthesizeNode(
    className: string,
    depth: number,
    pathStack: string[],
  ): Record<string, unknown> | GeneratorError {
    const node = this.graph.nodes.get(className);
    if (!node) {
      // Class not in graph — emit minimal placeholder
      return {};
    }

    const doc: Record<string, unknown> = {};
    const rawProps = (node.rawSchema.properties as Record<string, unknown>) ?? {};
    const required: string[] = Array.isArray(node.rawSchema.required)
      ? (node.rawSchema.required as string[])
      : [];

    const mode: GenerationMode = this.config.mode;

    // --- Determine which properties to include ---
    let propsToInclude: string[];
    if (mode === "minimal") {
      propsToInclude = required;
    } else {
      propsToInclude = Object.keys(rawProps);
    }

    for (const propName of propsToInclude) {
      const isRequired = required.includes(propName);

      // Skip @context, type, id at root level — injected separately
      if (depth === 0 && (propName === "@context" || propName === "type" || propName === "id")) {
        continue;
      }

      const propValue = rawProps[propName];

      // --- Check if this property has a GraphEdge (object-valued) ---
      const edge = node.properties.get(propName);

      if (edge) {
        // Object-valued property
        const targetClass = edge.targetClass;
        const targetNode = this.graph.nodes.get(targetClass);

        // Check if target is a URI-or-object class (ProfileRef pattern)
        const isUriOrObject = targetNode && detectUriOrObjectClass(targetNode.rawSchema) !== null;

        if (isUriOrObject) {
          // ProfileRef pattern (Req 3.3, 3.6)
          if (depth >= this.config.maxDepth) {
            // Emit URI form at >= maxDepth (Req 3.6)
            const uriValue = `https://example.org/${this._generateUuid()}`;
            if (edge.isArray) {
              const count = this._arrayCount();
              doc[propName] = Array.from(
                { length: count },
                () => `https://example.org/${this._generateUuid()}`,
              );
            } else {
              doc[propName] = uriValue;
            }
          } else {
            // Emit nested object form below maxDepth (Req 3.3)
            const refClass = resolveUriOrObjectRefClass(targetNode.rawSchema);
            if (refClass) {
              const nested = this._synthesizeNode(refClass, depth + 1, [
                ...pathStack,
                propName,
                refClass,
              ]);
              if (this._isError(nested)) return nested;
              if (edge.isArray) {
                const count = this._arrayCount();
                const arr = [nested];
                for (let i = 1; i < count; i++) {
                  const extra = this._synthesizeNode(refClass, depth + 1, [
                    ...pathStack,
                    propName,
                    refClass,
                  ]);
                  if (this._isError(extra)) return extra;
                  arr.push(extra as Record<string, unknown>);
                }
                doc[propName] = arr;
              } else {
                doc[propName] = nested;
              }
            } else {
              // Fallback to URI if we can't resolve the ref
              doc[propName] = `https://example.org/${this._generateUuid()}`;
            }
          }
        } else {
          // Standard object-valued property
          if (depth >= this.config.maxDepth) {
            if (isRequired) {
              // Req 3.2, 3.4: populate required nested objects even at maxDepth
              // but only with required scalar fields
              const minimal = this._synthesizeNodeMinimal(targetClass, [
                ...pathStack,
                propName,
                targetClass,
              ]);
              if (this._isError(minimal)) return minimal;
              if (edge.isArray) {
                doc[propName] = [minimal];
              } else {
                doc[propName] = minimal;
              }
            } else {
              // Optional at maxDepth — skip (Req 3.5)
              if (mode === "full") {
                // full mode: skip optional objects at/beyond maxDepth
              }
            }
          } else {
            // depth < maxDepth: recurse normally
            const nested = this._synthesizeNode(targetClass, depth + 1, [
              ...pathStack,
              propName,
              targetClass,
            ]);
            if (this._isError(nested)) return nested;
            if (edge.isArray) {
              const count = this._arrayCount();
              const arr = [nested];
              for (let i = 1; i < count; i++) {
                const extra = this._synthesizeNode(targetClass, depth + 1, [
                  ...pathStack,
                  propName,
                  targetClass,
                ]);
                if (this._isError(extra)) return extra;
                arr.push(extra as Record<string, unknown>);
              }
              doc[propName] = arr;
            } else {
              doc[propName] = nested;
            }
          }
        }
      } else {
        // Scalar property — use value generators
        // Check for array wrapping via oneOf [$ref, {type: "array", items: {$ref}}]
        // For scalar properties, check if the property's oneOf has an array variant
        const isArrayScalar = this._isArrayScalarProperty(propValue);

        const scalarSchema = extractScalarSchema(propValue);

        if (!scalarSchema) {
          // No recognizable scalar schema — skip (e.g. complex @context definitions)
          continue;
        }

        const discriminator = discriminatorFor(scalarSchema);

        if (discriminator === undefined) {
          // No value generator found for this type (Req 12.2)
          if (isRequired) {
            return {
              ok: false as const,
              error: `No value generator for schema at ${className}.${propName}`,
              path: [...pathStack, propName],
            };
          }
          // Optional property with unknown type — skip gracefully
          continue;
        }

        const generator = this.generators.get(discriminator);
        if (!generator) {
          if (isRequired) {
            return {
              ok: false as const,
              error: `No value generator for discriminator ${discriminator} at ${className}.${propName}`,
              path: [...pathStack, propName],
            };
          }
          continue;
        }

        if (isArrayScalar) {
          const count = this._arrayCount();
          doc[propName] = Array.from({ length: count }, () => generator(this.rand, scalarSchema));
        } else {
          doc[propName] = generator(this.rand, scalarSchema);
        }
      }
    }

    // Inject type value for nested classes (not root — root type is injected externally)
    if (depth > 0 && className in CLASS_TYPE_VALUES) {
      const typeVal = CLASS_TYPE_VALUES[className];
      doc.type = typeVal;
    }

    return doc;
  }

  /**
   * Synthesize only required scalar fields for a class node.
   * Used when populating required nested objects at maxDepth (Req 3.4).
   */
  private _synthesizeNodeMinimal(
    className: string,
    pathStack: string[],
    visited?: Set<string>,
  ): Record<string, unknown> | GeneratorError {
    const node = this.graph.nodes.get(className);
    if (!node) return {};

    const doc: Record<string, unknown> = {};
    const rawProps = (node.rawSchema.properties as Record<string, unknown>) ?? {};
    const required: string[] = Array.isArray(node.rawSchema.required)
      ? (node.rawSchema.required as string[])
      : [];

    for (const propName of required) {
      const propValue = rawProps[propName];
      const edge = node.properties.get(propName);

      if (edge) {
        // Required object-valued — emit a URI placeholder to avoid deep recursion
        const targetNode = this.graph.nodes.get(edge.targetClass);
        const isUriOrObject = targetNode && detectUriOrObjectClass(targetNode.rawSchema) !== null;
        if (isUriOrObject) {
          doc[propName] = `https://example.org/${this._generateUuid()}`;
        } else {
          // Recursively populate required fields of the target class.
          const requiredOnlyVisited = visited ?? new Set<string>();
          if (requiredOnlyVisited.has(edge.targetClass)) {
            // Cycle on required edges (shouldn't happen in OB3 3.0.3 but defend).
            doc[propName] = {
              id: `https://example.org/${this._generateUuid()}`,
              type: [edge.targetClass],
            };
          } else {
            requiredOnlyVisited.add(edge.targetClass);
            const nested = this._synthesizeNodeMinimal(
              edge.targetClass,
              [...pathStack, propName, edge.targetClass],
              requiredOnlyVisited,
            );
            requiredOnlyVisited.delete(edge.targetClass);
            if (this._isError(nested)) return nested;
            doc[propName] = edge.isArray ? [nested] : nested;
          }
        }
      } else {
        // Scalar
        const scalarSchema = extractScalarSchema(propValue);
        if (!scalarSchema) continue;
        const discriminator = discriminatorFor(scalarSchema);
        if (discriminator === undefined) {
          return {
            ok: false as const,
            error: `No value generator for schema at ${className}.${propName}`,
            path: [...pathStack, propName],
          };
        }
        const generator = this.generators.get(discriminator);
        if (!generator) {
          return {
            ok: false as const,
            error: `No value generator for discriminator ${discriminator} at ${className}.${propName}`,
            path: [...pathStack, propName],
          };
        }
        doc[propName] = generator(this.rand, scalarSchema);
      }
    }

    // Inject type for well-known classes
    if (className in CLASS_TYPE_VALUES) {
      doc.type = CLASS_TYPE_VALUES[className];
    }

    return doc;
  }

  /**
   * Determines if a scalar property schema has an array variant.
   * Detects the `oneOf [ scalar, { type: "array", items: scalar } ]` pattern.
   */
  private _isArrayScalarProperty(propValue: unknown): boolean {
    if (!propValue || typeof propValue !== "object") return false;
    const prop = propValue as Record<string, unknown>;

    if (!Array.isArray(prop.oneOf)) return false;

    for (const variant of prop.oneOf as unknown[]) {
      if (!variant || typeof variant !== "object") continue;
      const v = variant as Record<string, unknown>;
      if (v.type === "array") return true;
    }
    return false;
  }

  /** Generate 1–5 array elements using the PRNG (Req 5.2). */
  private _arrayCount(): number {
    return Math.floor(this.rand() * 5) + 1;
  }

  /** Generate a UUID-like string using the PRNG. */
  private _generateUuid(): string {
    return generateUuid(this.rand);
  }

  private _isError(val: unknown): val is GeneratorError {
    return val !== null && typeof val === "object" && (val as Record<string, unknown>).ok === false;
  }
}

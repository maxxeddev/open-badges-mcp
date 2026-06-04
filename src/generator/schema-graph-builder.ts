import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveSnapshotPath } from "../config.js";
import type { Vocab } from "../vocab/types.js";
import type { GeneratorError, GraphEdge, GraphNode, TypeGraph } from "./types.js";

export type BuildResult = TypeGraph | GeneratorError;

// Represents the raw JSON Schema structure we read from the file
interface JsonSchema {
  $defs?: Record<string, JsonSchemaEntry>;
  properties?: Record<string, unknown>;
  required?: string[];
  [key: string]: unknown;
}

interface JsonSchemaEntry {
  description?: string;
  type?: string;
  properties?: Record<string, unknown>;
  required?: string[];
  [key: string]: unknown;
}

/**
 * Extracts the class name from a $ref string like "#/$defs/ClassName"
 */
function extractRefName(ref: string): string | null {
  const match = ref.match(/^#\/\$defs\/(.+)$/);
  return match ? match[1] : null;
}

/**
 * Attempts to extract a $ref class name from a property value in the JSON Schema.
 * Handles:
 *   - Direct $ref: { "$ref": "#/$defs/ClassName" }
 *   - oneOf with single $ref and array: [ { "$ref": ... }, { "type": "array", "items": { "$ref": ... } } ]
 *
 * Returns { refName, isArray } or null if no $ref found.
 */
function extractRefFromProperty(
  propValue: unknown,
): { refName: string; isArray: boolean } | null {
  if (!propValue || typeof propValue !== "object") return null;

  const prop = propValue as Record<string, unknown>;

  // Direct $ref
  if (typeof prop.$ref === "string") {
    const refName = extractRefName(prop.$ref);
    if (refName) return { refName, isArray: false };
  }

  // oneOf array: look for [$ref, {type: "array", items: {$ref}}] pattern
  if (Array.isArray(prop.oneOf)) {
    let singleRef: string | null = null;
    let arrayRef: string | null = null;

    for (const variant of prop.oneOf as unknown[]) {
      if (!variant || typeof variant !== "object") continue;
      const v = variant as Record<string, unknown>;

      // Direct $ref variant
      if (typeof v.$ref === "string") {
        const r = extractRefName(v.$ref);
        if (r) singleRef = r;
        continue;
      }

      // Array variant: { type: "array", items: { $ref: "..." } }
      if (v.type === "array" && v.items && typeof v.items === "object") {
        const items = v.items as Record<string, unknown>;
        if (typeof items.$ref === "string") {
          const r = extractRefName(items.$ref);
          if (r) arrayRef = r;
        }
      }
    }

    // oneOf [ $ref, { type: "array", items: { $ref } } ] — canonical array-or-single pattern
    if (singleRef && arrayRef && singleRef === arrayRef) {
      return { refName: singleRef, isArray: true };
    }
    // oneOf with only a single $ref
    if (singleRef && !arrayRef) {
      return { refName: singleRef, isArray: false };
    }
    // oneOf with only an array $ref (no single variant)
    if (arrayRef && !singleRef) {
      return { refName: arrayRef, isArray: true };
    }
  }

  return null;
}

/**
 * Resolves a class entry from the schema.
 * The root class (e.g. AchievementCredential) is the top-level schema itself,
 * while all other classes live in $defs.
 */
function resolveClassEntry(
  schema: JsonSchema,
  className: string,
  rootClass: string,
): JsonSchemaEntry | undefined {
  if (className === rootClass) {
    // The root class is represented by the top-level schema object
    return schema as JsonSchemaEntry;
  }
  return schema.$defs?.[className];
}

export class SchemaGraphBuilder {
  private vocab: Vocab | undefined;

  constructor(vocab?: Vocab) {
    this.vocab = vocab;
  }

  build(rootClass = "AchievementCredential"): BuildResult {
    // --- Step 1: Load the JSON Schema file ---
    let schema: JsonSchema;
    let schemaPath: string;

    try {
      const snapshotDir = resolveSnapshotPath();
      schemaPath = join(snapshotDir, "achievement-credential.schema.json");
      const raw = readFileSync(schemaPath, "utf-8");
      schema = JSON.parse(raw) as JsonSchema;
    } catch (err) {
      // Req 1.7, 1.10: cannot read file → return error before checking root class
      const errnoErr = err as NodeJS.ErrnoException;
      const path = errnoErr.path ?? "achievement-credential.schema.json";
      return {
        ok: false,
        error: `Cannot read snapshot: ${path}`,
      };
    }

    // --- Step 2: Validate root class exists ---
    // The root class (AchievementCredential) is the top-level schema object itself.
    // Other classes live in $defs. We check both.
    const rootEntry = resolveClassEntry(schema, rootClass, rootClass);
    if (!rootEntry) {
      return {
        ok: false,
        error: `Root class not found: ${rootClass}`,
      };
    }

    // Ensure $defs is available for resolving references
    const defs = schema.$defs ?? {};

    // --- Step 3: BFS from root through $defs, cycle-safe via visited Set ---
    const nodes = new Map<string, GraphNode>();
    const visited = new Set<string>();
    const queue: string[] = [rootClass];

    while (queue.length > 0) {
      const className = queue.shift()!;
      if (visited.has(className)) continue;
      visited.add(className);

      const defEntry = resolveClassEntry(schema, className, rootClass);
      if (!defEntry) {
        // Referenced class is missing from $defs — this should be caught below,
        // but guard here too in case it slips through
        continue;
      }

      const node: GraphNode = {
        name: className,
        properties: new Map<string, GraphEdge>(),
        rawSchema: defEntry as Record<string, unknown>,
      };

      // Attach vocab IRI if available (Req 1.4, 1.5 — no error if absent)
      if (this.vocab) {
        const classRecord = this.vocab.classesByName.get(className);
        if (classRecord) {
          node.iri = classRecord.iri;
        }
      }

      nodes.set(className, node);

      // --- Step 4: Extract GraphEdges from properties ---
      if (defEntry.properties && typeof defEntry.properties === "object") {
        const required = Array.isArray(defEntry.required) ? (defEntry.required as string[]) : [];

        for (const [propName, propValue] of Object.entries(
          defEntry.properties as Record<string, unknown>,
        )) {
          const extracted = extractRefFromProperty(propValue);
          if (!extracted) continue;

          const { refName, isArray } = extracted;

          // Req 1.9: $ref points to missing $defs entry → return error
          // (root class itself can also be a valid target via self-ref, but it lives at top level)
          if (refName !== rootClass && !(refName in defs)) {
            return {
              ok: false,
              error: `Missing $defs entry: ${refName}`,
              path: [className, propName],
            };
          }

          const isRequired = required.includes(propName);

          const edge: GraphEdge = {
            propertyName: propName,
            targetClass: refName,
            cardinality: {
              minOccurs: isRequired ? 1 : 0,
              maxOccurs: isArray ? "unbounded" : 1,
            },
            isRequired,
            isArray,
          };

          node.properties.set(propName, edge);

          // Enqueue target for BFS traversal if not yet visited
          if (!visited.has(refName)) {
            queue.push(refName);
          }
        }
      }
    }

    // --- Step 5 (Req 1.8): Root class must have at least one outgoing $ref edge ---
    const rootNode = nodes.get(rootClass);
    if (!rootNode || rootNode.properties.size === 0) {
      return {
        ok: false,
        error: `Root class has no connected structure: ${rootClass}`,
      };
    }

    return {
      nodes,
      rootClass,
    };
  }
}

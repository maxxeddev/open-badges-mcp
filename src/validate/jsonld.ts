import jsonld from "jsonld";
import { createDocumentLoader } from "../crypto/document-loader.js";
import { getVocab } from "../vocab/index.js";
import type { ValidationError } from "./types.js";

/** Well-known predicate IRIs that should not be flagged as unknown */
const WELL_KNOWN_PREDICATES = new Set([
  "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
  "http://www.w3.org/2000/01/rdf-schema#label",
  "http://www.w3.org/2000/01/rdf-schema#comment",
  "https://www.w3.org/2018/credentials#credentialSubject",
  "https://www.w3.org/2018/credentials#issuer",
  "https://www.w3.org/2018/credentials#issuanceDate",
  "https://www.w3.org/2018/credentials#validFrom",
  "https://www.w3.org/2018/credentials#validUntil",
  "https://www.w3.org/2018/credentials#expirationDate",
  "https://www.w3.org/2018/credentials#credential",
  "https://www.w3.org/2018/credentials#credentialStatus",
  "https://www.w3.org/2018/credentials#credentialSchema",
  "https://www.w3.org/2018/credentials#evidence",
  "https://www.w3.org/2018/credentials#refreshService",
  "https://www.w3.org/2018/credentials#termsOfUse",
  "https://www.w3.org/2018/credentials#VerifiableCredential",
  "https://www.w3.org/2018/credentials#VerifiablePresentation",
  "https://w3id.org/security#proof",
  "https://schema.org/name",
  "https://schema.org/description",
  "https://schema.org/image",
]);

/**
 * Builds the set of known predicate IRIs from the local vocab graph
 * plus well-known RDF/VC predicates.
 */
function buildKnownPredicates(): Set<string> {
  const vocab = getVocab();
  const predicates = new Set(WELL_KNOWN_PREDICATES);

  // Add all property IRIs from the vocab store
  for (const prop of vocab.propertiesByName.values()) {
    predicates.add(prop.iri);
  }

  // Add all class IRIs from the vocab store (they appear as @type values in expanded form)
  for (const cls of vocab.classesByName.values()) {
    predicates.add(cls.iri);
  }

  return predicates;
}

/**
 * Recursively walks the expanded JSON-LD form and checks every predicate IRI
 * against the set of known predicates. Flags unknown predicates with their JSON path.
 */
function walkExpanded(
  nodes: unknown[],
  basePath: string,
  knownPredicates: Set<string>,
  errors: ValidationError[],
): void {
  if (!Array.isArray(nodes)) return;

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (!node || typeof node !== "object") continue;

    const currentPath = nodes.length > 1 ? `${basePath}/${i}` : basePath;

    for (const [predicate, value] of Object.entries(node as Record<string, unknown>)) {
      // Skip JSON-LD keywords (@id, @type, @value, @language, @graph, etc.)
      if (predicate.startsWith("@")) continue;

      if (!knownPredicates.has(predicate)) {
        errors.push({
          path: currentPath || "/",
          message: `Unknown predicate: ${predicate}`,
          severity: "warning",
        });
      }

      // Recurse into nested nodes
      if (Array.isArray(value)) {
        walkExpanded(value, `${currentPath}/${predicate}`, knownPredicates, errors);
      }
    }
  }
}

/**
 * Validates a JSON-LD document by expanding it with a custom offline document loader
 * and checking all predicate IRIs against the local vocab graph.
 *
 * Returns validation errors (unknown predicates) and the expanded form.
 */
export async function validateJsonLd(
  doc: Record<string, unknown>,
): Promise<{ errors: ValidationError[]; expanded: Record<string, unknown>[] }> {
  const documentLoader = createDocumentLoader();
  const errors: ValidationError[] = [];

  let expanded: Record<string, unknown>[];
  try {
    // biome-ignore lint/suspicious/noExplicitAny: jsonld types are incomplete
    expanded = (await (jsonld as any).expand(doc, {
      documentLoader,
    })) as Record<string, unknown>[];
  } catch (err) {
    errors.push({
      path: "/",
      message: `JSON-LD expansion failed: ${(err as Error).message}`,
      severity: "error",
    });
    return { errors, expanded: [] };
  }

  const knownPredicates = buildKnownPredicates();
  walkExpanded(expanded, "", knownPredicates, errors);

  return { errors, expanded };
}
